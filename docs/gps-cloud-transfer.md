# Move the MMS GPS server to a new Google Cloud account

A guided transfer to a **brand-new Google Cloud project**, while the old server remains available for rollback.

**Prepared: 7 November 2026.** This is an operator guide, not a completed migration. Its shell commands were checked for syntax locally. They have not been run against a new Google Cloud project or tested with a physical tracker as part of this documentation task. Read each expected result before continuing.

## 01 · Understand the move

**Where: planning desk — no account changes yet**

You are replacing the small server that receives tracker messages. You are not moving the whole MMS application.

| Part | After the transfer |
| --- | --- |
| GPS receiver | New Google account, new project, new VM and new public IP |
| API | Same Render service: https://motorpool-management-system-web.onrender.com |
| MMS website | Same Vercel site: https://um-mms-web.vercel.app |
| Database, GPS history, vehicles and tracker assignments | Same existing records; no export/import or re-registration |
| Tracker configuration | Change only the server IP; keep TCP port 5013 |
| MMS administrator login | Existing MMS account and permissions still apply |

The route becomes: **tracker → new Google Cloud VM, TCP 5013 → existing Render API → existing database → existing MMS website**.

The guide runs the old and new receivers together while you move one tracker at a time. The API accepts reports from either receiver using the existing private key. There is no automatic forwarding from the old IP to the new IP.

### Know the four work locations

| Label in this guide | What to use |
| --- | --- |
| **OLD ACCOUNT · Cloud Shell** | Google account that can administer project <code>um-mms-gps</code> |
| **NEW ACCOUNT · Cloud Shell** | Different Google account that owns the new project |
| **NEW VM · SSH** | Terminal opened through IAP to the new server |
| **PHONE / MMS** | SMS app that can message the tracker / existing MMS administrator login |

Use separate browser profiles or clearly named windows for the old and new accounts. Check the avatar and active account at every switch. Use Zen Browser for any MCP/OAuth authorization links. Opening a normal Google Cloud console page does not itself change resources.

### Only two new values to fill in

1. **NEW_PROJECT_ID:** the unique project ID you choose in step 03, not its display name or project number.
2. **NEW_IP:** the static public IPv4 address Google allocates in step 04.

Do not invent or copy the secret key into this guide. The private environment file carries it between the accounts.

### Existing server reference — verify before using

| Item | Reference |
| --- | --- |
| Old project | <code>um-mms-gps</code> |
| Old VM | <code>mms-gps-gateway</code> |
| Old zone | <code>us-central1-a</code> |
| Previous endpoint | <code>104.198.172.49:5013</code> |
| Service | <code>mms-gps-gateway.service</code> |

The old endpoint is a reference, not a live verification. If step 02 shows a different IP, use the verified address for rollback.

**Stop here if:** nobody can access the old VM, the existing configuration cannot be backed up, no one can send SMS to the trackers, or the current MMS administrator cannot view Tracker Logs.

## 02 · Back up the existing private configuration

**Where: OLD ACCOUNT · Cloud Shell, then your computer**

