#!/usr/bin/env bash
# SessionStart hook: writes into the user settings what the cc-resources
# plugins need there, since a plugin cannot ship it (Claude Code drops every key
# of a plugin's own settings.json but agent and subagentStatusLine).
#
# - The status line: keeps a copy of the plugin's status line script at a fixed
#   path in the Claude config directory, and points statusLine at that copy when
#   the user settings have none. The plugin's install folder changes with each
#   version, so the settings name the copy, never the plugin folder; an update
#   reaches the copy at the next session start.
# - Two permissions.allow rules for the cc-resources workflows, whose background
#   agents cannot ask for approval: reading the installed plugins' files, and
#   writing under any cc-docs/ folder. The hook adds each rule once and records
#   it, so a rule the person removes stays removed.
#
# Claude Code runs an event's hooks in parallel, so this one script makes every
# change to settings.json, in a single write.
#
# A SessionStart hook's plain stdout is added to the model's context, so this
# prints nothing unless the person should hear something, and then only a JSON
# systemMessage. It always exits 0: a failure never stops a session.
# It keeps to bash 3.2, the bash macOS ships.
#
# A Windows build of jq ends its lines with CRLF, so what it writes to a file
# goes through tr -d '\r': JSON holds no raw CR, and the files keep LF endings.
set -uo pipefail

config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
config_dir="${config_dir%/}"
settings="$config_dir/settings.json"
source_script="${CLAUDE_PLUGIN_ROOT:?}/statusline-command.sh"
target_dir="$config_dir/workstation"
target_script="$target_dir/statusline-command.sh"
# The rules this hook has added or found already allowed, one per line.
rules_record="$target_dir/allow-rules-added"

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"systemMessage":"workstation: jq is not installed, so the status line and the permission rules were not set up. Install jq, then start a new session."}'
  exit 0
fi

# What the person should hear: clauses, joined into one systemMessage on exit.
notes=()
note() { notes+=("$1"); }
finish() {
  if [ "${#notes[@]}" -gt 0 ]; then
    local message
    message=$(printf '; %s' "${notes[@]}")
    jq -nc --arg message "workstation: ${message:2}." '{systemMessage: $message}'
  fi
  exit 0
}

# Git Bash on Windows: name paths as C:/... rather than /c/..., which only MSYS
# tools read.
mixed_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}
# Messages name every path the same way.
shown_settings=$(mixed_path "$settings")

# Refresh the copy whenever the plugin's script differs from it, through a
# rename so a status line run never reads a half-written file.
copied=true
if ! cmp -s "$source_script" "$target_script"; then
  if ! { mkdir -p "$target_dir" && cp "$source_script" "$target_script.tmp" && mv -f "$target_script.tmp" "$target_script"; }; then
    rm -f "$target_script.tmp"
    note "could not copy the status line script to $(mixed_path "$target_script"), so the status line was not set"
    copied=false
  fi
fi

# A file that is not one JSON object is left alone: rewriting it could lose it.
# jq reads files from stdin: Git Bash does not convert every path it passes to a
# Windows program (one with a backtick stays /tmp/...), and stdin needs none.
current='{}'
if [ -f "$settings" ]; then
  if ! current=$(jq -sc 'if length == 1 and (.[0] | type) == "object" then .[0] else error("not one object") end' <"$settings" 2>/dev/null); then
    note "$shown_settings is not a JSON object, so the status line and the permission rules were not set"
    finish
  fi
fi

# Any statusLine already set wins, including one set by hand on this machine.
set_status=false
if [ "$copied" = true ] && [ "$(jq 'has("statusLine")' <<<"$current")" = false ]; then
  set_status=true
fi

