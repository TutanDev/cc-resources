#!/usr/bin/env bash
# Runs a plugin's eval suite with the grants its cases need: the scaffold
# scripts lay each case's project into the empty workspace, the agent may write
# files there, and it may read the plugin's own files, as a session may once
# the workstation plugin allows reads under ~/.claude/plugins/. The runner keeps
# the suite's own folder unreadable either way.
#
#   bash scripts/eval-plugin.sh <plugin> [claude plugin eval options...]
set -euo pipefail

usage='usage: bash scripts/eval-plugin.sh <plugin> [claude plugin eval options...]'
plugin=${1:?$usage}
shift

# Git Bash on Windows gives a drive path with pwd -W; elsewhere pwd is the path.
root=$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })
dir="$root/plugins/$plugin"
if [ ! -f "$dir/.claude-plugin/plugin.json" ]; then
  echo "No plugin at $dir." >&2
  exit 2
fi

# A permission rule names an absolute path after //.
exec claude plugin eval "$dir" --scaffold --allow-tools Write Edit "Read(//${dir#/}/**)" "$@"