Open [Google Cloud Console](https://console.cloud.google.com/) with the old account. Choose project <code>um-mms-gps</code>. Click **Activate Cloud Shell** in the top bar. Authorize Cloud Shell if asked.

First check the account and server:

~~~bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud compute instances describe mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --format='table(name,status,networkInterfaces[0].accessConfigs[0].natIP)'
~~~

**Expected:** the old account email, VM status <code>RUNNING</code>, and its current public IP. Write down that IP as the rollback destination. If it differs from <code>104.198.172.49</code>, use the displayed address.

The next block finds the service's actual working directory. It never assumes a release folder and never displays the environment file.

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='set -eu
unit=mms-gps-gateway.service
systemctl is-active --quiet "$unit"
current_dir=$(systemctl show "$unit" --property=WorkingDirectory --value)
case "$current_dir" in /*) ;; *) echo "STOP: no absolute WorkingDirectory"; exit 1 ;; esac
sudo test -s "$current_dir/.env"
install -d -m 700 "$HOME/mms-transfer"
sudo cat "$current_dir/.env" > "$HOME/mms-transfer/gateway.env"
chmod 600 "$HOME/mms-transfer/gateway.env"
test -s "$HOME/mms-transfer/gateway.env"
printf "Private environment backup ready. Existing service remains running.\n"'
~~~

Now copy the private backup into the old account's Cloud Shell home directory, then download it:

~~~bash
install -d -m 700 "$HOME/mms-transfer"
gcloud compute scp \
  'mms-gps-gateway:~/mms-transfer/gateway.env' \
  "$HOME/mms-transfer/gateway.env" \
  --project=um-mms-gps --zone=us-central1-a
chmod 600 "$HOME/mms-transfer/gateway.env"
test -s "$HOME/mms-transfer/gateway.env"
cloudshell download "$HOME/mms-transfer/gateway.env"
~~~

Allow the browser download. Store <code>gateway.env</code> privately on your computer. Do not open it on screen, paste it into chat, email it, attach it to an issue, or upload it to this repository. It contains the existing <code>GPS_DEVICE_API_KEY</code> and preserves settings such as <code>SPEED_UNIT</code>.

Cloud Shell supports downloads by command and uploads from its **More → Upload** menu. File transfers use its home directory. [Google Cloud Shell file transfer guide](https://docs.cloud.google.com/shell/docs/uploading-and-downloading-files).

In MMS, record the pilot tracker's device ID, assigned vehicle and recent report time. The ID seen in Tracker Logs is the useful identifier; do not assume the printed IMEI is identical. Keep a private list of every tracker, including units currently powered off.

**Expected:** a nonempty private file on your computer, the old service still active, the old IP recorded, and an inventory of trackers.

**Stop if:** SSH/scp fails, the service is inactive, or no readable <code>.env</code> exists. Use the old VM's established access method. Do not loosen its firewall or recreate a key to get past this step.

## 03 · Create and prepare the new project

**Where: NEW ACCOUNT · Google Cloud Console, then Cloud Shell**

Switch to the new account's browser window. Confirm its avatar email.

1. Open the project selector at the top of Google Cloud Console.
2. Click **New Project**. Use a clear name such as “MMS GPS”.
3. Choose the project ID. Copy this exact ID as **NEW_PROJECT_ID**.
4. Create the project, select it, and open **Billing**.
5. Link an active billing account owned or authorized by the new account. Do this before enabling services.
6. Open **Billing → Budgets & alerts**. Create an **alerts-only** monthly budget scoped to the new project, with useful thresholds and a monitored recipient email.

An alerts-only budget sends notices; it does **not** cap spending or automatically stop this server. Confirm actual usage in Billing. [Google Cloud budget behavior](https://docs.cloud.google.com/billing/docs/how-to/budgets).

Open Cloud Shell in this new account. The following block asks for the project ID once and saves only that nonsecret ID and a guard function. The function rejects the old project before any resource creation.

~~~bash
install -d -m 700 "$HOME/mms-transfer"
cat > "$HOME/mms-transfer/set-new-project.sh" <<'BASH'
#!/usr/bin/env bash
set -Eeuo pipefail
read -r -p 'Paste NEW project ID: ' NEW_PROJECT_ID
[[ $NEW_PROJECT_ID =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || {
  echo 'STOP: enter the project ID, not its name or number.' >&2; exit 1;
}
[[ $NEW_PROJECT_ID != um-mms-gps ]] || {
  echo 'STOP: the old project is forbidden.' >&2; exit 1;
}
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud projects describe "$NEW_PROJECT_ID" --format='table(projectId,name,lifecycleState)'
printf 'NEW_PROJECT_ID=%q\n' "$NEW_PROJECT_ID" > "$HOME/mms-transfer/new-project.sh"
cat >> "$HOME/mms-transfer/new-project.sh" <<'GUARD'
require_new_project() {
  [[ $NEW_PROJECT_ID =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ && $NEW_PROJECT_ID != um-mms-gps ]] || {
    echo 'STOP: invalid or old project ID.' >&2; return 1;
  }
  [[ $(gcloud projects describe "$NEW_PROJECT_ID" --format='value(projectId)') = "$NEW_PROJECT_ID" ]] || {
    echo 'STOP: project could not be verified.' >&2; return 1;
  }
}
GUARD
chmod 600 "$HOME/mms-transfer/new-project.sh"
BASH
bash "$HOME/mms-transfer/set-new-project.sh"
~~~

**Expected:** the new account email, the new ID and project state <code>ACTIVE</code>. Check them before the next block.

~~~bash
bash <<'BASH'
set -Eeuo pipefail
source "$HOME/mms-transfer/new-project.sh"
require_new_project
billing_enabled=$(gcloud billing projects describe "$NEW_PROJECT_ID" \
  --format='value(billingEnabled)')
[[ $billing_enabled = True || $billing_enabled = true ]] || {
  echo 'STOP: link billing to the new project first.' >&2; exit 1;
}
gcloud config set project "$NEW_PROJECT_ID"
gcloud services enable compute.googleapis.com iap.googleapis.com \
  --project="$NEW_PROJECT_ID"
BASH
~~~

**Expected:** service enablement completes successfully in the new project.

The person who created a project normally has the needed project permissions. For a delegated operator, a project administrator must grant permission to create Compute resources and enable services, plus **IAP-secured Tunnel User** and the appropriate Compute SSH permissions. If OS Login is enforced, ask the administrator for the required OS Login role, including sudo access for installation. Do not disable an organization policy to bypass an access error. [IAP roles and SSH requirements](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding).

**Stop if:** the email is the old account, the project ID is <code>um-mms-gps</code>, billing is not linked, or permission/policy errors appear. Fix the specific access issue before continuing.

## 04 · Build the new receiver's network and VM

**Where: NEW ACCOUNT · Cloud Shell**

This creates resources only in the guarded new project. Copy the whole block once. If a command fails, stop and inspect the error. Do not repeatedly create resources with different names.

~~~bash
bash <<'BASH'
set -Eeuo pipefail
source "$HOME/mms-transfer/new-project.sh"
require_new_project

gcloud compute networks create mms-gps-network \
  --project="$NEW_PROJECT_ID" --subnet-mode=custom
gcloud compute networks subnets create mms-gps-subnet \
  --project="$NEW_PROJECT_ID" --network=mms-gps-network \
  --region=us-central1 --range=10.20.0.0/24

gcloud compute firewall-rules create mms-gps-allow-trackers \
  --project="$NEW_PROJECT_ID" --network=mms-gps-network \
  --direction=INGRESS --action=ALLOW --rules=tcp:5013 \
  --source-ranges=0.0.0.0/0 --target-tags=mms-gps-gateway
gcloud compute firewall-rules create mms-gps-allow-iap-ssh \
  --project="$NEW_PROJECT_ID" --network=mms-gps-network \
  --direction=INGRESS --action=ALLOW --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=mms-gps-gateway

gcloud compute addresses create mms-gps-ip \
  --project="$NEW_PROJECT_ID" --region=us-central1 \
  --network-tier=STANDARD --ip-version=IPV4
NEW_IP=$(gcloud compute addresses describe mms-gps-ip \
  --project="$NEW_PROJECT_ID" --region=us-central1 --format='value(address)')
test -n "$NEW_IP"

gcloud compute instances create mms-gps-gateway \
  --project="$NEW_PROJECT_ID" --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --network=mms-gps-network --subnet=mms-gps-subnet \
  --network-tier=STANDARD --address="$NEW_IP" \
  --tags=mms-gps-gateway --no-service-account --no-scopes

printf '\nNEW_IP=%s\n' "$NEW_IP"
gcloud compute instances describe mms-gps-gateway \
  --project="$NEW_PROJECT_ID" --zone=us-central1-a \
  --format='table(name,status,networkInterfaces[0].accessConfigs[0].natIP)'
BASH
~~~

**Expected:** <code>RUNNING</code>, with the same IP as <code>NEW_IP</code>. Write down this second worksheet value.

The static address stays assigned for tracker use. Address and VM network tiers must match; both are Standard here. [Google static external IP guidance](https://docs.cloud.google.com/compute/docs/ip-addresses/configure-static-external-ip-address).

TCP 5013 accepts tracker connections from public IPv4 networks because carrier source addresses can vary. SSH port 22 accepts only Google's IAP forwarding range <code>35.235.240.0/20</code>. The rules target the tagged VM in this custom VPC; they do not open SSH to the whole internet. [Google IAP firewall requirements](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding).

The VM has no Google service account and no OAuth scopes. The gateway authenticates to MMS using the preserved device key, not a Google API credential.

**Stop if:** the displayed IP is empty or mismatched, the VM is not running, the image is unavailable, or a quota/organization policy blocks creation. Do not use another zone, larger VM, different disk or open SSH rule without reviewing the consequence.

### Cost checkpoint

An eligible <code>e2-micro</code> in <code>us-central1</code> and up to 30 GB-months of standard persistent disk can fall within Free Tier limits. Eligibility and allowance apply at the billing-account level; overlapping VMs can exceed the allowance. “Free Tier VM” does not mean this complete setup is free. [Current Free Tier terms](https://docs.cloud.google.com/free/docs/free-cloud-features).

External IPv4 and outbound traffic can add charges. At the checked USD rate, an in-use static IPv4 is $0.005/hour, about $3.65 for 730 hours, before taxes, currency conversion or other usage. An unattached reserved address can cost more. A static address attached to a stopped VM is still considered in use for IP billing; the VM's persistent disk also remains allocated. Keep the old setup only as long as operationally needed. [Google network and IPv4 pricing](https://docs.cloud.google.com/vpc/network-pricing).

## 05 · Upload the private file to the new VM

**Where: NEW ACCOUNT · Cloud Shell**

In the new account's Cloud Shell, choose **More (⋮) → Upload → Choose files**. Select the private <code>gateway.env</code> downloaded in step 02. Upload it into the Cloud Shell home directory. Do not paste its contents into the terminal or editor.

Then copy it to the VM through IAP:

~~~bash
bash <<'BASH'
set -Eeuo pipefail
source "$HOME/mms-transfer/new-project.sh"
require_new_project
test -s "$HOME/gateway.env"
chmod 600 "$HOME/gateway.env"
gcloud compute scp "$HOME/gateway.env" 'mms-gps-gateway:~/gateway.env' \
  --project="$NEW_PROJECT_ID" --zone=us-central1-a --tunnel-through-iap
BASH
~~~

**Expected:** a successful file transfer. The file is kept private and will be installed with permission <code>600</code>.

To connect, run:

~~~bash
source "$HOME/mms-transfer/new-project.sh"
require_new_project
gcloud compute ssh mms-gps-gateway \
  --project="$NEW_PROJECT_ID" --zone=us-central1-a --tunnel-through-iap
~~~

Accept a first-use SSH host-key prompt only when it refers to this new VM. Wait a minute and retry if SSH is not yet ready. A normal Google SSH username is expected; it does not have to be <code>ubuntu</code>.

**Stop if:** IAP or SSH permission is denied. Check the new project ID, IAP API, IAP role, Compute SSH permissions and the TCP 22 rule. Do not change the rule to <code>0.0.0.0/0</code>. [Google IAP connection guide](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding).

## 06 · Install the receiver on the fresh VM

**Where: NEW VM · SSH**

Keep the old receiver running. This step installs a separate receiver and does not send any tracker SMS.

The existing <code>apps/gps-gateway/deploy/update-existing.sh</code> expects an already installed service and readable working directory. It cannot bootstrap an empty VM. Use the complete first-install script below.

It pins gateway release **2af8a90624200932c886043f8b7525432b1b36a9**, installs **Node 24** and **pnpm 10.27.0**, builds the shared package and gateway with a filtered frozen-lockfile install, then copies the three runtime packages using the repository's fixed packager. It never runs <code>pnpm deploy --legacy</code>; that approach exhausted this micro VM's memory previously.

The script adds 1 GiB of temporary build swap only if the VM has no active swap. It does not change <code>/etc/fstab</code>. The runtime itself starts under systemd and does not depend on that swap or the SSH session.

### Copy the complete bootstrap script

Copy this whole block into the **new VM's SSH terminal**. It writes a script file; it does not run it yet.

~~~bash
cat > "$HOME/gps-cloud-transfer-bootstrap.sh" <<'MMS_BOOTSTRAP'
#!/usr/bin/env bash
# First installation only. Run as the IAP SSH user on the new Ubuntu 24.04 VM.
# No cloud resources are created here. The existing private .env is an input file.
set -Eeuo pipefail
umask 077

expected_project=${1:-}
env_file=${2:-"$HOME/gateway.env"}
release_sha=2af8a90624200932c886043f8b7525432b1b36a9
unit=mms-gps-gateway.service

fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
[[ $expected_project =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] ||
  fail 'Usage: bash gps-cloud-transfer-bootstrap.sh NEW_PROJECT_ID /path/to/gateway.env'
[[ $expected_project != um-mms-gps ]] || fail 'The old project is forbidden.'
(( EUID != 0 )) || fail 'Run as your normal SSH user, without sudo before bash.'
[[ -f $env_file && -r $env_file && -s $env_file ]] || fail 'Private gateway.env is missing or empty.'
[[ $HOME = /* && $HOME != *[[:space:]%]* ]] || fail 'This installer requires a home path without whitespace or %.'

# Query the VM itself, rather than trusting the shell prompt or gcloud defaults.
actual_project=$(curl --fail --silent --show-error --max-time 10 \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/project/project-id)
[[ $actual_project = "$expected_project" ]] || fail 'VM project differs from NEW_PROJECT_ID.'
actual_name=$(curl --fail --silent --show-error --max-time 10 \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/name)
[[ $actual_name = mms-gps-gateway ]] || fail 'Unexpected VM name.'
actual_zone=$(curl --fail --silent --show-error --max-time 10 \
  -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/zone)
[[ ${actual_zone##*/} = us-central1-a ]] || fail 'Unexpected VM zone; expected us-central1-a.'
[[ $(uname -m) = x86_64 ]] || fail 'This installer expects amd64/x86_64.'
. /etc/os-release
[[ $ID = ubuntu && $VERSION_ID = 24.04 ]] || fail 'This installer expects Ubuntu 24.04 LTS.'
[[ $(systemctl show "$unit" --property=LoadState --value) = not-found ]] ||
  fail 'A gateway unit already exists. Do not use the first-install script for updates.'
