#!/usr/bin/env bash
# Renders every store screenshot from the local demo stage.
#
# Headless Chrome is slow to start, so scenes run in parallel, each with its own
# profile directory — Chrome refuses to share one between concurrent instances.
#
#   ./store-assets/generate.sh              # English only (fast iteration)
#   ./store-assets/generate.sh --all        # all ten listing languages
#   ./store-assets/generate.sh de fr ar     # just these, e.g. to resume
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
STAGE="file://$ROOT/store-assets/demo/index.html"
OUT="$ROOT/store-assets/screenshots"
TMP="${TMPDIR:-/tmp}/insdown-shots"

ALL=(en tr pt_BR es id hi ar ru de fr)
if [[ "${1:-}" == "--all" ]]; then
  LOCALES=("${ALL[@]}")
elif [[ $# -gt 0 ]]; then
  LOCALES=("$@")
else
  LOCALES=(en)
fi
RTL_LOCALES=" ar fa he "

mkdir -p "$OUT" "$TMP"

# Headless Chrome occasionally finishes the screenshot but never exits, which
# would hang the whole run at `wait`. Each shot gets a watchdog instead.
SHOT_TIMEOUT=40

shoot() { # shoot <output> <url> <profile>
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox \
    --virtual-time-budget=3000 --no-first-run --no-default-browser-check \
    --user-data-dir="$3" --window-size=1280,800 \
    --screenshot="$1" "$2" >/dev/null 2>&1 &
  local pid=$!
  ( sleep "$SHOT_TIMEOUT"; kill -9 "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid" 2>/dev/null || true
  kill "$watchdog" 2>/dev/null || true
}

for locale in "${LOCALES[@]}"; do
  mkdir -p "$OUT/$locale"
  rtl=""
  [[ "$RTL_LOCALES" == *" $locale "* ]] && rtl="&rtl=1"

  for scene in 1 2 3 4 5; do
    cap=$(LOCALE="$locale" SCENE="$scene" python3 -c '
import base64, json, os, urllib.parse
data = json.load(open(os.path.join("'"$ROOT"'", "store-assets", "captions.json")))
pair = data[os.environ["LOCALE"]][os.environ["SCENE"]]
print(urllib.parse.quote(base64.b64encode(json.dumps(pair).encode()).decode()))
')
    shoot "$OUT/$locale/$scene.png" "$STAGE?scene=$scene&cap=$cap$rtl" "$TMP/$locale-$scene" &
  done
  wait
  echo "rendered $locale ($(ls "$OUT/$locale" | wc -l | tr -d ' ')/5)"
done

rm -rf "$TMP"
echo "done -> $OUT"
