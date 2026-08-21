#!/usr/bin/env bash

set -euo pipefail

# These document IDs and references are written as if the files were stored in CALMHub.
# For this local example, calm resolves them through the URL mapping file instead.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

calm validate \
  -a sandbox/example/two-node.architecture.json \
  -p sandbox/example/two-node.pattern.json \
  --url-to-local-file-mapping sandbox/example/url-to-local-file-mapping.json \
  -f pretty
