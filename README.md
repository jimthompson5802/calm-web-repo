# CALM Artifact Access Testbed

Repository for serving FINOS CALM JSON content with Nginx, plus Python and TypeScript application scaffolds for future API and UI work. Local development supports both authenticated HTTPS backed by Keycloak and a noauth HTTP mode for static-only serving, with an anonymous health check for operational use.

Protected repository content in the auth-enabled modes is bearer-token-only for normal access. The supported local automation path is CALM CLI direct URL loading with the `custom-idp/v2` client-credentials module against the bundled Keycloak realm.

The local `calm-direct-url` machine client uses a Keycloak service-account token. The web stack is configured to accept that bearer token directly for protected static content.

The canonical local stack origin is `https://my-calm.repo:8443`. Each startup target resolves the public host from `CALM_PUBLIC_HOST`, falling back to the current auto-detected local IP only when no hostname is configured.

## Testbed for CALM DirectUrlDocumentLoader Authentication

For local testing purposes, after building the `calm cli` with support for the `directUrlAuth` plugin, run from the `architecture-as-code` root directory `npm run link:cli`.

The `make` startup targets do more than launch the local web stack variants. They also keep `~/.calm.json` aligned with the active test setup by repointing that symlink to the scenario-specific CALM CLI config before each stack starts. See [Setup test configuration specific `.calm.json` files](#setup-test-configuration-specific-calmjson-files) for details.

### `start-webserver-noauth`  (Baseline No Authentication)
`start-webserver-noauth` models the simplest local serving path: an nginx container exposes the `static_http/` content tree over plain HTTP on port `8080`. This architecture excludes `oauth2-proxy` and Keycloak, and keeps the health endpoint anonymously available for basic checks.

**To test run following bash script**:

```
./scripts/validate-architecture.sh
```

[CALM Architecture JSON](docs/architecture/start-webserver-noauth.architecture.json)

![](docs/images/my-calm-repo-noauth.png)

### `start-webserver-authonly` (Simple hard-coded authentication in Header)
`start-webserver-authonly` models the lightweight protected local mode built around the Compose-managed Python `pyweb` server. It serves the same `static_http/` content tree over `127.0.0.1:8080`, requires `Authorization: XYZ` for static content requests, and leaves `/health` accessible without that header.

**To test run following bash script**:

```
./scripts/validate-architecture.sh
```

[CALM Architecture JSON](docs/architecture/start-webserver-authonly.architecture.json)

![](docs/images/my-calm-repo-authonly.png)

### `start-webserver-authcerts` (Oauth2 client-credential authentication)
`start-webserver-authcerts` models the full local authenticated HTTPS stack. Nginx fronts the `static_authcerts/` content tree on port `8443`, uses generated TLS assets, delegates protected-content checks to `oauth2-proxy`, and exposes the bundled Keycloak realm that supports bearer-token and OIDC-backed access.

**To test run following bash script**:

```
./scripts/validate-architecture.sh https://my-calm.repo:8443
```

[CALM Architecture JSON](docs/architecture/start-webserver-authcerts.architecture.json)

![](docs/images/my-calm-repo-authcerts.png)

## Documentation
- [`docs/usage-notes.md`](docs/usage-notes.md) captures CALM CLI behavior notes for local-file vs HTTP-loaded resources.
- [`docs/validate-architecture-script.md`](docs/validate-architecture-script.md) describes the scripted CALM architecture validation checks.
- [`docs/control-validation-test-explanation.md`](docs/control-validation-test-explanation.md) explains node-level control validation results for `control-test-architecture.json`.

## Layout

- `static_http/` and `static_authcerts/` hold the source CALM static trees used by the local web-server startup modes.
- Each static tree contains `architectures/`, `patterns/`, `standards/`, and `controls/` content.
- `apps/pyweb/` holds the small Python server used by the authonly local mode.
- `infra/nginx/` holds the Nginx config and local TLS assets.
- `infra/keycloak/` holds the local Keycloak realm template used to generate the dev import.

`/api` is reserved for future reverse proxying. Do not use that path for static assets.

## Prerequisites

- Docker and `docker-compose`
- Python 3.12+
- `uv`
- Node.js (LTS recommended)
- npm
- A local hosts-file entry, e.g., in `/etc/hosts` on MacOS, such as `127.0.0.1 my-calm.repo`

## Setup test configuration specific `.calm.json` files

Do not create `~/.calm.json` as a regular file. The Makefile manages it as a symlink.

### Template: `~/.calmnoauth.json`

Use this file for `make start-webserver-noauth`.

```json
{
  "allowedRemoteHosts": ["my-calm.repo"]
}
```

Notes:

- This mode serves content over plain HTTP from the nginx-only stack.
- No direct URL auth module is required.

## Template: `~/.calmauthonly.json`

Use this file for `make start-webserver-authonly`.

```json
{
  "allowedRemoteHosts": ["my-calm.repo"],
  "directUrlAuth": {
    "module": "/ABSOLUTE/PATH/TO/calm-web-repo/custom-idp/v1/dist/direct-url-auth.js",
    "configPath": "/ABSOLUTE/PATH/TO/calm-web-repo/custom-idp/v1/config/direct-url-auth.json"
  }
}
```

### Build directUrlAuth Plugin for authonly

Build the `v1` module:

```bash
cd custom-idp/v1
npm install
npm run build
```

Notes:

- This mode serves content from `apps/pyweb` on `http://my-calm.repo:8080`.
- This mirrors the cert-based template structure, but points to the checked-in `custom-idp/v1` example instead of the `v2` Keycloak client-credentials module.
- The `directUrlAuth.module` value must point to the built JavaScript output, not the TypeScript source.
- The `directUrlAuth.configPath` value points to the checked-in `custom-idp/v1/config/direct-url-auth.json` example config.

## Template: `~/.calmauthcerts.json`

Use this file for `make start-webserver-authcerts`.

```json
{
  "allowedRemoteHosts": ["my-calm.repo", "localhost"],
  "directUrlAuth": {
    "module": "/ABSOLUTE/PATH/TO/calm-web-repo/custom-idp/v2/dist/direct-url-auth.js",
    "configPath": "/ABSOLUTE/PATH/TO/calm-web-repo/custom-idp/v2/generated/direct-url-auth.json"
  }
}
```

### Build directUrlAuth Plugin for authcerts

Build the `v2` module:

```bash
cd custom-idp/v2
npm install
npm run build
```


Notes:

- This mode serves protected content through HTTPS on `https://my-calm.repo:8443`.
- The `directUrlAuth.module` value must point to the built JavaScript output, not the TypeScript source.
- The `directUrlAuth.configPath` value must point to the generated JSON written by `./scripts/render-direct-url-auth-config.py`.


## Commands

- `make start-webserver-noauth` mounts `static_http/` directly into `nginx` and starts it on `http://<host>:8080`.
- `make start-webserver-authonly` repoints `~/.calm.json` to `~/.calmauthonly.json`, mounts `static_http/` directly into the `apps/pyweb` container, and starts it through Docker Compose on `http://127.0.0.1:8080`.
- `make start-webserver-authcerts` generates local TLS/auth assets, mounts `static_authcerts/` directly into `nginx`, and starts the full auth stack in detached mode.
- `make stop-webserver` stops Compose-managed local web services and removes the Compose resources.

## Validation

- `docker-compose config` validates Compose configuration.
- `CALM_NGINX_CONF_PATH=./infra/nginx/nginx.noauth.conf CALM_NGINX_PORT_MAP=8080:8080 docker-compose config` validates the noauth nginx selection.
- `uv run --project apps/pyweb pytest` validates Python authonly server behavior.
- `./scripts/validate-architecture.sh` is intentionally unchanged in this repo revision and still needs a follow-up update before it matches the authenticated HTTPS-only stack.

## Control Authoring Note

- The tracked CALM source files under `static_http/` and `static_authcerts/` are mounted directly into the serving container for the corresponding startup target.
- Some tracked JSON files still use `https://localhost:8443/...` placeholders. The startup flow does not rewrite those URLs during serving.
- Control configuration is intentionally inlined with `config` for architecture requirements in this repo.
- Keep control configs in `static_*/controls/**/configs/*.json` as reusable source artifacts, but copy values inline when updating architecture control requirements. At present there appears to be a false-positive error when the config-url is used.

## Static Content

`make start-webserver-authonly` serves static content through the Compose-managed Python server on `http://127.0.0.1:8080` and requires `Authorization: XYZ`. `make start-webserver-authcerts` serves authenticated static content through the HTTPS Keycloak-backed stack on `https://my-calm.repo:8443`. `make start-webserver-noauth` serves the same static URL layout over plain HTTP on port `8080`, without Keycloak or `oauth2-proxy`. In all modes, a health endpoint remains available.

Sample URLs after `make start-webserver-authonly`:

- `http://127.0.0.1:8080/architectures/calm-1.json`
- `http://127.0.0.1:8080/patterns/company-base-pattern.json`
- `http://127.0.0.1:8080/controls/security/schemas/tls-encryption.json`
- `http://127.0.0.1:8080/health`

Sample URLs after `make start-webserver-authcerts`:

- `https://my-calm.repo:8443/`
- `https://my-calm.repo:8443/architectures/calm-1.json`
- `https://my-calm.repo:8443/patterns/company-base-pattern.json`
- `https://my-calm.repo:8443/standards/company-node-standard.json`
- `https://my-calm.repo:8443/controls/security/schemas/tls-encryption.json`
- `https://my-calm.repo:8443/healthz`
- `https://my-calm.repo:8443/keycloak/admin/master/console/`

Sample URLs after `make start-webserver-noauth`:

- `http://my-calm.repo:8080/`
- `http://my-calm.repo:8080/architectures/calm-1.json`
- `http://my-calm.repo:8080/patterns/company-base-pattern.json`
- `http://my-calm.repo:8080/standards/company-node-standard.json`
- `http://my-calm.repo:8080/controls/security/schemas/tls-encryption.json`
- `http://my-calm.repo:8080/healthz`

For bearer-token CLI flows using CALM `directUrlAuth`, `my-calm.repo` is the preferred origin. `localhost` remains accepted by the CLI for compatibility when the stack origin file points at a different local hostname.

## Web Server

### Start

1. Copy `.env.example` to `.env`.
2. Ensure your local resolver maps `my-calm.repo` to `127.0.0.1`.
3. Set local-only values for:
   - `CALM_PUBLIC_HOST`
   - `KC_BOOTSTRAP_ADMIN_PASSWORD`
   - `OAUTH2_PROXY_CLIENT_SECRET`
   - `OAUTH2_PROXY_COOKIE_SECRET`
   - `KEYCLOAK_DIRECT_URL_CLIENT_SECRET`
   - `KEYCLOAK_TEST_USER_PASSWORD`
4. Start one of the local stack modes:

```sh
make start-webserver-noauth
make start-webserver-authonly
make start-webserver-authcerts
```

`make start-webserver-noauth` will:

- resolve `CALM_PUBLIC_HOST` from the shell, `.env`, or the current auto-detected local IP and export it for the startup sequence
- repoint `~/.calm.json` to `~/.calmnoauth.json`, removing a prior symlink and failing if `~/.calm.json` exists as a regular file
- mount `static_http/` directly into `nginx`
- start only `nginx` with the noauth nginx config and `8080:8080` port publishing
- serve repository content over `http://<host>:8080` without `keycloak` or `oauth2-proxy`

`make start-webserver-authonly` will:

- repoint `~/.calm.json` to `~/.calmauthonly.json`, removing a prior symlink and failing if `~/.calm.json` exists as a regular file
- mount `static_http/` directly into the `pyweb` container
- build and start the `pyweb` Compose service in detached mode
- serve repository content from `static_http/` through `http://127.0.0.1:8080`
- require `Authorization: XYZ` for static `GET` and `HEAD` requests

`make start-webserver-authcerts` will:

- resolve `CALM_PUBLIC_HOST` from the shell, `.env`, or the current auto-detected local IP and export it for the startup sequence
- run `./scripts/generate-local-certs.sh` to create `infra/nginx/certs/localhost.crt` and `infra/nginx/certs/localhost.key` if they are missing, or regenerate them if the detected host is not present in the certificate SANs
- run `./scripts/render-keycloak-realm.py` to render `infra/keycloak/calm-local-realm.template.json` into `infra/keycloak/import/calm-local-realm.json` using values from `.env`
- run `./scripts/render-direct-url-auth-config.py` to generate `custom-idp/v2/generated/direct-url-auth.json` for the local machine client
- repoint `~/.calm.json` to `~/.calmauthcerts.json`, removing a prior symlink and failing if `~/.calm.json` exists as a regular file
- mount `static_authcerts/` directly into `nginx`
- start `keycloak`, `oauth2-proxy`, and `nginx`
- serve repository content only through bearer-token-authenticated HTTPS
- serve the Keycloak admin console through the HTTPS Keycloak path

If you need a cookie secret, generate one with:

```sh
openssl rand -hex 16
```

If you need a machine-client secret for the local Keycloak `calm-direct-url` client, generate one with:

```sh
openssl rand -hex 24
```

Only `KEYCLOAK_DIRECT_URL_CLIENT_SECRET` feeds the generated direct-URL auth config used by the CALM CLI machine client. The other variables above are still required for the full local auth-enabled stack, but they are not part of the direct-URL auth config contract.

### CALM CLI direct URL auth

Build the supported local cert-based auth module after starting `make start-webserver-authcerts`:

```sh
cd custom-idp/v2
npm install
npm test
```

Each startup target now selects the active CALM CLI config by repointing `~/.calm.json`:

- `make start-webserver-noauth` -> `~/.calmnoauth.json`
- `make start-webserver-authonly` -> `~/.calmauthonly.json`
- `make start-webserver-authcerts` -> `~/.calmauthcerts.json`

If `~/.calm.json` is already a symlink, the target replaces it. If it exists as a regular file, startup fails instead of overwriting it.

For `make start-webserver-authcerts`, point `~/.calmauthcerts.json` at the built module and the generated local config:

```json
{
  "allowedRemoteHosts": ["my-calm.repo", "localhost"],
  "directUrlAuth": {
    "module": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/generated/direct-url-auth.json"
  }
}
```

`custom-idp/v2` is a header-only direct URL auth module. It acquires an OAuth 2.0 client-credentials token and implements `getAuthHeaders(url, requestBody)` for the CALM CLI. It does not implement `getTlsConfig()` or load private CA trust from the plugin config. See [`custom-idp/v2/README.md`](custom-idp/v2/README.md) for the sample module details.

The generated direct URL auth config is intentionally minimal and supports only OAuth 2.0 client credentials:

```json
{
  "tokenUrl": "https://my-calm.repo:8443/keycloak/realms/calm-local/protocol/openid-connect/token",
  "clientId": "calm-direct-url",
  "clientSecret": "<secret>"
}
```

Required keys:

- `tokenUrl`
- `clientId`
- `clientSecret`

If the token endpoint or protected direct URL uses a private or self-signed CA, configure Node trust before running `calm`. Keep private CA files out of source control and place them in a local path such as `custom-idp/v2/config/certs/private-root-ca.pem` or another machine-specific private directory. Then export:

```sh
export NODE_EXTRA_CA_CERTS="/absolute/path/to/private-root-ca.pem"
```

`NODE_TLS_REJECT_UNAUTHORIZED=0` can disable certificate validation for the Node process, but it is a troubleshooting override and not the recommended default.

The direct URL auth config does not support or require `baseUrl`, `realm`, `clientSecretEnvVar`, `audience`, `scopes`, PKCE fields, redirect URLs, or test-user/admin credentials.

Then protected documents can be fetched non-interactively, for example:

```sh
calm validate -a https://my-calm.repo:8443/architectures/calm-1.json
```

### Stop

Stop the static server and remove the Compose resources:

```sh
make stop-webserver
```

## Secret Handling

- Real secrets stay in local `.env`, `infra/nginx/certs/`, `infra/keycloak/import/`, and generated ignored direct-url auth config files.
- `.env.example` is safe to commit because it contains placeholders only.
- `.gitignore` excludes `.env`, local certificates, generated Keycloak import artifacts, and generated direct-url auth config so they do not get committed to the public repository.
- The tracked Keycloak file is a template; the real client secrets and test-user password are rendered locally before startup.