[[ ! -e /etc/systemd/system/$unit && ! -e /etc/systemd/system/$unit.d ]] ||
  fail 'A gateway unit or drop-in already exists.'
sudo -v
chmod 600 "$env_file"

release_base="$HOME/.local/share/mms-gps-releases"
mkdir -p "$release_base"
release_dir=$(mktemp -d "$release_base/$release_sha.XXXXXX")
runtime="$release_dir/runtime"
trap 'printf "STOP: installer failed near line %s. Keep the old gateway running.\n" "$LINENO" >&2' ERR

sudo env DEBIAN_FRONTEND=noninteractive apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar
# Download the official NodeSource Node 24 installer; do not print the private env.
curl --fail --silent --show-error --location --retry 2 \
  https://deb.nodesource.com/setup_24.x --output "$release_dir/nodesource-setup.sh"
sudo env DEBIAN_FRONTEND=noninteractive bash "$release_dir/nodesource-setup.sh"
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
sudo npm install --global pnpm@10.27.0
[[ $(node -p 'process.versions.node.split(".")[0]') = 24 ]] || fail 'Node 24 installation failed.'
[[ $(pnpm --version) = 10.27.0 ]] || fail 'Unexpected pnpm version.'

# A small VM can need swap during TypeScript builds. This swap lasts until reboot.
# It changes no fstab entry and is separate from the persistent packet-log spool.
if [[ -z $(swapon --show=NAME --noheadings) ]]; then
  swap_file="$release_dir/build.swap"
  sudo fallocate -l 1G "$swap_file"
  sudo chmod 600 "$swap_file"
  sudo mkswap "$swap_file" >/dev/null
  sudo swapon "$swap_file"
