#!/usr/bin/env bash
# Verify npx package names in extension integration.toml files exist on npm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="${ROOT}/extension"
if [[ ! -d "$EXT" ]]; then
  EXT="$(cd "$(dirname "$0")/../.." && pwd)/openfang/crates/openfang-extensions/integrations"
fi

fail=0
while IFS= read -r toml; do
  id="$(basename "$(dirname "$toml")")"
  [[ "$id" == "integrations" ]] && id="$(basename "$toml" .toml)"
  cmd=$(grep -E '^command\s*=' "$toml" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
  pkg=$(grep -E '^args\s*=' "$toml" | grep -oE '"[^"]+"' | tr -d '"' | awk '/^-y$/{getline; print; exit}')
  if [[ "$cmd" == "uvx" ]]; then
    base="${pkg%%@*}"
    if python3 -m pip index versions "$base" >/dev/null 2>&1 || npm view "$base" name >/dev/null 2>&1; then
      echo "OK  $id: uvx $pkg (PyPI/npm)"
    else
      echo "WARN $id: uvx $pkg (verify manually on PyPI)"
    fi
    continue
  fi
  if [[ "$cmd" != "npx" || -z "$pkg" ]]; then
    echo "SKIP $id: cmd=$cmd"
    continue
  fi
  if npm view "$pkg" name >/dev/null 2>&1; then
    echo "OK  $id: $pkg"
  else
    echo "BAD $id: $pkg"
    fail=1
  fi
done < <(find "$EXT" -name 'integration.toml' | sort)

exit "$fail"
