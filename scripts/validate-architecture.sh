#!/bin/bash

base_url_host="${1:-http://my-calm.repo:8080}"

trace_on() {
  set -x
}

trace_off() {
  set +x
}

run_validation() {
  local message="$1"
  shift

  trace_off
  printf "\n\n%s\n" "$message"
  trace_on
  calm validate "$@"
  trace_off
}

run_validation \
  "Validating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/calm-1.json" -f pretty

run_validation \
  "Validating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/calm-2.json" -f pretty

run_validation \
  "Validating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/calm-3.json" -f pretty

run_validation \
  "Valid detailed architecture file...NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/calm-hub-detail.architecture.json" -f pretty

run_validation \
  "Valid top-level architecture that references a detailed architecture with an error in it. No Errors flagged" \
  -a "${base_url_host}/architectures/calm-3-ref-bad.json" -f pretty

run_validation \
  "Detailed architecture with an error in it. ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/calm-hub-detail.architecture-bad.json" -f pretty

run_validation \
  "Validate architecture against pattern/standards NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/generated-webapp.json" \
  -p "${base_url_host}/patterns/company-base-pattern.json" \
  -f pretty

run_validation \
  "Validate architecture with Controls. NO ERRORS EXPECTED" \
  -a "${base_url_host}/architectures/ecommerce-platform.json" -f pretty
