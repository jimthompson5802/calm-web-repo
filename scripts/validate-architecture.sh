#!/bin/bash

base_url_host=${1:-http://my-calm.repo:8080}

set -x

printf "\n\nValidating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED\n"
calm validate -a ${base_url_host}/architectures/calm-3.json -f pretty

printf "\n\nValid detailed architecture file...NO ERRORS EXPECTED\n"
calm validate -a ${base_url_host}/architectures/calm-hub-detail.architecture.json -f pretty

printf "\n\n\nValid top-level architecture that references a detailed architecture with an error in it. No Errors flagged\n"
calm validate -a ${base_url_host}/architectures/calm-3-ref-bad.json -f pretty

printf "\n\n\nDetailed architecture with an error in it. ERRORS EXPECTED\n"
calm validate -a ${base_url_host}/architectures/calm-hub-detail.architecture-bad.json -f pretty

printf "\n\n\nValidate architecture against pattern/standards NO ERRORS EXPECTED\n"
calm validate -a ${base_url_host}/architectures/generated-webapp.json -p ${base_url_host}/patterns/company-base-pattern.json -f pretty

printf "\n\n\nValidate architecture with Controls.  NO ERRORS EXPECTED\n"
calm validate -a ${base_url_host}/architectures/ecommerce-platform.json -f pretty