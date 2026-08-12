# Agent Guidance

## Scope

- Nginx is static-first for repo content in the current local stack.
- Static content is served over authenticated HTTPS backed by Keycloak.
- `oauth2-proxy` sits in front of normal content requests.
- `/healthz` is the anonymous operational endpoint.
- `/keycloak/` is exposed for the local auth and admin flow.
- `/api` is reserved for future reverse proxying.
- CALM model files live under `static/` and are rendered into the served static tree for the HTTPS stack.

## Layout

- Put CALM architecture JSON files in `static/architectures/`.
- Put CALM pattern JSON files in `static/patterns/`.
- Put CALM standard JSON files in `static/standards/`.
- Put CALM control requirement schemas in `static/controls/**/schemas/`.
- Put CALM control configs in `static/controls/**/configs/`.
- Keep Python service work under `apps/api/`.
- Keep TypeScript web work under `apps/web/`.
- Keep Nginx config under `infra/nginx/`.
- Keep repo guidance and usage notes in `docs/`.
- Keep helper scripts in `scripts/`.

## Commands

- `make start-web-server`
- `make stop-web-server`
- `make bootstrap`
- `make test-api`
- `make typecheck-web`
- `./scripts/validate-architecture.sh`

## Validation

- Validate Compose changes with `docker-compose config`.
- Validate Python changes with `make test-api`.
- Validate TypeScript changes with `make typecheck-web`.
- Validate CALM architecture changes with `./scripts/validate-architecture.sh` after the static server is running.
