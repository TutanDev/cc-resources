#!/usr/bin/env bash
# Lays the library lending service the request is about into the empty workspace.
set -euo pipefail
cp -R "$(dirname "$0")/../library/." .
