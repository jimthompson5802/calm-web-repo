#!/bin/bash

set -x

printf "\n\nValidating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED\n"
calm validate -a http://localhost:8080/architectures/calm-3.json

printf "\n\nValid detailed architecture file...NO ERRORS EXPECTED\n"
calm validate -a http://localhost:8080/architectures/calm-hub-detail.architecture.json

printf "\n\n\nValid top-level architecture that references a detailed architecture with an error in it. No Errors flagged\n"
calm validate -a http://localhost:8080/architectures/calm-3-ref-bad.json

printf "\n\n\nDetailed architecture with an error in it. ERRORS EXPECTED\n"
calm validate -a http://localhost:8080/architectures/calm-hub-detail.architecture-bad.json

printf "\n\n\nValidate architecture against pattern/standards NO ERRORS EXPECTED\n"
calm validate -a http://localhost:8080/architectures/generated-webapp.json -p http://localhost:8080/patterns/company-base-pattern.json 

printf "\n\n\nValidate architecture with Controls.  NO ERRORS EXPECTED\n"
calm validate -a http://localhost:8080/architectures/ecommerce-platform.json 