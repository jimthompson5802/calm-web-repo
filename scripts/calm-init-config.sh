#!/bin/bash

calm init-config \
  --allowed-remote-hosts 'your-calm.repo' \
  --direct-url-auth-module '~/Desktop/finos/calm-web-repo/custom-idp/v3/dist/direct-url-auth.js' \
  --direct-url-auth-config-path '~/Desktop/finos/calm-web-repo/custom-idp/v3/generated/direct-url-auth.json' \
  --direct-url-auth-authenticated-hosts 'my-calm.repo,this-calm.repo'