# uni-tools/packs

Official **Pack registry** for [uni-tools](https://github.com/uni-tools) / OpenFang: Skill, Hand, Extension, UTCP provider, Dashboard, and Channel bundles. Install on demand — nothing is baked into the OS binary.

## Catalog

| URL | Purpose |
|-----|---------|
| [`registry/index.json`](registry/index.json) | App market catalog (metadata only) |
| [`registry/schema.json`](registry/schema.json) | JSON schema for the index |

**OpenFang config (planned / wire-up in fork):**

```toml
[market]
registry_url = "https://raw.githubusercontent.com/uni-tools/packs/main/registry/index.json"
```

## Layout

```
packs/
├── registry/index.json     # catalog — browse without downloading packs
├── skill/<id>/             # SKILL.md (+ optional scripts)
├── hand/<id>/              # HAND.toml + SKILL.md
├── extension/<id>/         # integration.toml (MCP template)
├── utcp/<id>/              # provider.json
├── dashboard/<id>/         # pack.toml + static/ (optional UI)
└── channel/<id>/           # pack.toml + channel.toml
```

## Catalog packs (v1.2.0)

| Kind | Count | Install target on disk |
|------|-------|------------------------|
| skill | 61 | `~/.openfang/skills/<id>/` |
| hand | 9 | `~/.openfang/hands/<id>/` |
| extension | 25 | `~/.openfang/integrations.toml` + MCP |
| utcp-provider | 1 | `~/.openfang/utcp/providers.d/<id>.json` |
| dashboard | 1 | `~/.openfang/packs/dashboard/` |
| channel | 1 | `~/.openfang/packs/channels/<id>/` + `config.toml` |

**Total: 98 packs** (96 OpenFang bundled exports + Dashboard + Telegram channel).

Refresh from OpenFang source tree:

```bash
python3 scripts/sync-from-openfang.py
bash scripts/validate-index.sh
bash scripts/build-release.sh 1.2.0
```

## Install flow (target)

```
Dashboard / CLI
  → GET registry/index.json          (small JSON)
  → user clicks Install
  → download release zip OR git sparse checkout
  → extract to ~/.openfang/...
  → reload skill / hand / extension / utcp registry
```

## Releases

Tag `v*` to publish zip assets (CI builds one zip per pack):

```bash
git tag v1.0.0
git push origin v1.0.0
```

Local build:

```bash
bash scripts/validate-index.sh
bash scripts/build-release.sh 1.0.0
ls dist/
```

Release assets match `install.release_asset` in `index.json`, e.g. `hand-browser-1.0.0.zip`.

## Manual install (today, before market wiring)

**Skill (git clone entire repo, then copy subdir):**

```bash
git clone --depth 1 https://github.com/uni-tools/packs.git /tmp/uni-tools-packs
openfang skill install /tmp/uni-tools-packs/skill/hello-world
```

**Any pack (release zip):**

```bash
curl -L -o /tmp/pack.zip \
  https://github.com/uni-tools/packs/releases/download/v1.0.0/hand-browser-1.0.0.zip
unzip -d ~/.openfang/hands/browser /tmp/pack.zip
```

## Adding a pack

1. Add files under `skill/`, `hand/`, `extension/`, `utcp/`, `dashboard/`, or `channel/`.
2. Append an entry to `registry/index.json`.
3. Run `bash scripts/validate-index.sh`.
4. Tag a release so CI uploads zips.

## License

Pack contents may inherit upstream OpenFang bundled assets (browser hand, github extension, echo UTCP). See each pack directory for attribution.
