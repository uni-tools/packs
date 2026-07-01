#!/usr/bin/env python3
"""Write install.sha256 in registry/index.json from dist/*.zip hashes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
INDEX = ROOT / "registry" / "index.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    if not INDEX.is_file():
        raise SystemExit(f"Missing {INDEX}")
    data = json.loads(INDEX.read_text(encoding="utf-8"))
    updated = 0
    for item in data.get("items", []):
        install = item.get("install") or {}
        asset = install.get("release_asset")
        if not asset:
            continue
        zip_path = DIST / asset
        if not zip_path.is_file():
            continue
        digest = sha256_file(zip_path)
        if install.get("sha256") != digest:
            install["sha256"] = digest
            updated += 1
    INDEX.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated sha256 for {updated} item(s) in {INDEX.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
