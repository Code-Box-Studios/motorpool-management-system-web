#!/usr/bin/env bash
# Run on the existing VM after the matching API release is live.
# Builds a separate release, preserves the current .env, and rolls back failed starts.
set -Eeuo pipefail
umask 077

release_sha=${1:-}
if [[ ! $release_sha =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: bash update-existing.sh <full Git commit SHA>' >&2
  exit 2
fi

unit=mms-gps-gateway.service
current_dir=$(systemctl show "$unit" --property=WorkingDirectory --value)
service_user=$(systemctl show "$unit" --property=User --value)
if [[ -n $service_user && $service_user != "$(id -un)" && $service_user != root ]]; then
  echo 'Run as the existing gateway service user so the private release remains readable.' >&2
  exit 1
fi
if [[ ! $current_dir = /* || ! -r $current_dir/.env ]]; then
  echo 'The existing gateway WorkingDirectory must contain a readable .env. No service changes made.' >&2
  exit 1
fi
for executable in node pnpm curl tar sudo env; do
  command -v "$executable" >/dev/null
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
systemctl is-active --quiet "$unit"

release_base=${MMS_GATEWAY_RELEASE_ROOT:-"$HOME/.local/share/mms-gps-releases"}
mkdir -p "$release_base"
release_dir=$(mktemp -d "$release_base/$release_sha.XXXXXX")
runtime="$release_dir/runtime"
mkdir "$release_dir/source"
curl --fail --silent --show-error --location --retry 2 \
  "https://codeload.github.com/Code-Box-Studios/motorpool-management-system-web/tar.gz/$release_sha" \
  --output "$release_dir/source.tar.gz"
tar -xzf "$release_dir/source.tar.gz" --strip-components=1 -C "$release_dir/source"
cd "$release_dir/source"
pnpm install --frozen-lockfile --filter '@mms/gps-gateway...'
pnpm --filter '@mms/gps-gateway...' build
node --max-old-space-size=64 apps/gps-gateway/deploy/package-runtime.mjs "$runtime"
install -m 600 "$current_dir/.env" "$runtime/.env"

# Validate dependencies, configuration and the deployed upload endpoint without
# storing a test packet or printing the private device key.
cd "$runtime"
node --input-type=module <<'JS'
import 'dotenv/config';
import { loadConfig } from './dist/config.js';
await import('./dist/gateway.js');
const config = loadConfig();
const response = await fetch(`${config.apiUrl}/api/gps/packet-logs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-device-api-key': config.deviceApiKey },
  body: '{}',
  signal: AbortSignal.timeout(10000)
});
if (response.status !== 400) throw new Error(`Packet-log API preflight failed: HTTP ${response.status}`);
console.log('Runtime, configuration, and packet-log API checks passed.');
JS

dropin_dir="/etc/systemd/system/$unit.d"
dropin="$dropin_dir/60-mms-release.conf"
had_previous=false
if sudo test -f "$dropin"; then
  sudo cat "$dropin" > "$release_dir/previous-dropin.conf"
  had_previous=true
fi
switched=false
rollback() {
  result=$?
  trap - EXIT
  if (( result != 0 )) && [[ $switched = true ]]; then
    echo 'Gateway update failed; restoring the previous service configuration.' >&2
    if [[ $had_previous = true ]]; then
      sudo install -m 644 "$release_dir/previous-dropin.conf" "$dropin"
    else
      sudo rm -f "$dropin"
    fi
    sudo systemctl daemon-reload
    sudo systemctl restart "$unit"
  fi
  exit "$result"
}
trap rollback EXIT

node_path=$(command -v node)
env_path=$(command -v env)
cat > "$release_dir/new-dropin.conf" <<EOF
[Service]
WorkingDirectory="$runtime"
ExecStart=
ExecStart="$env_path" PACKET_LOG_DIR=/var/lib/mms-gps-gateway "$node_path" "$runtime/dist/main.js"
StateDirectory=mms-gps-gateway
Environment=PACKET_LOG_DIR=/var/lib/mms-gps-gateway
EOF
sudo mkdir -p "$dropin_dir"
switched=true
sudo install -m 644 "$release_dir/new-dropin.conf" "$dropin"
sudo systemctl daemon-reload
sudo systemctl restart "$unit"

# An empty TCP connection checks the listener without inventing a tracker frame.
node --input-type=module <<'JS'
import 'dotenv/config';
import net from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { loadConfig } from './dist/config.js';
const { tcpPort } = loadConfig();
for (let attempt = 0; ; attempt++) {
  try {
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port: tcpPort });
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
systemctl is-active --quiet "$unit"
trap - EXIT
echo "GPS gateway release: $release_sha"
echo "Runtime: $runtime"
echo 'Service active. Packet capture is enabled; verify the next real tracker report in MMS Packet Logs.'
