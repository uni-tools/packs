#!/usr/bin/env python3
"""Sync OpenFang bundled packs into uni-tools/packs and regenerate index.json."""

from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

OPENFANG = Path(__file__).resolve().parents[2] / "openfang"
PACKS = Path(__file__).resolve().parents[1]
VERSION = "1.1.0"
RELEASE_TAG = f"v{VERSION}"


def parse_skill_md(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            front = text[3:end]
            name = ""
            desc = ""
            for line in front.splitlines():
                if line.startswith("name:"):
                    name = line.split(":", 1)[1].strip().strip('"')
                elif line.startswith("description:"):
                    desc = line.split(":", 1)[1].strip().strip('"')
            if name or desc:
                return name or path.parent.name, desc
    return path.parent.name, f"OpenFang skill: {path.parent.name}"


def parse_hand_toml(path: Path) -> tuple[str, str, str]:
    text = path.read_text(encoding="utf-8")
    fields = {"id": path.parent.name, "name": path.parent.name, "description": ""}
    for key in fields:
        m = re.search(rf'^{key}\s*=\s*"([^"]*)"', text, re.M)
        if m:
            fields[key] = m.group(1)
    return fields["id"], fields["name"], fields["description"]


def parse_integration_toml(path: Path) -> tuple[str, str, str]:
    text = path.read_text(encoding="utf-8")
    fields = {"id": path.parent.name, "name": path.parent.name, "description": ""}
    for key in fields:
        m = re.search(rf'^{key}\s*=\s*"([^"]*)"', text, re.M)
        if m:
            fields[key] = m.group(1)
    return fields["id"], fields["name"], fields["description"]


def asset_name(kind: str, pack_id: str) -> str:
    if kind == "utcp-provider":
        return f"utcp-{pack_id}-{VERSION}.zip"
    return f"{kind}-{pack_id}-{VERSION}.zip"


def download_url(asset: str) -> str:
    return f"https://github.com/uni-tools/packs/releases/download/{RELEASE_TAG}/{asset}"


def sync_skills() -> list[dict]:
    src_root = OPENFANG / "crates/openfang-skills/bundled"
    dst_root = PACKS / "skill"
    items = []
    for skill_dir in sorted(src_root.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            continue
        dst = dst_root / skill_dir.name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(skill_dir, dst)
        _, desc = parse_skill_md(skill_md)
        name = skill_dir.name.replace("-", " ").title()
        asset = asset_name("skill", skill_dir.name)
        items.append(
            {
                "id": skill_dir.name,
                "kind": "skill",
                "name": name,
                "version": VERSION,
                "description": desc,
                "tags": ["openfang", "skill"],
                "install": {
                    "method": "github_release",
                    "repo_path": f"skill/{skill_dir.name}",
                    "release_asset": asset,
                    "download_url": download_url(asset),
                },
            }
        )
    return items


def sync_hands() -> list[dict]:
    src_root = OPENFANG / "crates/openfang-hands/bundled"
    dst_root = PACKS / "hand"
    items = []
    for hand_dir in sorted(src_root.iterdir()):
        if not hand_dir.is_dir():
            continue
        hand_toml = hand_dir / "HAND.toml"
        if not hand_toml.is_file():
            continue
        dst = dst_root / hand_dir.name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(hand_dir, dst)
        pack_id, name, desc = parse_hand_toml(hand_toml)
        asset = asset_name("hand", pack_id)
        items.append(
            {
                "id": pack_id,
                "kind": "hand",
                "name": name,
                "version": VERSION,
                "description": desc,
                "tags": ["openfang", "hand"],
                "install": {
                    "method": "github_release",
                    "repo_path": f"hand/{pack_id}",
                    "release_asset": asset,
                    "download_url": download_url(asset),
                },
            }
        )
    return items


def sync_extensions() -> list[dict]:
    src_root = OPENFANG / "crates/openfang-extensions/integrations"
    dst_root = PACKS / "extension"
    items = []
    for toml in sorted(src_root.glob("*.toml")):
        pack_id = toml.stem
        dst = dst_root / pack_id
        dst.mkdir(parents=True, exist_ok=True)
        shutil.copy2(toml, dst / "integration.toml")
        pack_id, name, desc = parse_integration_toml(dst / "integration.toml")
        asset = asset_name("extension", pack_id)
        items.append(
            {
                "id": pack_id,
                "kind": "extension",
                "name": name,
                "version": VERSION,
                "description": desc,
                "tags": ["openfang", "extension", "mcp"],
                "install": {
                    "method": "github_release",
                    "repo_path": f"extension/{pack_id}",
                    "release_asset": asset,
                    "download_url": download_url(asset),
                },
            }
        )
    return items


def sync_utcp() -> list[dict]:
    items = []
    for provider_dir in sorted((PACKS / "utcp").iterdir()):
        provider_json = provider_dir / "provider.json"
        if not provider_json.is_file():
            continue
        data = json.loads(provider_json.read_text(encoding="utf-8"))
        pack_id = provider_dir.name
        name = data.get("info", {}).get("title", pack_id)
        desc = data.get("info", {}).get("description", "")
        asset = asset_name("utcp-provider", pack_id)
        items.append(
            {
                "id": pack_id,
                "kind": "utcp-provider",
                "name": name,
                "version": VERSION,
                "description": desc,
                "tags": ["openfang", "utcp"],
                "install": {
                    "method": "github_release",
                    "repo_path": f"utcp/{pack_id}",
                    "release_asset": asset,
                    "download_url": download_url(asset),
                },
            }
        )
    return items


def main() -> int:
    if not OPENFANG.is_dir():
        print(f"OpenFang tree not found: {OPENFANG}", file=sys.stderr)
        return 1

    hello = PACKS / "skill/hello-world"
    if hello.is_dir():
        shutil.rmtree(hello)

    items = []
    items.extend(sync_skills())
    items.extend(sync_hands())
    items.extend(sync_extensions())
    items.extend(sync_utcp())
    items.sort(key=lambda x: (x["kind"], x["id"]))

    index = {
        "schema_version": 1,
        "registry": {
            "publisher": "uni-tools",
            "updated_at": date.today().isoformat(),
            "base_repo": "uni-tools/packs",
            "catalog_url": "https://raw.githubusercontent.com/uni-tools/packs/main/registry/index.json",
            "latest_release": RELEASE_TAG,
        },
        "items": items,
    }

    out = PACKS / "registry/index.json"
    out.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    counts: dict[str, int] = {}
    for item in items:
        counts[item["kind"]] = counts.get(item["kind"], 0) + 1
    print(f"Wrote {out} — {len(items)} packs:")
    for kind in sorted(counts):
        print(f"  {kind}: {counts[kind]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