fi

mkdir "$release_dir/source"
curl --fail --silent --show-error --location --retry 2 \
  "https://codeload.github.com/Code-Box-Studios/motorpool-management-system-web/tar.gz/$release_sha" \
  --output "$release_dir/source.tar.gz"
tar -xzf "$release_dir/source.tar.gz" --strip-components=1 -C "$release_dir/source"
cd "$release_dir/source"
pnpm install --frozen-lockfile --filter '@mms/gps-gateway...' \
  --child-concurrency=1 --network-concurrency=4
pnpm --filter '@mms/gps-gateway...' build
# Copy the three installed runtime packages without a second dependency resolver.
# Do not replace this with `pnpm deploy --legacy` on the micro VM.
node --max-old-space-size=64 apps/gps-gateway/deploy/package-runtime.mjs "$runtime"
install -m 600 "$env_file" "$runtime/.env"

cd "$runtime"
node --input-type=module <<'JS'
import 'dotenv/config';
import { loadConfig } from './dist/config.js';
await import('./dist/gateway.js');
const config = loadConfig();
if (config.tcpPort !== 5013) throw new Error('Expected preserved TCP port 5013.');
if (config.apiUrl !== 'https://motorpool-management-system-web.onrender.com')
  throw new Error('Preserved MMS_API_URL is not the expected existing Render API.');
