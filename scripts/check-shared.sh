#!/usr/bin/env bash
# The dmf, lowy and devflow plugins cannot read each other's files once installed,
# so each keeps its own copy of the shared contracts. Fail when the copies drift.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shared=(project-profile.md review-findings.md design-directory.md)
# dmf holds the reference copy; every other plugin listed here must match it.
copies=(lowy devflow)
status=0

for file in "${shared[@]}"; do
  for plugin in "${copies[@]}"; do
    if ! diff -u "$root/plugins/dmf/references/$file" "$root/plugins/$plugin/references/$file"; then
      echo "Shared contract drifted: plugins/dmf/references/$file and plugins/$plugin/references/$file differ." >&2
      status=1
    fi
  done
done

exit "$status"
