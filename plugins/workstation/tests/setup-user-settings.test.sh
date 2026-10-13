#!/usr/bin/env bash
# Runs hooks/setup-user-settings.sh against throwaway config directories.
# Needs bash, jq and coreutils; run it from anywhere:
#   bash plugins/workstation/tests/setup-user-settings.test.sh
set -u

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$root/hooks/setup-user-settings.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
passed=0
failed=0
skipped=0

check() {
  if eval "$2"; then
    passed=$((passed + 1))
    echo "ok   $1"
  else
    failed=$((failed + 1))
    echo "FAIL $1"
  fi
}

skip() {
  skipped=$((skipped + 1))
  echo "skip $1"
}

# Git Bash on Windows: the hook names paths as C:/... rather than /c/....
mixed() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Git Bash on Windows copies instead of linking unless native symlinks are on.
can_symlink=false
touch "$work/probe" && ln -s "$work/probe" "$work/probe-link" 2>/dev/null && [ -L "$work/probe-link" ] && can_symlink=true
rm -f "$work/probe" "$work/probe-link"

# The home folder is a throwaway too, so no config directory below is under it.
run() { HOME="$work/home" CLAUDE_PLUGIN_ROOT="$root" CLAUDE_CONFIG_DIR="$1" bash "$hook" </dev/null; }

# Byte for byte, since grep in Git Bash drops each CR before it matches.
lf_only() { local file; for file; do tr -d '\r' <"$file" | cmp -s - "$file" || return 1; done; }

# Nothing but settings.json, the script folder and the kept original may remain.
no_leftovers() { [ -z "$(ls -A "$1" | grep -v -x -e settings.json -e workstation -e before)" ]; }

# The rules the hook allows for a config directory outside the home folder, as a
# JSON array: absolute paths in the form Claude Code matches against (C:\x is /c/x).
edit_rule='Edit(//**/cc-docs/**)'
read_rule() {
  local path="$1/plugins"
  if command -v cygpath >/dev/null 2>&1; then
    path=$(cygpath -m "$path")
    path="/$(printf '%s' "${path:0:1}" | tr '[:upper:]' '[:lower:]')${path:2}"
  fi
  printf 'Read(/%s/**)' "$path"
}
rules() { jq -nc '$ARGS.positional' --args "$(read_rule "$1")" "$edit_rule"; }
allow() { jq -c '.permissions.allow' <"$1/settings.json"; }

# A machine with no settings.json yet.
d="$work/fresh"
mkdir -p "$d"
out="$(run "$d")"
check "fresh: statusLine names the copy" '[ "$(jq -r .statusLine.command "$d/settings.json")" = "bash \"$(mixed "$d/workstation/statusline-command.sh")\"" ]'
check "fresh: statusLine is a command" '[ "$(jq -r .statusLine.type "$d/settings.json")" = command ]'
check "fresh: script copied" 'cmp -s "$root/statusline-command.sh" "$d/workstation/statusline-command.sh"'
check "fresh: both rules allowed" '[ "$(allow "$d")" = "$(rules "$d")" ]'
check "fresh: both rules recorded" '[ "$(jq -Rsc "split(\"\n\") | map(select(length > 0))" "$d/workstation/allow-rules-added")" = "$(rules "$d")" ]'
check "fresh: one systemMessage says both" 'jq -e ".systemMessage | startswith(\"workstation: set statusLine\") and contains(\"; added Read(\") and contains(\" and Edit(//**/cc-docs/**) to permissions.allow\") and endswith(\"approval.\")" <<<"$out" >/dev/null'
check "fresh: LF line endings" 'lf_only "$d/settings.json" "$d/workstation/allow-rules-added"'
check "fresh: no leftovers" 'no_leftovers "$d"'
check "fresh: a second run is silent" '[ -z "$(run "$d")" ]'
check "fresh: a second run adds nothing" '[ "$(allow "$d")" = "$(rules "$d")" ]'

