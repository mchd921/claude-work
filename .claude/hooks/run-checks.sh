#!/usr/bin/env bash
# PostToolUse フック：Claude が index.html か tests/ を編集した直後に自動チェックを走らせる。
#   - 対象外のファイルなら何もしない（exit 0）
#   - チェックが通れば何も言わない（exit 0）
#   - 失敗したら結果を stderr に出して exit 2 → Claude Code がその内容を Claude に送り返す
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  */index.html|*/tests/*) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
if out=$(node tests/check.mjs 2>&1); then
  exit 0
fi
{
  echo "自動チェック (node tests/check.mjs) が失敗しました。直してから作業を終えてください。"
  echo "$out" | grep -v '^OK '
} >&2
exit 2
