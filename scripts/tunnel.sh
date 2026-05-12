#!/usr/bin/env bash
# Build + serve the app behind a cloudflared Quick Tunnel so phones get a
# public HTTPS URL (no "Not Secure" warning, no LAN IP literal).
# URL rotates per session — fine for one-shot tournaments.
set -euo pipefail

PORT="${PORT:-3002}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install with:"
  echo "    brew install cloudflared"
  exit 1
fi

if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Free it and re-run, e.g.:"
  echo "    lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill"
  exit 1
fi

echo ""
echo "Building production bundle…"
npm run build

LOG="$(mktemp)"
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}" \
  >"${LOG}" 2>&1 &
TUNNEL_PID=$!

cleanup() {
  kill "${TUNNEL_PID}" 2>/dev/null || true
  rm -f "${LOG}"
}
trap cleanup EXIT INT TERM

echo ""
echo "Bringing up Cloudflare Quick Tunnel…"
URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${LOG}" | head -n1 || true)"
  [ -n "${URL}" ] && break
  sleep 0.5
done

if [ -z "${URL}" ]; then
  echo "Tunnel did not come up within 30s. cloudflared output:"
  cat "${LOG}"
  exit 1
fi

echo ""
echo "🌐  Public HTTPS URL: ${URL}"
echo "    Broadcast view:  ${URL}/events/<event-id>/broadcast"
echo ""
echo "Ctrl-C to stop. Tunnel URL will rotate next run."
echo ""

export PUBLIC_URL="${URL}"
exec npx --no-install next start -H 0.0.0.0 -p "${PORT}"