# A rule the person removes stays removed.
jq '.permissions.allow -= ["Edit(//**/cc-docs/**)"]' "$d/settings.json" >"$work/removed" && mv "$work/removed" "$d/settings.json"
out="$(run "$d")"
check "removed: silent" '[ -z "$out" ]'
check "removed: not added again" '[ "$(allow "$d")" = "$(jq -nc --arg r "$(read_rule "$d")" "[\$r]")" ]'

# The config directory in the home folder: the Read rule names it from ~/.
d="$work/home/.claude"
mkdir -p "$d"
HOME="$work/home" CLAUDE_PLUGIN_ROOT="$root" bash -c 'unset CLAUDE_CONFIG_DIR; bash "$0"' "$hook" </dev/null >/dev/null
check "home: Read rule from ~/" '[ "$(allow "$d")" = "[\"Read(~/.claude/plugins/**)\",\"$edit_rule\"]" ]'

# Settings without a statusLine keep every other key, and their rules come first.
d="$work/merge"
mkdir -p "$d"
echo '{"enabledPlugins":{"a@b":true},"model":"opus","permissions":{"allow":["Bash(ls)"],"deny":["Read(.env)"]}}' >"$d/settings.json"
run "$d" >/dev/null
check "merge: other keys kept" '[ "$(jq -c "del(.statusLine) | .permissions.allow |= .[:1]" "$d/settings.json")" = "{\"enabledPlugins\":{\"a@b\":true},\"model\":\"opus\",\"permissions\":{\"allow\":[\"Bash(ls)\"],\"deny\":[\"Read(.env)\"]}}" ]'
check "merge: rules appended" '[ "$(allow "$d")" = "$(jq -c "[\"Bash(ls)\"] + ." <<<"$(rules "$d")")" ]'
check "merge: statusLine added" 'jq -e .statusLine.command "$d/settings.json" >/dev/null'

# A statusLine and rules already set are never touched, but a stale copy is
# refreshed, and the rules are recorded so removing them later sticks.
d="$work/keep"
mkdir -p "$d/workstation"
jq -n --argjson rules "$(rules "$d")" '{statusLine: {type: "command", command: "mine"}, permissions: {allow: $rules}}' >"$d/settings.json"
cp "$d/settings.json" "$d/before"
echo old >"$d/workstation/statusline-command.sh"
out="$(run "$d")"
check "keep: settings byte-identical" 'cmp -s "$d/before" "$d/settings.json"'
check "keep: silent" '[ -z "$out" ]'
check "keep: stale copy refreshed" 'cmp -s "$root/statusline-command.sh" "$d/workstation/statusline-command.sh"'
check "keep: rules recorded" '[ "$(wc -l <"$d/workstation/allow-rules-added")" -eq 2 ]'

# A statusLine of the person's own does not stop the rules.
d="$work/own-status"
mkdir -p "$d"
echo '{"statusLine":{"type":"command","command":"mine"}}' >"$d/settings.json"
out="$(run "$d")"
check "own-status: statusLine kept" '[ "$(jq -r .statusLine.command "$d/settings.json")" = mine ]'
check "own-status: rules added" '[ "$(allow "$d")" = "$(rules "$d")" ]'
check "own-status: says only the rules" 'jq -e ".systemMessage | startswith(\"workstation: added Read(\")" <<<"$out" >/dev/null'

# permissions.allow that is not a list: the status line is still set, the rules are not.
d="$work/bad-allow"
mkdir -p "$d"
echo '{"permissions":{"allow":"Bash(ls)"}}' >"$d/settings.json"
out="$(run "$d")"
check "bad-allow: allow untouched" '[ "$(jq -r .permissions.allow "$d/settings.json")" = "Bash(ls)" ]'
check "bad-allow: statusLine set" 'jq -e .statusLine.command "$d/settings.json" >/dev/null'
check "bad-allow: warns, then says the status line" 'jq -e ".systemMessage | startswith(\"workstation: permissions.allow in\") and contains(\"is not a list\") and contains(\"; set statusLine\")" <<<"$out" >/dev/null'
check "bad-allow: nothing recorded" '[ ! -e "$d/workstation/allow-rules-added" ]'

