#!/usr/bin/env bash
# The dmf and lowy plugins cannot read each other's files once installed,
# so each keeps its own copy of the shared contracts. Fail when the copies drift.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shared=(project-profile.md review-findings.md design-directory.md)
status=0

for file in "${shared[@]}"; do
  if ! diff -u "$root/plugins/dmf/references/$file" "$root/plugins/lowy/references/$file"; then
    echo "Shared contract drifted: plugins/dmf/references/$file and plugins/lowy/references/$file differ." >&2
    status=1
  fi
done

exit "$status"
