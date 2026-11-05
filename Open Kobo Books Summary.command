#!/bin/zsh
# Double-click this file on macOS. The server stays attached to this Terminal window.
set -e
cd -- "${0:A:h}"
APP_URL='http://127.0.0.1:3000'
if curl -fsS --max-time 2 "$APP_URL" 2>/dev/null | grep -Eq 'Readmory|Kobo Books Summary'; then
  open "$APP_URL"
  exit 0
fi
if ! command -v pnpm >/dev/null 2>&1; then
  print 'Install Node.js 24 and pnpm 11 first. See README.md.'
  read '?Press Return to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then pnpm install; fi
if [[ ! -f out/index.html ]]; then pnpm build; fi
print 'Opening Readmory. Keep this Terminal window open while using the server.'
print 'Use the same browser/profile for your saved library; another browser needs an import or backup restore.'
( for attempt in {1..60}; do
    if curl -fsS --max-time 1 "$APP_URL" >/dev/null 2>&1; then open "$APP_URL"; exit; fi
    sleep 1
  done ) &
pnpm start
