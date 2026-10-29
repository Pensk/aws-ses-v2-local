#!/usr/bin/env bash
# Builds the image (or uses $IMAGE), starts it with port 8005 published, and runs
# smoke.mjs against it. Requires Docker and Node.js >= 20 with npm.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${IMAGE:-}"
container="aws-ses-v2-local-smoke-$$"
workdir="$(mktemp -d)"

cleanup() {
	local status=$?
	if [ "$status" -ne 0 ] && docker container inspect "$container" >/dev/null 2>&1; then
		echo "--- container logs ---"
		docker logs "$container" || true
	fi
	docker rm -f "$container" >/dev/null 2>&1 || true
	rm -rf "$workdir"
	exit "$status"
}
trap cleanup EXIT

if [ -z "$image" ]; then
	image="aws-ses-v2-local:smoke"
	docker build -t "$image" "$repo_root"
fi

# Install the pinned test client outside the repository so nothing is left behind.
cp "$repo_root/test/package.json" "$repo_root/test/package-lock.json" "$repo_root/test/smoke.mjs" "$workdir/"
npm ci --prefix "$workdir" --ignore-scripts --no-audit --no-fund --loglevel=error

docker run -d --name "$container" -p 127.0.0.1::8005 "$image" >/dev/null
port="$(docker port "$container" 8005/tcp | head -n 1 | sed 's/.*://')"

SES_ENDPOINT="http://127.0.0.1:$port" node "$workdir/smoke.mjs"

uid="$(docker exec "$container" id -u)"
if [ "$uid" = "0" ]; then
	echo "FAIL: emulator is running as root"
	exit 1
fi
echo "Emulator runs as non-root uid $uid"
