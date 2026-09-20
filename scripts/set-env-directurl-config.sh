#!/usr/bin/env bash

# This helper must be sourced so its exports affect the invoking shell.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    printf 'Source this script instead: source %s\n' "$0" >&2
    exit 1
fi

_set_directurl_config_environment() {
    local script_dir repository_root config_path exports

    if ! command -v jq >/dev/null 2>&1; then
        printf 'jq is required to read the direct URL config.\n' >&2
        return 1
    fi

    script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || return 1
    repository_root="$(cd -- "${script_dir}/.." && pwd)" || return 1
    config_path="${repository_root}/custom-idp/v3/generated/direct-url-auth.json"

    if [[ ! -f "${config_path}" ]]; then
        printf 'Direct URL config file does not exist: %s\n' "${config_path}" >&2
        return 1
    fi

    if ! exports="$(jq -er '
        def required_string($field):
            .[$field] as $value
            | if ($value | type) == "string" and ($value | length) > 0
              then $value
              else error("missing or empty string field: " + $field)
              end;
        [
            required_string("tokenUrl"),
            required_string("clientId"),
            required_string("vaultUrl"),
            required_string("vaultToken"),
            required_string("vaultSecretPath"),
            required_string("vaultSecretField")
        ] as $values
        | "export DIRECT_URL_CONFIG_TOKEN_URL=\($values[0] | @sh)\n"
        + "export DIRECT_URL_CONFIG_CLIENT_ID=\($values[1] | @sh)\n"
        + "export DIRECT_URL_CONFIG_VAULT_URL=\($values[2] | @sh)\n"
        + "export DIRECT_URL_CONFIG_VAULT_TOKEN=\($values[3] | @sh)\n"
        + "export DIRECT_URL_CONFIG_VAULT_SECRET_PATH=\($values[4] | @sh)\n"
        + "export DIRECT_URL_CONFIG_VAULT_SECRET_FIELD=\($values[5] | @sh)"
    ' "${config_path}")"; then
        printf 'Failed to read required direct URL config fields from %s.\n' "${config_path}" >&2
        return 1
    fi

    # jq's @sh formatter quotes each JSON string before it is evaluated.
    eval "${exports}"
}

if _set_directurl_config_environment; then
    unset -f _set_directurl_config_environment
    return 0
fi

unset -f _set_directurl_config_environment
return 1
