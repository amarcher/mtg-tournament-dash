#!/usr/bin/env bash
# Tear down every cloudflared instance claiming the mtg-dash tunnel name plus
# the production Next.js server on $PORT (default 3002). Use after a tunnel
# session that didn't shut down cleanly, or before debugging a "served wrong
# version" issue.
#
# Leaves the system cloudflared at ~/.cloudflared/config.yml alone (that one
# serves imagegen.mised.tech and is unrelated).
set -euo pipefail

PORT="${PORT:-3002}"
TUNNEL_NAME="${TUNNEL_NAME:-mtg-dash}"

echo "Stopping ${TUNNEL_NAME} cloudflared instances…"
PIDS="$(pgrep -f "cloudflared .* tunnel run ${TUNNEL_NAME}$" || true)"
if [ -z "${PIDS}" ]; then
  echo "  (none running)"
else
  for pid in ${PIDS}; do
    echo "  pid ${pid}"
    kill "${pid}" 2>/dev/null || true
  done
  sleep 1
  STILL_ALIVE="$(pgrep -f "cloudflared .* tunnel run ${TUNNEL_NAME}$" || true)"
  for pid in ${STILL_ALIVE}; do kill -9 "${pid}" 2>/dev/null || true; done
fi

echo ""
echo "Stopping Next.js on :${PORT}…"
PORT_PIDS="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -z "${PORT_PIDS}" ]; then
  echo "  (nothing on :${PORT})"
else
  for pid in ${PORT_PIDS}; do
    echo "  pid ${pid}"
    kill "${pid}" 2>/dev/null || true
  done
fi

echo ""
echo "Done. The system cloudflared at ~/.cloudflared/config.yml is untouched."
