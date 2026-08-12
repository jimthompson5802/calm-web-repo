#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_dir="${repo_root}/infra/nginx/certs"
cert_path="${cert_dir}/localhost.crt"
key_path="${cert_dir}/localhost.key"
public_host="${CALM_PUBLIC_HOST:-$(python3 "${repo_root}/scripts/detect_public_host.py")}"

mkdir -p "${cert_dir}"

if [[ -f "${cert_path}" && -f "${key_path}" ]]; then
  if openssl x509 -in "${cert_path}" -noout -text 2>/dev/null | grep -Fq "${public_host}"; then
    exit 0
  fi
fi

tmp_config="$(mktemp)"
trap 'rm -f "${tmp_config}"' EXIT

if [[ "${public_host}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  public_host_alt_name="IP.2 = ${public_host}"
else
  public_host_alt_name="DNS.3 = ${public_host}"
fi

cat > "${tmp_config}" <<EOF
[req]
default_bits = 2048
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = host.docker.internal
IP.1 = 127.0.0.1
$public_host_alt_name
EOF

openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -days 365 \
  -config "${tmp_config}" \
  -keyout "${key_path}" \
  -out "${cert_path}"
