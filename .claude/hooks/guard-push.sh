#!/usr/bin/env bash
# PreToolUse フック（Bash）：危ない git push を実行前に止める。
#   - 強制 push（--force / -f / +ref）     → deny（拒否。AIは実行できない）
#   - main への push（公開されてしまう） → ask（必ず人間に確認ダイアログを出す）
#   - それ以外                              → 何もしない
cmd=$(jq -r '.tool_input.command // empty')
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null

echo "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)' || exit 0

decide() {
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

if echo "$cmd" | grep -Eq -- '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+[^[:space:]]+)'; then
  decide deny "強制 push は禁止されています（.claude/hooks/guard-push.sh）。"
fi

branch=$(git branch --show-current 2>/dev/null)
# 「main」と明示している、または引数なしの push を main ブランチ上で実行しようとしている
if echo "$cmd" | grep -Eq '(^|[[:space:]:])main([[:space:]]|$)' ||
   { [ "$branch" = "main" ] && ! echo "$cmd" | grep -Eq 'git[[:space:]]+push[[:space:]]+[^-[:space:]]+[[:space:]]+[^-[:space:]]+'; }; then
  decide ask "main への push は GitHub Pages にそのまま公開されます。本当に公開してよいか確認してください。"
fi
exit 0
