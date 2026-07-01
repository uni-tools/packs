#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/dist"
VERSION="${1:-dev}"

rm -rf "$OUT"
mkdir -p "$OUT"

pack_zip() {
  local kind="$1"
  local id="$2"
  local ver="$3"
  local repo_path="$4"
  local src="${ROOT}/${repo_path}"
  local name=""

  case "$kind" in
    skill) name="skill-${id}-${ver}.zip" ;;
    hand) name="hand-${id}-${ver}.zip" ;;
    extension) name="extension-${id}-${ver}.zip" ;;
    utcp-provider) name="utcp-${id}-${ver}.zip" ;;
    dashboard) name="dashboard-${id}-${ver}.zip" ;;
    channel) name="channel-${id}-${ver}.zip" ;;
    ui-plugin) name="plugin-${id}-${ver}.zip" ;;
    *) echo "Unknown kind: $kind" >&2; exit 1 ;;
  esac

  if [[ ! -d "$src" ]]; then
    echo "Missing pack directory: $src" >&2
    exit 1
  fi

  (cd "$src" && zip -qr "${OUT}/${name}" . -x '*.DS_Store')
  echo "Built ${OUT}/${name}"
}

export ROOT OUT
export -f pack_zip

PACKS_ROOT="$ROOT" PACKS_VERSION="$VERSION" python3 - <<'PY'
import json, os, subprocess
from pathlib import Path

root = Path(os.environ["PACKS_ROOT"])
out = root / "dist"
for item in json.loads((root / "registry/index.json").read_text())["items"]:
    subprocess.check_call([
        "bash", "-c",
        f'pack_zip "{item["kind"]}" "{item["id"]}" "{item["version"]}" "{item["install"]["repo_path"]}"',
    ])
count = len(list(out.glob("*.zip")))
print(f"Release {os.environ['PACKS_VERSION']}: {count} assets in dist/")
PY
