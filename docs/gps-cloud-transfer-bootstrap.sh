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
