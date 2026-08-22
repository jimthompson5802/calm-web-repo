# Agent Guidance

## Scope

- Nginx is static-first for repo content in the current local stack.
- Static content can be served through the Compose-managed `apps/pyweb` authonly mode, through authenticated HTTPS backed by Keycloak, or through a noauth HTTP nginx-only mode on port `8080`.
- `oauth2-proxy` sits in front of normal content requests in the cert-based auth mode.
- `/healthz` is the anonymous operational endpoint.
- `/keycloak/` is exposed for the local auth and admin flow.
- `/api` is reserved for future reverse proxying.
- CALM model files live under `static_http/` and `static_authcerts/`, and the selected tree is mounted directly into the serving container for the chosen startup mode.

## Layout

- Put CALM architecture JSON files in the appropriate `static_*/architectures/` tree.
- Put CALM pattern JSON files in the appropriate `static_*/patterns/` tree.
- Put CALM standard JSON files in the appropriate `static_*/standards/` tree.
- Put CALM control requirement schemas in the appropriate `static_*/controls/**/schemas/` tree.
- Put CALM control configs in the appropriate `static_*/controls/**/configs/` tree.
- Keep Python service work under `apps/api/`.
- Keep TypeScript web work under `apps/web/`.
- Keep Nginx config under `infra/nginx/`.
- Keep repo guidance and usage notes in `docs/`.
- Keep helper scripts in `scripts/`.

## Commands

- `make start-webserver-noauth`
- `make start-webserver-authonly`
- `make start-webserver-authcerts`
- `make stop-webserver`
- `make bootstrap`
- `make test-api`
- `make typecheck-web`
- `./scripts/validate-architecture.sh`

## Validation

- Validate Compose changes with `docker-compose config`.
- Validate Python changes with `make test-api`.
- Validate TypeScript changes with `make typecheck-web`.
- Validate CALM architecture changes with `./scripts/validate-architecture.sh` after the static server is running.
