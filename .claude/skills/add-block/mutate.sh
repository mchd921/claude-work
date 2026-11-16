#!/usr/bin/env bash
# わざと壊したコピーでチェックを走らせ、テストがバグに気づくか確かめる。
# 使い方: bash .claude/skills/add-block/mutate.sh 's/元の文字列/壊した文字列/'
# 本物の index.html は変えない。
set -u
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/tests"
cp "$root/tests/check.mjs" "$work/tests/"
sed "$1" "$root/index.html" > "$work/index.html"

if cmp -s "$root/index.html" "$work/index.html"; then
  echo "⚠ 置き換えが1か所も当たらなかった（sed の文字列を見直す）"; exit 1
fi
if node "$work/tests/check.mjs" > "$work/out.txt" 2>&1; then
  echo "✗ 見逃した: 壊したのにテストが全部通った。テストを強くする必要がある"; exit 1
fi
echo "✓ 捕まえた:"; grep -A1 '^NG' "$work/out.txt"
