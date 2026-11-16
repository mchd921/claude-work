#!/usr/bin/env bash
# Stop フック：Claude が返事を終えようとした瞬間に自動チェックを走らせる。
# Edit/Write 以外（sed や python など）で書き換えた場合も、ここで必ず捕まえる。
#   - 通れば exit 0（そのまま終わってよい）
#   - 失敗したら exit 2 → Claude は終われず、結果を受け取って作業を続ける
#   - ただし直せないまま2回目の Stop になったら、無限ループを避けるため止めずに人間へ知らせる
input=$(cat)
cd "$CLAUDE_PROJECT_DIR" || exit 0

if out=$(node tests/check.mjs 2>&1); then
  exit 0
fi

if [ "$(echo "$input" | jq -r '.stop_hook_active')" = "true" ]; then
  jq -n --arg m "⚠ 自動チェックが失敗したまま作業が終わりました。node tests/check.mjs を確認してください。" \
    '{systemMessage: $m}'
  exit 0
fi

{
  echo "終了前の自動チェック (node tests/check.mjs) が失敗しています。まだ終わらずに直してください。"
  echo "$out" | grep -v '^OK '
} >&2
exit 2