# A symlinked settings.json (a dotfiles checkout) stays a symlink.
if [ "$can_symlink" = true ]; then
  d="$work/symlink"
  mkdir -p "$d" "$work/dotfiles"
  echo '{"theme":"dark"}' >"$work/dotfiles/settings.json"
  ln -s "$work/dotfiles/settings.json" "$d/settings.json"
  run "$d" >/dev/null
  check "symlink: still a link" '[ -L "$d/settings.json" ]'
  check "symlink: target updated" '[ "$(jq -r .theme "$work/dotfiles/settings.json")" = dark ] && jq -e ".statusLine and (.permissions.allow | length == 2)" "$work/dotfiles/settings.json" >/dev/null'
  check "symlink: no leftovers" 'no_leftovers "$d"'
else
  skip "symlink: this system cannot make symlinks"
fi

# A settings.json that is not one JSON object is left alone, with a warning.
for name in invalid array empty two; do
  d="$work/$name"
  mkdir -p "$d"
  case "$name" in
    invalid) printf '{"a":' ;;
    array) printf '[1,2]' ;;
    empty) ;;
    two) printf '{}\n{}' ;;
  esac >"$d/settings.json"
  cp "$d/settings.json" "$d/before"
  out="$(run "$d")"
  check "$name: untouched" 'cmp -s "$d/before" "$d/settings.json"'
  check "$name: warns" 'jq -e ".systemMessage | contains(\"not a JSON object\")" <<<"$out" >/dev/null'
  check "$name: no leftovers" 'no_leftovers "$d"'
done

# Without jq the hook warns and changes nothing. A PATH of links to every tool
# but jq hides it, so this needs symlinks.
if [ "$can_symlink" = true ]; then
  d="$work/nojq"
  bin="$work/bin"
  mkdir -p "$d" "$bin"
  for tool in bash cat cmp cp mkdir mktemp mv rm; do ln -s "$(command -v "$tool")" "$bin/$tool"; done
  out="$(CLAUDE_PLUGIN_ROOT="$root" CLAUDE_CONFIG_DIR="$d" PATH="$bin" "$bin/bash" "$hook" </dev/null)"
  status=$?
  check "nojq: exits 0" '[ "$status" -eq 0 ]'
  check "nojq: warns as a systemMessage" 'jq -e ".systemMessage | contains(\"jq is not installed\")" <<<"$out" >/dev/null'
  check "nojq: settings not created" '[ ! -e "$d/settings.json" ]'
else
  skip "nojq: this system cannot make symlinks"
fi

# The command written to settings runs the status line, even from a config
# directory whose path holds what a shell would expand or split.
renders() {
  local command
  command="$(jq -r .statusLine.command <"$1/settings.json")"
  echo '{"workspace":{"current_dir":"/x"},"model":{"display_name":"M"},"context_window":{"used_percentage":12.4}}' |
    bash -c "$command" | grep -q "ctx: 12%"
}
check "run: the status line renders" 'renders "$work/fresh"'

if command -v cygpath >/dev/null 2>&1; then
  # Windows forbids " in a folder name, and reads \ as a separator.
  d="$work/a dir \$HOME \`true\`"
else
  d="$work/a dir \"quoted\" \$HOME \`true\` back\\slash"
fi
mkdir -p "$d"
out="$(run "$d")"
check "quoting: the status line renders" 'renders "$d"'
check "quoting: message is valid JSON" 'jq -e .systemMessage <<<"$out" >/dev/null'
check "quoting: both rules allowed" '[ "$(allow "$d")" = "$(rules "$d")" ]'

echo "passed $passed, failed $failed, skipped $skipped"
[ "$failed" -eq 0 ]
