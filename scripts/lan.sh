#!/usr/bin/env bash
# Build + serve the app on the local network so phones can connect.
# Used at game time. Avoids the dev-server HMR WebSocket noise.
set -euo pipefail

PORT="${PORT:-3002}"

# macOS: prefer Wi-Fi (en0), fall back to en1, then parse ifconfig.
ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "${ip}" ]; then
  ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "${ip}" ]; then
  ip="$(ifconfig | awk '/inet /{print $2}' | grep -v '^127' | head -n1 || true)"
fi

if [ -z "${ip}" ]; then
  echo "Couldn't detect a LAN IP. Make sure you're connected to Wi-Fi."
  exit 1
fi

# Refuse to run if something else already holds the port — usually a stale
# `next dev`. Tell the user how to clear it.
if lsof -tiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is in use. Free it and re-run, e.g.:"
  echo "    lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill"
  exit 1
fi

echo ""
echo "Building production bundle…"
npm run build

echo ""
echo "🟢  Phones on the same Wi-Fi can open:"
echo ""
echo "        http://${ip}:${PORT}"
echo ""
echo "    (Broadcast view: http://${ip}:${PORT}/events/<event-id>/broadcast)"
echo ""
echo "Ctrl-C to stop. macOS may prompt to allow incoming connections — say yes."
echo ""

exec npx --no-install next start -H 0.0.0.0 -p "${PORT}"