const response = await fetch(`${config.apiUrl}/api/gps/packet-logs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-device-api-key': config.deviceApiKey },
  body: '{}',
  signal: AbortSignal.timeout(15000)
});
await response.body?.cancel();
if (response.status !== 400)
  throw new Error(`Packet-log API preflight failed: HTTP ${response.status}`);
console.log('Runtime, preserved configuration, and authenticated API preflight passed (HTTP 400).');
JS

service_user=$(id -un)
cat > "$release_dir/$unit" <<EOF
[Unit]
Description=MMS GPS gateway (H02 TCP to existing MMS API)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory="$runtime"
ExecStart=/usr/bin/env PACKET_LOG_DIR=/var/lib/mms-gps-gateway /usr/bin/node "$runtime/dist/main.js"
Environment=PACKET_LOG_DIR=/var/lib/mms-gps-gateway
StateDirectory=mms-gps-gateway
StateDirectoryMode=0700
UMask=0077
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
sudo install -m 644 "$release_dir/$unit" "/etc/systemd/system/$unit"
sudo systemctl daemon-reload
sudo systemctl enable --now "$unit"

# An empty TCP connection checks readiness without inventing a tracker packet.
node --input-type=module <<'JS'
import net from 'node:net';
import { setTimeout } from 'node:timers/promises';
for (let attempt = 0; ; attempt++) {
  try {
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port: 5013 });
      socket.setTimeout(2000);
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', reject);
      socket.once('timeout', () => socket.destroy(new Error('Listener check timed out')));
    });
    break;
  } catch (error) {
    if (attempt >= 9) throw error;
    await setTimeout(1000);
  }
}
JS
sleep 5
systemctl is-active --quiet "$unit"
systemctl is-enabled --quiet "$unit"
printf 'READY: new project %s; release %s; TCP 5013 active.\n' "$actual_project" "$release_sha"
printf 'Runtime: %s\n' "$runtime"
printf 'Keep the old gateway running. Next: verify external TCP, then move one pilot tracker.\n'
MMS_BOOTSTRAP
chmod 700 "$HOME/gps-cloud-transfer-bootstrap.sh"
~~~

This same script is also available as [gps-cloud-transfer-bootstrap.sh](gps-cloud-transfer-bootstrap.sh). The HTML guide contains the entire script and can be used on its own.

The installer uses the VM metadata service to check its actual project, VM name and zone before changing anything. The project must match the ID you supply, the VM must be <code>mms-gps-gateway</code>, and the zone must be <code>us-central1-a</code>. It rejects <code>um-mms-gps</code> before installation and refuses an existing gateway service. [Google metadata query format](https://docs.cloud.google.com/compute/docs/metadata/querying-metadata). Node 24 installation follows the official [NodeSource setup script](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_24.x).

### Run the script

Paste the same new project ID used in step 03 when asked. Run as your normal SSH user; do not put <code>sudo</code> before <code>bash</code>.

~~~bash
read -r -p 'Paste the same NEW project ID: ' NEW_PROJECT_ID
bash "$HOME/gps-cloud-transfer-bootstrap.sh" "$NEW_PROJECT_ID" "$HOME/gateway.env"
~~~

Installation can take several minutes. The source archive is downloaded at the pinned SHA. The small runtime includes <code>@mms/shared</code>, <code>dotenv</code> and <code>zod</code> alongside the compiled gateway.

**Expected:** a line ending with <code>authenticated API preflight passed (HTTP 400)</code>, followed by <code>READY: new project …; release …; TCP 5013 active.</code>

**Why HTTP 400 is correct here:** the installer sends authenticated <code>POST {}</code> to the existing packet-log endpoint. The correct key reaches body validation, which rejects the intentionally incomplete body. No test packet is created. A <code>401</code>, <code>404</code>, <code>500</code>, timeout, or any status other than <code>400</code> is a failed preflight.

The script preserves the uploaded file, including <code>GPS_DEVICE_API_KEY</code> and <code>SPEED_UNIT</code>. The service forces only <code>PACKET_LOG_DIR=/var/lib/mms-gps-gateway</code> through its start command, so a value in the copied file cannot redirect the durable spool elsewhere. systemd creates that state directory for the actual SSH user.

**Stop if:** installation reports <code>STOP</code>, build/download errors, or a failed API check. Do not change the Render API, web deployment, database or private key to make a failed transfer appear successful. If a unit was created before a later failure, do not rerun the first-install script; inspect the service and get maintainer help.

## 07 · Verify the new server before sending SMS

**Where: NEW VM · SSH, then NEW ACCOUNT · Cloud Shell**

In the VM SSH terminal:

~~~bash
systemctl is-active mms-gps-gateway.service
systemctl is-enabled mms-gps-gateway.service
sudo ss -ltnp 'sport = :5013'
sudo journalctl -u mms-gps-gateway.service -n 30 --no-pager
~~~

**Expected:** <code>active</code>, <code>enabled</code>, a listener on TCP 5013, and <code>GPS gateway listening on tcp/5013</code>. No repeated startup, authentication, upload, or spool-write errors.

This proves service readiness, not a real tracker connection. An empty TCP check also does not create a tracker record.

Type <code>exit</code> to leave SSH and return to the **new account's Cloud Shell**. Run a public TCP check from there:

~~~bash
bash <<'BASH'
set -Eeuo pipefail
source "$HOME/mms-transfer/new-project.sh"
require_new_project
NEW_IP=$(gcloud compute addresses describe mms-gps-ip \
  --project="$NEW_PROJECT_ID" --region=us-central1 --format='value(address)')
test -n "$NEW_IP"
python3 - "$NEW_IP" <<'PY'
import socket, sys
with socket.create_connection((sys.argv[1], 5013), timeout=10):
    print("PASS: new public IP accepts TCP 5013.")
PY
BASH
~~~

**Expected:** <code>PASS: new public IP accepts TCP 5013.</code> A timeout means stop: compare the reserved IP, VM IP, network tag, TCP 5013 rule and service listener.

Closing Cloud Shell, the SSH tab or your browser does not stop this VM or the systemd service. Cloud Shell is the control terminal; the VM is the continuously running server.

**Before the next step:** confirm the old receiver is still available, both IPs are recorded, and rollback SMS is ready.

## 08 · Move one pilot tracker

**Where: PHONE / MMS, with NEW VM · SSH open for verification**

Choose one powered tracker you can physically check. Keep the rest on the old IP.

1. In MMS, note the pilot's exact device ID and current latest report time.
2. Send <code>RCONF</code> to the pilot tracker. Privately record its current server IP/port and working settings.
3. Prepare the rollback SMS before making any change.
4. Send the new server command using **NEW_IP from step 04**.

For a tracker that still uses the factory SMS password <code>0000</code>:

~~~text
8040000 NEW_IP 5013
~~~

Replace <code>NEW_IP</code> with the actual number. Do not send those letters. The command has spaces between the command, IP and port.

If this tracker's SMS password was changed, use its current password in the device's <code>804&lt;password&gt; &lt;IP&gt; &lt;port&gt;</code> command format. Prepare and check that exact command before sending it. Do not reset the password.

Then send:

~~~text
RCONF
~~~

**Expected:** an acknowledgement such as <code>SET OK</code>, and <code>RCONF</code> showing the new IP and port <code>5013</code>.

**Keep the working APN, upload interval (currently 5,5), tracker ID, mode and timezone unchanged.** Do not use this migration to “fix” other settings. Take the tracker outdoors for a valid GPS fix if needed.

An acknowledgement and <code>RCONF</code> prove that the tracker accepted a setting. They do not prove it connected to the new receiver or saved a position.

### Prove that the new VM receives traffic

Reconnect through IAP using step 05. In **NEW VM · SSH**, run while the pilot is powered:

~~~bash
sudo ss -tnp state established '( sport = :5013 )'
~~~

**Expected:** an established TCP connection with local port 5013. This proves a connection to the new VM, but the carrier peer IP is not a reliable tracker identity.

For direct pilot identification, the optional command below prints only H02 device IDs from traffic arriving at the new VM. It does not save a packet capture or print coordinates. Run it before the next pilot report:

~~~bash
sudo apt-get install -y tcpdump
sudo timeout 90 tcpdump -i any -nn -l -A -s 0 'tcp dst port 5013' |
  python3 -u -c 'import re, sys
for line in sys.stdin:
    for match in re.finditer(r"\*[^,\s]+,([^,\s]+),", line):
        print("H02 device ID:", match.group(1), flush=True)'
~~~

It ends after 90 seconds; a timeout exit code of 124 is normal. Duplicate IDs are harmless. The simple text filter can miss a header split across TCP segments. No output therefore requires further investigation; it is not proof that nothing arrived. Compare an observed ID with the pilot's ID in MMS.

### Prove that MMS saves fresh pilot reports

In the existing MMS administrator account:

1. Open **Tracker Devices → Tracker Logs**.
2. Filter/search for the pilot's exact device ID.
3. Check a **new receipt time after the SMS change**, its raw message/decoded fix and outcome.
4. For a valid position, expect outcome <code>saved</code> and the correct vehicle assignment.
5. Open the GPS map/history. Confirm a fresh position time for that same vehicle; move it safely and verify several subsequent updates.

**Critical evidence limit:** packet logs do not store a source-gateway identifier. While both VMs run, MMS “online” or a fresh log alone cannot identify which gateway received it. Pair MMS evidence with a connection on the new VM and, preferably, the ID-only observation above. If identity remains ambiguous, do not proceed; resolve it before moving more trackers.

**Pilot passes only when:** the new IP is confirmed in <code>RCONF</code>, the new VM receives the pilot, and MMS shows fresh saved positions for its correct vehicle. A heartbeat proves traffic but not a valid saved position.

**Stop if:** the new VM shows no receipt, the device ID is unexpected, the fix is invalid, the device is unassigned, or MMS times stop advancing. Keep all other trackers unchanged. Use rollback in step 11 if the pilot cannot be verified.

## 09 · Move the remaining trackers one by one

**Where: PHONE / MMS, with NEW VM · SSH available**

Repeat step 08 for each tracker. Check one device fully before changing the next.

Use a private checklist like this; the guide itself does not need SIM numbers, passwords or coordinates:

| Tracker / vehicle | RCONF has NEW_IP:5013 | Seen on new VM | Fresh MMS saved positions | Result |
| --- | --- | --- | --- | --- |
| Pilot | ☐ | ☐ | ☐ | Pending |
| Tracker 2 | ☐ | ☐ | ☐ | Pending |
| Tracker 3 | ☐ | ☐ | ☐ | Pending |

Keep unpowered, unreachable or parked devices **pending** until they return and pass the same checks. A device left on the old IP will lose reports when the old receiver stops.

**Expected:** every tracker in the inventory has a recorded successful check. The new VM's logs show no persistent upload errors.

**Stop if:** any device is still pending. Do not call the transfer complete or retire the old receiver.

## 10 · Stop the old receiver and complete the final proof

**Where: OLD ACCOUNT · Cloud Shell, then MMS and NEW VM · SSH**

Only begin after every tracker has passed step 09. Keep the old VM, disk, reserved IP and configuration available for rollback.

### Record the actual old spool before stopping the service

Do this while the old gateway is still running. Its packet logger keeps its spool directory open for durability checks. The command below finds that directory from the running Node process's open directory descriptors, rather than assuming a configuration path. It reads no environment values or packet contents.

It requires exactly one distinct, existing directory and checks that the process did not restart during inspection. Missing, deleted or ambiguous directories block retirement. The verified path is saved in a root-only record on the old VM; later counts use that same record.

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='sudo python3 -' <<'PY'
import os
from pathlib import Path
import stat
import subprocess

unit = "mms-gps-gateway.service"

def stop(message):
    raise SystemExit("STOP: " + message)

def main_pid():
    active = subprocess.run(["systemctl", "is-active", "--quiet", unit])
    if active.returncode != 0:
        stop("the old service must be active to discover its spool.")
    value = subprocess.check_output(
        ["systemctl", "show", unit, "--property=MainPID", "--value"], text=True
    ).strip()
    if not value.isdecimal() or int(value) <= 0:
        stop("the old service has no live MainPID.")
    return int(value)

def discover_spool(pid):
    process = Path("/proc") / str(pid)
    if Path(os.readlink(process / "exe")).name not in ("node", "nodejs"):
        stop("the service MainPID is not the expected Node gateway.")
    candidates = set()
    for descriptor in (process / "fd").iterdir():
        try:
            opened = descriptor.stat()
            if not stat.S_ISDIR(opened.st_mode):
                continue
            target = os.readlink(descriptor)
            if not target.startswith("/") or target.endswith(" (deleted)"):
                stop("an open directory is relative or deleted.")
            path = Path(target).resolve(strict=True)
            current = path.stat()
            if (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino):
                stop("an open directory no longer matches its path.")
            candidates.add(str(path))
        except FileNotFoundError:
            # A transient descriptor can close while /proc is being inspected.
            continue
    if len(candidates) != 1:
        stop("expected exactly one spool directory; maintainer verification is required.")
    return candidates.pop()

try:
    pid = main_pid()
    spool = discover_spool(pid)
    if main_pid() != pid or discover_spool(pid) != spool:
        stop("the old process or directory changed; inspect it again.")
    record_dir = Path("/var/lib/mms-gps-transfer")
    if record_dir.is_symlink():
        stop("the private record directory must not be a symlink.")
    record_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    if record_dir.stat().st_uid != 0:
        stop("the private record directory must be owned by root.")
    record_dir.chmod(0o700)
    record = record_dir / "spool-path"
    if record.is_symlink():
        stop("the spool path record must not be a symlink.")
    if record.exists():
        if record.read_text().rstrip("\n") != spool:
            stop("an earlier spool record differs; preserve and review both locations.")
    else:
        with record.open("x", encoding="utf-8") as output:
            output.write(spool + "\n")
    record.chmod(0o600)
    print("Verified old spool:", spool)
    print("Private spool path record saved. The old service is still running.")
except (OSError, subprocess.SubprocessError) as error:
    stop("spool inspection failed; do not retire the old VM: " + str(error))
PY
~~~

**Expected:** one verified absolute spool path and confirmation that the old service remains running. It may be <code>/var/lib/mms-gps-gateway</code> or a different directory. Only the directory actually held open by the running gateway is recorded.

**Stop if:** discovery fails or more than one directory is found. Do not use an empty directory at a guessed path as evidence that the queue drained. Ask the maintainer to verify the old process's effective spool configuration and recover every pending location before retirement.

### Stop the old receiver

Stop the **old service**, using the old account and an explicit old project:

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='set -eu
sudo test -s /var/lib/mms-gps-transfer/spool-path
sudo systemctl stop mms-gps-gateway.service
systemctl is-active mms-gps-gateway.service || true'
~~~

**Expected:** <code>inactive</code>. This stops the receiver process, not the VM. It does not release its IP or remove its disk.

Now verify in MMS that **every powered tracker produces fresh saved position reports after the old service stopped**. Wait for several expected reporting cycles and move the pilot safely again. Check the new VM's established connections and logs. With the old receiver stopped, these fresh reports provide a stronger final check that service continues through the new receiver.

### Drain the old packet-log spool before retirement

Pending packets are files on the old disk, not necessarily present in the MMS database yet. Count them in the actual spool path recorded above, without displaying payloads:

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='sudo python3 -' <<'PY'
from pathlib import Path

try:
    record = Path("/var/lib/mms-gps-transfer/spool-path")
    if record.is_symlink() or not record.is_file():
        raise SystemExit("STOP: no verified private spool path record.")
    value = record.read_text().rstrip("\n")
    spool = Path(value)
    if not spool.is_absolute() or not spool.is_dir():
        raise SystemExit("STOP: the recorded spool directory is missing or invalid.")
    entries = list(spool.iterdir())
    pending = [p for p in entries if p.name.endswith(".json")]
    temporary = [p for p in entries if p.name.endswith(".json.tmp")]
    if any(not p.is_file() for p in pending + temporary):
        raise SystemExit("STOP: an unexpected queue entry requires maintainer review.")
    print("Recorded old spool:", spool)
    print("Pending JSON files:", len(pending))
    print("Temporary JSON files:", len(temporary))
except OSError as error:
    raise SystemExit("STOP: cannot inspect the recorded spool: " + str(error))
PY
~~~

**Expected:** both counts are <code>0</code> while the old service is stopped.

If either count is nonzero, keep the old VM and disk. Restart its service to allow its existing uploader to retry; this does not change any tracker IP:

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='sudo systemctl start mms-gps-gateway.service
sudo journalctl -u mms-gps-gateway.service -n 40 --no-pager'
~~~

Wait for successful upload and repeat the same count command, which reads the captured path from <code>/var/lib/mms-gps-transfer/spool-path</code>. Stop the old service again using the stop block above, then repeat the same count command once more. Both counts must remain zero in that same recorded directory. Then repeat the fresh-report check in MMS with the old service stopped. Do not overwrite the path record or delete queued files to get a zero count.

If discovery was unresolved, the recorded directory is missing, a temporary file cannot recover, or uploads keep failing, retirement remains blocked. Ask the maintainer to locate and recover the old spool, including any older configured location. A missing directory or an empty assumed default directory is not evidence that there are no pending packets.

### Acceptance checklist

- [ ] Every inventoried tracker was changed and verified; no unpowered device remains pending.
- [ ] Every tracker is still linked to its original correct MMS vehicle.
- [ ] The old service is stopped.
- [ ] New saved reports continue with the old service stopped.
- [ ] The actual old spool was recorded from the running gateway before stopping; its <code>.json</code> and <code>.json.tmp</code> counts are zero after stopping.
- [ ] The new service is active, enabled and free of repeated upload/spool errors.
- [ ] The person responsible for MMS accepts the transfer and rollback/backup retention plan.

**Do not delete the old project, VM, disk, IP or configuration before explicit acceptance.** This guide intentionally contains no resource-deletion commands. After acceptance, have the owner/maintainer review remaining costs and perform a separately approved retirement. Stopping a VM alone still leaves disk and static-IP charges. Private environment copies should be kept securely until the owner approves their disposal.

## 11 · Roll back if needed

**Where: OLD ACCOUNT · Cloud Shell, then PHONE / MMS**

Restore the old receiver first:

~~~bash
gcloud compute ssh mms-gps-gateway \
  --project=um-mms-gps --zone=us-central1-a \
  --command='sudo systemctl start mms-gps-gateway.service
systemctl is-active mms-gps-gateway.service'
~~~

**Expected:** <code>active</code>. If the VM itself was stopped later, its owner must start it and verify its IP before sending rollback SMS.

For each tracker already moved, send the rollback server command. With factory password <code>0000</code> and the previously recorded old IP unchanged:

~~~text
8040000 104.198.172.49 5013
RCONF
~~~

If step 02 found another current old IP, substitute it. If the SMS password was changed, use that tracker's correct current password. Do not change APN, interval, identity or timezone.

Verify the old IP in <code>RCONF</code>, an established connection on the old VM, and fresh MMS saved positions. Keep the new VM available for diagnosis. No database rollback or reassignment is needed because the API and database were never moved.

**Stop if:** the old endpoint is unavailable or its public IP changed. Do not send trackers toward an unverified destination.

## 12 · Troubleshooting and common questions

### New VM is active, but no packets arrive

Confirm <code>RCONF</code> has the new IP and TCP 5013. Check the new reserved IP matches the VM, its tag is <code>mms-gps-gateway</code>, its TCP 5013 firewall rule uses the custom network, and the service listens. Ensure the tracker has power, SIM data service, its unchanged working APN, and cellular coverage. Public TCP reachability from Cloud Shell proves the server port is reachable; it does not prove carrier connectivity.

### Packets arrive, but the map does not update

Use Tracker Logs. <code>invalid_fix</code> needs a valid GPS fix; <code>device_unavailable</code> needs the existing active tracker/vehicle assignment checked; <code>resolution_error</code> or <code>forward_error</code> needs API connectivity investigated. A heartbeat is not a saved position. Preserve the device identity and settings while diagnosing.

### API preflight gives 401, 404, 500 or a timeout

Stop installation. <code>401</code> usually means the uploaded key does not match the existing API. <code>404</code> can mean the packet-log endpoint is not deployed or the URL is wrong. <code>500</code> needs API configuration/log checks. A timeout can indicate network or sleeping/unavailable API behavior. The expected Render API must already support packet logs. Do not replace the real key with a sample or invent a new one during transfer.

### The bootstrap stopped, or it says a gateway unit already exists

Do not keep rerunning a fresh installer. Check:

~~~bash
systemctl status mms-gps-gateway.service --no-pager
sudo journalctl -u mms-gps-gateway.service -n 80 --no-pager
free -h
df -h
~~~

Share the error text with the maintainer, without sharing the private environment file. A successful first installation can use the existing updater for future releases; that is a separate operation.

### Will closing the browser turn tracking off?

No. The new VM runs continuously, and systemd starts the gateway at boot. Cloud Shell and SSH are remote control sessions. Closing them does not stop the server. Stopping/deleting the VM or stopping its service does affect tracking.

### Does the new Google account become an MMS administrator?

No. Google Cloud permissions control cloud resources. MMS permissions belong to the existing MMS accounts. Use the established MMS administrator login; request a separate MMS role change from its owner if needed.

### Will old GPS history or vehicle assignments disappear?

No data migration is part of this procedure. The same API writes to the same database. Keep existing tracker identifiers and vehicle assignments. The guide does not change Render, Vercel or database configuration.

### Can we keep 104.198.172.49 instead?

Possibly, through an advanced static IPv4 transfer. Google permits moves between projects in the same **or different organizations**, with permissions in both projects. The address must be reserved/static, external IPv4 and detached from every resource; the destination needs available address quota, and address-move system limits must be greater than zero. Regional addresses remain in their region; Google currently documents a 20-minute wait after unassignment before a regional move. [Google's complete IP move requirements](https://docs.cloud.google.com/vpc/docs/move-ip-address-different-project).

That route needs a planned outage and a separately reviewed procedure. Do not release/delete the old address to try to reserve the same number again. The default in this guide uses a new IP so both receivers can run during pilot testing.

### Is it free? Do budget alerts prevent charges?

No guarantee. Check billing-account eligibility and current pricing; IPv4, traffic, overlapping servers and retained disks can cost money. The alerts-only budget in this guide is a notification system, not a spending cap. Review [Free Tier limits](https://docs.cloud.google.com/free/docs/free-cloud-features), [network/IP pricing](https://docs.cloud.google.com/vpc/network-pricing) and [budget behavior](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## 13 · Reference and completion record

**Where: operator's private handover notes**

Keep a record of the new project ID, new static IP, verified old rollback IP, transfer date, operator, tracker checklist, pinned release SHA, final MMS report times and explicit acceptance. Do not include secret keys, passwords, private coordinates or raw environment files in a public handover.

### Official sources checked for this guide

- [Move an external IPv4 address between projects](https://docs.cloud.google.com/vpc/docs/move-ip-address-different-project)
- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Configure a static external IP](https://docs.cloud.google.com/compute/docs/ip-addresses/configure-static-external-ip-address)
- [Upload and download Cloud Shell files](https://docs.cloud.google.com/shell/docs/uploading-and-downloading-files)
- [Budgets and alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Free Tier terms](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Query VM metadata](https://docs.cloud.google.com/compute/docs/metadata/querying-metadata)
- [Network and IPv4 pricing](https://docs.cloud.google.com/vpc/network-pricing)
- [Official NodeSource Node 24 installer](https://github.com/nodesource/distributions/blob/master/scripts/deb/setup_24.x)

### Repository references

- <code>apps/gps-gateway/deploy/update-existing.sh</code> — existing-service updater and authenticated, non-writing API preflight.
- <code>apps/gps-gateway/deploy/package-runtime.mjs</code> — portable runtime packager; copies three installed production packages.
- <code>apps/gps-gateway/src/config.ts</code> — gateway configuration, including the private key, speed unit and spool path.
- <code>apps/gps-gateway/src/packet-log.ts</code> — local disk queue and upload retry behavior.
- [New tracker setup](new-gps-tracker-setup.md) — separate onboarding reference; this transfer preserves already working settings.

**Guide verification scope:** local shell syntax, document links/structure and HTML behavior can be checked without touching Google Cloud. Only a real operator-run transfer and real tracker evidence can establish a successful migration.

