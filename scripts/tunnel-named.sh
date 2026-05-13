#!/usr/bin/env bash
# Build + serve the app behind a *named* Cloudflare Tunnel so phones get a
# stable HTTPS URL (e.g. https://mtg.yourdomain.com) instead of the rotating
# trycloudflare.com URL produced by `npm run tunnel`.
#
# One-time setup (per machine, per domain):
#   brew install cloudflared
#   cloudflared tunnel login                         # picks the domain
#   cloudflared tunnel create $TUNNEL_NAME           # creates credentials
#   cloudflared tunnel route dns $TUNNEL_NAME $TUNNEL_HOSTNAME
#
# Then per run:
#   TUNNEL_HOSTNAME=mtg.yourdomain.com npm run tunnel:named
set -euo pipefail

PORT="${PORT:-3002}"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

TUNNEL_NAME="${TUNNEL_NAME:-mtg-dash}"

if [ -z "${TUNNEL_HOSTNAME:-}" ]; then
  echo "TUNNEL_HOSTNAME is not set."
  echo ""
  echo "If you haven't done the one-time setup yet:"
  echo "    brew install cloudflared"
  echo "    cloudflared tunnel login"
  echo "    cloudflared tunnel create ${TUNNEL_NAME}"
  echo "    cloudflared tunnel route dns ${TUNNEL_NAME} mtg.yourdomain.com"
  echo ""
  echo "Then re-run with the routed hostname:"
  echo "    TUNNEL_HOSTNAME=mtg.yourdomain.com npm run tunnel:named"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install with:"
  echo "    brew install cloudflared"
  exit 1
fi

# Preflight: claim exclusive ownership of the named tunnel. Cloudflare
# load-balances across every cloudflared instance that connects to the same
# tunnel name, so a leftover process from a prior run (terminal closed
# ungracefully → EXIT trap didn't fire → the &-spawned cloudflared kept
# running) will silently steal half the traffic and serve stale code. Kill
# any survivors before we add a new one.
STALE_PIDS="$(pgrep -f "cloudflared .* tunnel run ${TUNNEL_NAME}$" || true)"
if [ -n "${STALE_PIDS}" ]; then
  echo "Found ${TUNNEL_NAME} cloudflared instance(s) from a prior run — terminating:"
  for pid in ${STALE_PIDS}; do
    echo "  pid ${pid}"
    kill "${pid}" 2>/dev/null || true
  done
  # Give them a moment to release their tunnel registration, then SIGKILL
  # anything that refuses to go.
  sleep 1
  STILL_ALIVE="$(pgrep -f "cloudflared .* tunnel run ${TUNNEL_NAME}$" || true)"
  if [ -n "${STILL_ALIVE}" ]; then
    for pid in ${STILL_ALIVE}; do kill -9 "${pid}" 2>/dev/null || true; done
  fi
fi

if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Free it and re-run, e.g.:"
  echo "    lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill"
  exit 1
fi

CONFIG="$(mktemp -t cloudflared-config.XXXXXX.yml)"
cat >"${CONFIG}" <<EOF
tunnel: ${TUNNEL_NAME}
ingress:
  - service: http://localhost:${PORT}
EOF

echo ""
echo "Building production bundle…"
npm run build

cloudflared --config "${CONFIG}" tunnel run "${TUNNEL_NAME}" &
TUNNEL_PID=$!

cleanup() {
  kill "${TUNNEL_PID}" 2>/dev/null || true
  rm -f "${CONFIG}"
}
trap cleanup EXIT INT TERM

URL="https://${TUNNEL_HOSTNAME}"
echo ""
echo "🌐  Public HTTPS URL: ${URL}"
echo "    Broadcast view:  ${URL}/events/<event-id>/broadcast"
echo ""
echo "Ctrl-C to stop. Hostname stays the same across runs."
echo ""

export PUBLIC_URL="${URL}"
exec npx --no-install next start -H 0.0.0.0 -p "${PORT}"
