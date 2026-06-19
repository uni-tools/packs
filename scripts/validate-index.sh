#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PACKS_ROOT="$ROOT" python3 - <<'PY'
import json, os, sys
from pathlib import Path

root = Path(os.environ["PACKS_ROOT"])
data = json.loads((root / "registry/index.json").read_text())
for item in data.get("items", []):
    pack_id = item.get("id", "?")
    repo_path = item.get("install", {}).get("repo_path")
    if not repo_path or not (root / repo_path).is_dir():
        print(f"index references missing path for {pack_id}: {repo_path}", file=sys.stderr)
        sys.exit(1)
print(f"registry/index.json OK — {len(data['items'])} packs")
PY
