#!/usr/bin/env bash
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
# Session token usage: sum of cumulative input + output tokens for this session
total_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // empty')
if [ -n "$total_in" ] && [ -n "$total_out" ]; then
  session_tokens=$(( total_in + total_out ))
  if [ "$session_tokens" -ge 1000000 ]; then
    session_tokens_fmt="$(awk "BEGIN { printf \"%.1fM\", $session_tokens/1000000 }")"
  elif [ "$session_tokens" -ge 1000 ]; then
    session_tokens_fmt="$(awk "BEGIN { printf \"%.1fk\", $session_tokens/1000 }")"
  else
    session_tokens_fmt="$session_tokens"
  fi
else
  session_tokens_fmt=""
fi

# Time remaining until next rate-limit reset: prefer the 5-hour window, fall back to 7-day window
resets_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // .rate_limits.seven_day.resets_at // empty')
if [ -n "$resets_at" ]; then
  now_epoch=$(date +%s)
  diff_secs=$(( resets_at - now_epoch ))
  if [ "$diff_secs" -lt 0 ]; then
    diff_secs=0
  fi
  diff_h=$(( diff_secs / 3600 ))
  diff_m=$(( (diff_secs % 3600) / 60 ))
  reset_countdown=$(printf '%02d:%02d' "$diff_h" "$diff_m")
else
  reset_countdown=""
fi

# Rate-limit used percentage (5h preferred, then 7d) for context alongside reset time
rate_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // .rate_limits.seven_day.used_percentage // empty')

parts=()

[ -n "$cwd" ] && parts+=("$(printf '\033[34m%s\033[0m' "$cwd")")
[ -n "$model" ] && parts+=("$(printf '\033[33m%s\033[0m' "$model")")
[ -n "$used" ] && parts+=("$(printf '\033[36mctx: %s%%\033[0m' "$(printf '%.0f' "$used")")")

# New segment 1: session token usage (magenta)
[ -n "$session_tokens_fmt" ] && parts+=("$(printf '\033[35mtokens: %s\033[0m' "$session_tokens_fmt")")

# New segment 2: countdown to next rate-limit reset, with optional used-% annotation (dimmed yellow)
if [ -n "$reset_countdown" ]; then
  if [ -n "$rate_pct" ]; then
    reset_label="$(printf 'resets in %s (%s%%)' "$reset_countdown" "$(printf '%.0f' "$rate_pct")")"
  else
    reset_label="resets in $reset_countdown"
  fi
  parts+=("$(printf '\033[33m%s\033[0m' "$reset_label")")
fi

output=""
for part in "${parts[@]}"; do
  [ -n "$output" ] && output="$output $(printf '\033[90m|\033[0m') "
  output="$output$part"
done

printf '%s' "$output"