# The installed plugins live under the config directory. A rule names a path
# under the home folder from ~/, and any other from //, in the form Claude Code
# matches against: C:\x is /c/x.
plugins_dir=$(mixed_path "$config_dir/plugins")
home=$(mixed_path "$HOME")
case "$plugins_dir" in
  "$home"/*) read_root="~/${plugins_dir#"$home"/}" ;;
  [A-Za-z]:/*) read_root="//$(printf '%s' "${plugins_dir:0:1}" | tr '[:upper:]' '[:lower:]')${plugins_dir:2}" ;;
  *) read_root="/$plugins_dir" ;;
esac
wanted=$(jq -nc '$ARGS.positional' --args "Read($read_root/**)" 'Edit(//**/cc-docs/**)')

recorded='[]'
if [ -f "$rules_record" ]; then
  recorded=$(jq -Rsc 'split("\n") | map(select(length > 0))' <"$rules_record") || recorded='[]'
fi

# Add each wanted rule that is neither allowed already nor added before.
to_add='[]'
to_record='[]'
if [ "$(jq '(.permissions // {}) as $p | ($p | type) == "object" and (($p.allow // []) | type) == "array"' <<<"$current")" = true ]; then
  to_add=$(jq -c --argjson wanted "$wanted" --argjson recorded "$recorded" '$wanted - (.permissions.allow // []) - $recorded' <<<"$current")
  to_record=$(jq -c --argjson wanted "$wanted" --argjson recorded "$recorded" --argjson add "$to_add" \
    '(.permissions.allow // []) as $allow | [$wanted[] | select(. as $rule | any($recorded[]; . == $rule) | not) | select(. as $rule | any($allow[], $add[]; . == $rule))]' <<<"$current")
else
  note "permissions.allow in $shown_settings is not a list, so the permission rules were not added"
fi

if [ "$set_status" = true ] || [ "$to_add" != '[]' ]; then
  pending=()
  [ "$set_status" = true ] && pending+=("the status line")
  [ "$to_add" != '[]' ] && pending+=("the permission rules")
  pending_text="${pending[0]}${pending[1]:+ and ${pending[1]}}"

  # Double quotes, which sh and cmd both read, with what a shell expands inside them escaped.
  script_path=$(mixed_path "$target_script")
  quoted_path=$(printf '%s' "$script_path" | sed 's/[\\"$`]/\\&/g')
  status_line_command="bash \"$quoted_path\""

  if ! tmp=$(mktemp "$settings.XXXXXX"); then
    note "could not write next to $shown_settings, so $pending_text were not set"
    finish
  fi
  jq --arg command "$status_line_command" --argjson set_status "$set_status" --argjson add "$to_add" '
    (if $set_status then . + {statusLine: {type: "command", command: $command}} else . end)
    | (if ($add | length) > 0 then .permissions.allow = ((.permissions.allow // []) + $add) else . end)
  ' <<<"$current" | tr -d '\r' >"$tmp"
  written=$?

  # A symlinked settings.json (a dotfiles checkout) is written through, so the
  # link stays; a plain file is replaced by a rename, so no reader sees it half done.
  if [ "$written" -eq 0 ]; then
    if [ -L "$settings" ]; then
      cat "$tmp" >"$settings"
    else
      mv -f "$tmp" "$settings"
    fi
    written=$?
  fi
  rm -f "$tmp"

  if [ "$written" -ne 0 ]; then
    note "could not update $shown_settings, so $pending_text were not set"
    finish
  fi
  [ "$set_status" = true ] && note "set statusLine in $shown_settings to run $script_path"
  [ "$to_add" != '[]' ] && note "added $(jq -r 'join(" and ")' <<<"$to_add") to permissions.allow in $shown_settings, since the cc-resources workflows run in the background and cannot ask for approval"
fi

if [ "$to_record" != '[]' ]; then
  if ! { mkdir -p "$target_dir" && jq -r '.[]' <<<"$to_record" | tr -d '\r' >>"$rules_record"; }; then
    note "could not write $(mixed_path "$rules_record"), so a rule you remove from permissions.allow may be added again"
  fi
fi

finish
