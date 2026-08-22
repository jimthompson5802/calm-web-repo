# Scripts

Helper scripts for the local `setup-keycloak-web` stack.

## Test client-credentials with `curl`

After `make start-webserver-authcerts`, you can test the local Keycloak machine client and the protected static content without CALM CLI.

Make sure your local `.env` contains `KEYCLOAK_DIRECT_URL_CLIENT_SECRET` and `CA_CERT_FILE_PATH` and export the same values in your current shell, then run:

```sh
TOKEN_RESPONSE="$(curl --silent --show-error \
  --request POST \
  --cacert ${CA_CERT_FILE_PATH} \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=calm-direct-url' \
  --data-urlencode "client_secret=${KEYCLOAK_DIRECT_URL_CLIENT_SECRET}" \
  https://my-calm.repo:8443/keycloak/realms/calm-local/protocol/openid-connect/token)"

ACCESS_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

curl --fail --silent --show-error \
  --cacert ${CA_CERT_FILE_PATH} \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  https://my-calm.repo:8443/architectures/calm-1.json
```

This flow relies on the local stack accepting the `calm-direct-url` service-account token at the proxy layer. Without a bearer token, the same file request should still be rejected.

You can then fetch a protected file with that bearer token:

```sh
curl --fail --silent --show-error \
  --cacert ${CA_CERT_FILE_PATH} \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  https://my-calm.repo:8443/architectures/calm-1.json
```

To confirm the route is protected, the same request without a token should return `401`:

```sh
curl --include --silent --show-error \
  https://my-calm.repo:8443/architectures/calm-1.json
```
