#!/usr/bin/env bash
# Runs every browser end-to-end test against a local server of this repo.
# Needs: Node 18+, Python 3 (for the static server) and Playwright with Chromium
#   npm i -D playwright && npx playwright install chromium   (not needed in Claude Code cloud sessions)
# Some tests use the internet: official portraits, tesseract.js (OCR) from jsDelivr, the CeciliaBot API.
set -u
cd "$(dirname "$0")/../.."
python3 -m http.server 8766 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
fail=0
for t in tests/e2e/*.e2e.js; do
  echo "== $t"
  out=$(timeout 600 node "$t" 2>&1)
  echo "$out" | tail -25
  if ! echo "$out" | grep -q "^errors: \[\]"; then echo "!! $t did not finish cleanly"; fail=1; fi
done
exit $fail
