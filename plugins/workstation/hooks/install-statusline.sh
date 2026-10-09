#!/usr/bin/env bash
# SessionStart hook: keeps a copy of the plugin's status line script at a fixed
# path in the Claude config directory, and points statusLine at that copy when
# the user settings have none.
#
# A plugin's own settings.json cannot carry statusLine (Claude Code drops every
# key but agent and subagentStatusLine), and the plugin's install folder changes
# with each version, so the user settings name the copy, never the plugin folder.
# An update reaches the copy at the next session start.
#
# A SessionStart hook's plain stdout is added to the model's context, so this
# prints nothing unless the person should hear something, and then only a JSON
# systemMessage. It always exits 0: a failure never stops a session.
set -uo pipefail

config_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$config_dir/settings.json"
source_script="${CLAUDE_PLUGIN_ROOT:?}/statusline-command.sh"
target_dir="$config_dir/workstation"
target_script="$target_dir/statusline-command.sh"

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"systemMessage":"workstation: jq is not installed, so the status line was not set up. Install jq, then start a new session."}'
  exit 0
fi

say() { jq -nc --arg message "workstation: $1" '{systemMessage: $message}'; }

# Refresh the copy whenever the plugin's script differs from it, through a
# rename so a status line run never reads a half-written file.
if ! cmp -s "$source_script" "$target_script"; then
  if ! { mkdir -p "$target_dir" && cp "$source_script" "$target_script.tmp" && mv -f "$target_script.tmp" "$target_script"; }; then
    rm -f "$target_script.tmp"
    say "could not copy the status line script to $target_script."
    exit 0
  fi
fi

# Any statusLine already set wins, including one set by hand on this machine.
# A file that is not a JSON object is left alone: rewriting it could lose it.
if [ -f "$settings" ]; then
  has_status_line=$(jq 'has("statusLine")' "$settings" 2>/dev/null)
  case "$has_status_line" in
    true) exit 0 ;;
    false) ;;
    *)
      say "$settings is not a JSON object, so the status line was not set."
      exit 0
      ;;
  esac
fi

# Git Bash on Windows: name the script as C:/... rather than /c/..., which only
# MSYS tools read, so the command works whichever shell launches bash.
script_path="$target_script"
if command -v cygpath >/dev/null 2>&1; then
  script_path=$(cygpath -m "$target_script")
fi
# Double quotes, which sh and cmd both read, with what a shell expands inside them escaped.
quoted_path=$(printf '%s' "$script_path" | sed 's/[\\"$`]/\\&/g')
status_line_command="bash \"$quoted_path\""
add_status_line='. + {statusLine: {type: "command", command: $command}}'

if ! tmp=$(mktemp "$settings.XXXXXX"); then
  say "could not write next to $settings, so the status line was not set."
  exit 0
fi

if [ -f "$settings" ]; then
  jq --arg command "$status_line_command" "$add_status_line" "$settings" >"$tmp"
else
  jq -n --arg command "$status_line_command" "{} | $add_status_line" >"$tmp"
fi
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
  say "could not update $settings, so the status line was not set."
  exit 0
fi

say "set statusLine in $settings to run $script_path."
exit 0
