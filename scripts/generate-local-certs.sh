#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cert_dir="${repo_root}/infra/nginx/certs"
cert_path="${cert_dir}/localhost.crt"
key_path="${cert_dir}/localhost.key"
custom_idp_cert_dir="${CUSTOM_IDP_CERT_DIR:-${repo_root}/custom-idp/v2/certs}"
custom_idp_cert_path="${custom_idp_cert_dir}/localhost.crt"
public_host="${CALM_PUBLIC_HOST:-$(python3 "${repo_root}/scripts/detect_public_host.py")}"

mkdir -p "${cert_dir}"

sync_custom_idp_cert() {
  mkdir -p "${custom_idp_cert_dir}"
  cp "${cert_path}" "${custom_idp_cert_path}"
}

if [[ -f "${cert_path}" && -f "${key_path}" ]]; then
  certificate_text="$(openssl x509 -in "${cert_path}" -noout -text 2>/dev/null || true)"
  certificate_has_required_hosts=true
  for required_host in "${public_host}" my-calm.repo your-calm.repo; do
    if ! grep -Fq "${required_host}" <<<"${certificate_text}"; then
      certificate_has_required_hosts=false
      break
    fi
  done

  if [[ "${certificate_has_required_hosts}" == true ]]; then
    sync_custom_idp_cert
    exit 0
  fi
fi

tmp_config="$(mktemp)"
trap 'rm -f "${tmp_config}"' EXIT

if [[ "${public_host}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  public_host_alt_name="IP.2 = ${public_host}"
else
  public_host_alt_name="DNS.5 = ${public_host}"
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
DNS.3 = my-calm.repo
DNS.4 = your-calm.repo
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

sync_custom_idp_cert
