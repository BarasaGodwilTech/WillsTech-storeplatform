#!/usr/bin/env bash
# Will's Tech Store — start script for macOS / Linux (start.bat is the Windows version).
set -e
cd "$(dirname "$0")/backend"

echo; echo " ============================================"; echo "   Will's Tech Store  -  starting up"; echo " ============================================"; echo

if ! command -v node >/dev/null 2>&1; then
  echo " [!] Node.js is not installed. Get the LTS version from https://nodejs.org"; exit 1
fi

node scripts/setup-env.js
[ -d node_modules ] || { echo " Installing dependencies..."; npm install --no-audit --no-fund; }
node scripts/prepare.js

( sleep 4; (command -v xdg-open >/dev/null && xdg-open http://localhost:4000) || (command -v open >/dev/null && open http://localhost:4000) || true ) >/dev/null 2>&1 &

echo; echo "   Store: http://localhost:4000"; echo "   Admin: http://localhost:4000/admin/login"; echo "   Stop:  Ctrl+C"; echo
npm start
