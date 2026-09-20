#!/usr/bin/env bash

# This helper must be sourced so its unsets affect the invoking shell.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    printf 'Source this script instead: source %s\n' "$0" >&2
    exit 1
fi

unset DIRECT_URL_CONFIG_TOKEN_URL
unset DIRECT_URL_CONFIG_CLIENT_ID
unset DIRECT_URL_CONFIG_VAULT_URL
unset DIRECT_URL_CONFIG_VAULT_TOKEN
unset DIRECT_URL_CONFIG_VAULT_SECRET_PATH
unset DIRECT_URL_CONFIG_VAULT_SECRET_FIELD
