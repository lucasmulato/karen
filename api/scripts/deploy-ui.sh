#!/usr/bin/env bash
# Build → backup → swap → smoke test → rollback on failure.
# Called by the allowlisted `build_ui` command. No shell args from the model.
set -euo pipefail

REPO=/home/admin/karen
UI_DIR="$REPO/ui"
WEB_ROOT=/var/www/karen-ui
BACKUP=/home/admin/karen-ui-backup

echo "[deploy-ui] gate: npm test"
(cd "$REPO/api" && npm test >/dev/null)

echo "[deploy-ui] building UI"
(cd "$UI_DIR" && npm run build >/dev/null)
test -f "$UI_DIR/dist/index.html"
grep -q '<script' "$UI_DIR/dist/index.html"

echo "[deploy-ui] backup + swap"
rm -rf "$BACKUP"
cp -a "$WEB_ROOT" "$BACKUP"
sudo /usr/bin/rsync -a --delete "$UI_DIR/dist/" "$WEB_ROOT/"

ok=0
for _ in 1 2 3 4 5; do
  if curl -sf --max-time 3 http://127.0.0.1:3000/api/health >/dev/null && \
     test -f "$WEB_ROOT/index.html"; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "[deploy-ui] smoke test falhou — revertendo" >&2
  sudo /usr/bin/rsync -a --delete "$BACKUP/" "$WEB_ROOT/"
  exit 1
fi
echo "[deploy-ui] ok"
