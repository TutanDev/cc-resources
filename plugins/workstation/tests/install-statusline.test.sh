#!/usr/bin/env bash
# Runs hooks/install-statusline.sh against throwaway config directories.
# Needs bash, jq and coreutils; run it from anywhere:
#   bash plugins/workstation/tests/install-statusline.test.sh
set -u

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$root/hooks/install-statusline.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
passed=0
failed=0

check() {
  if eval "$2"; then
    passed=$((passed + 1))
    echo "ok   $1"
  else
    failed=$((failed + 1))
    echo "FAIL $1"
  fi
}

run() { CLAUDE_PLUGIN_ROOT="$root" CLAUDE_CONFIG_DIR="$1" bash "$hook" </dev/null; }

# Nothing but settings.json, the script folder and the kept original may remain.
no_leftovers() { [ -z "$(ls -A "$1" | grep -v -x -e settings.json -e workstation -e before)" ]; }

# A machine with no settings.json yet.
d="$work/fresh"
mkdir -p "$d"
out="$(run "$d")"
check "fresh: statusLine names the copy" '[ "$(jq -r .statusLine.command "$d/settings.json")" = "bash \"$d/workstation/statusline-command.sh\"" ]'
check "fresh: statusLine is a command" '[ "$(jq -r .statusLine.type "$d/settings.json")" = command ]'
check "fresh: script copied" 'cmp -s "$root/statusline-command.sh" "$d/workstation/statusline-command.sh"'
check "fresh: says so as a systemMessage" 'jq -e ".systemMessage | startswith(\"workstation: set statusLine\")" <<<"$out" >/dev/null'
check "fresh: no leftovers" 'no_leftovers "$d"'
check "fresh: a second run is silent" '[ -z "$(run "$d")" ]'

# Settings without a statusLine keep every other key.
d="$work/merge"
mkdir -p "$d"
echo '{"enabledPlugins":{"a@b":true},"model":"opus","permissions":{"allow":["Bash(ls)"]}}' >"$d/settings.json"
run "$d" >/dev/null
check "merge: other keys kept" '[ "$(jq -c "del(.statusLine)" "$d/settings.json")" = "{\"enabledPlugins\":{\"a@b\":true},\"model\":\"opus\",\"permissions\":{\"allow\":[\"Bash(ls)\"]}}" ]'
check "merge: statusLine added" 'jq -e .statusLine.command "$d/settings.json" >/dev/null'

# A statusLine already set is never touched, but a stale copy is refreshed.
d="$work/keep"
mkdir -p "$d/workstation"
echo '{"statusLine":{"type":"command","command":"mine"}}' >"$d/settings.json"
cp "$d/settings.json" "$d/before"
echo old >"$d/workstation/statusline-command.sh"
out="$(run "$d")"
check "keep: settings byte-identical" 'cmp -s "$d/before" "$d/settings.json"'
check "keep: silent" '[ -z "$out" ]'
check "keep: stale copy refreshed" 'cmp -s "$root/statusline-command.sh" "$d/workstation/statusline-command.sh"'

# A symlinked settings.json (a dotfiles checkout) stays a symlink.
d="$work/symlink"
mkdir -p "$d" "$work/dotfiles"
echo '{"theme":"dark"}' >"$work/dotfiles/settings.json"
ln -s "$work/dotfiles/settings.json" "$d/settings.json"
run "$d" >/dev/null
check "symlink: still a link" '[ -L "$d/settings.json" ]'
check "symlink: target updated" '[ "$(jq -r .theme "$work/dotfiles/settings.json")" = dark ] && jq -e .statusLine "$work/dotfiles/settings.json" >/dev/null'
check "symlink: no leftovers" 'no_leftovers "$d"'

# A settings.json that is not a JSON object is left alone, with a warning.
for name in invalid array empty; do
  d="$work/$name"
  mkdir -p "$d"
  case "$name" in
    invalid) printf '{"a":' ;;
    array) printf '[1,2]' ;;
    empty) ;;
  esac >"$d/settings.json"
  cp "$d/settings.json" "$d/before"
  out="$(run "$d")"
  check "$name: untouched" 'cmp -s "$d/before" "$d/settings.json"'
  check "$name: warns" 'jq -e ".systemMessage | contains(\"not a JSON object\")" <<<"$out" >/dev/null'
  check "$name: no leftovers" 'no_leftovers "$d"'
done

# Without jq the hook warns and changes nothing.
d="$work/nojq"
bin="$work/bin"
mkdir -p "$d" "$bin"
for tool in bash cat cmp cp mkdir mktemp mv rm; do ln -s "$(command -v "$tool")" "$bin/$tool"; done
out="$(CLAUDE_PLUGIN_ROOT="$root" CLAUDE_CONFIG_DIR="$d" PATH="$bin" "$bin/bash" "$hook" </dev/null)"
status=$?
check "nojq: exits 0" '[ "$status" -eq 0 ]'
check "nojq: warns as a systemMessage" 'jq -e ".systemMessage | contains(\"jq is not installed\")" <<<"$out" >/dev/null'
check "nojq: settings not created" '[ ! -e "$d/settings.json" ]'

# The command written to settings runs the status line, even from a config
# directory whose path holds what a shell would expand or split.
renders() {
  local command
  command="$(jq -r .statusLine.command "$1/settings.json")"
  echo '{"workspace":{"current_dir":"/x"},"model":{"display_name":"M"},"context_window":{"used_percentage":12.4}}' |
    bash -c "$command" | grep -q "ctx: 12%"
}
check "run: the status line renders" 'renders "$work/fresh"'

d="$work/a dir \"quoted\" \$HOME \`true\` back\\slash"
mkdir -p "$d"
out="$(run "$d")"
check "quoting: the status line renders" 'renders "$d"'
check "quoting: message is valid JSON" 'jq -e .systemMessage <<<"$out" >/dev/null'

echo "passed $passed, failed $failed"
[ "$failed" -eq 0 ]
