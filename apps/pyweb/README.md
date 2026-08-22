# pyweb

Small Python standard-library web server for serving files from the repository `static_authonly/` directory.

This is a developer helper for local work. `make start-webserver-authonly` now uses this Python server in the foreground instead of the docker/nginx auth stack.

## Commands

Run these commands from the repository root unless noted otherwise:

```sh
uv sync --project apps/pyweb                         # Install the project plus dev dependencies
uv run --project apps/pyweb pyweb                    # Start the server with the default host and port
uv run --project apps/pyweb pyweb --simple-auth      # Start the server with simple header-based auth enabled
uv run --project apps/pyweb pyweb --host 127.0.0.1 --port 8081  # Start the server with explicit bind settings
make start-webserver-authonly                        # Repoint ~/.calm.json and run pyweb --simple-auth in the foreground
uv run --project apps/pyweb pytest                   # Run the pyweb test suite
uv run --project apps/pyweb mypy                     # Run static type checking
uv run --project apps/pyweb ruff check .             # Run lint checks
```

## Behavior

- Serves `GET /<path>` and `HEAD /<path>` from `../../static_authonly/<path>`
- Mirrors the Nginx URL layout, for example:
  - `/architectures/calm-1.json`
  - `/patterns/company-base-pattern.json`
  - `/controls/security/schemas/tls-encryption.json`
- Supports optional `--simple-auth`, which requires `Authorization: XYZ` for static file `GET` and `HEAD` requests
- Prints a startup confirmation to stdout and tells you to use `CTRL-C` to stop the server
- Rejects path traversal attempts
- Returns `403` when `--simple-auth` is enabled and the auth header is missing or wrong
- Returns `404` for missing files and directories
- Exposes `GET /health` with `{"status":"ok"}`

## curl Examples

Without simple auth enabled:

```sh
curl http://127.0.0.1:8080/architectures/calm-1.json
curl http://127.0.0.1:8080/health
```

With simple auth enabled:

```sh
curl -H 'Authorization: XYZ' http://127.0.0.1:8080/architectures/calm-1.json
curl -I -H 'Authorization: XYZ' http://127.0.0.1:8080/architectures/calm-1.json
curl http://127.0.0.1:8080/health
```

Expected startup confirmation when `--simple-auth` is enabled:

```text
Simple authentication enabled; static GET and HEAD requests require Authorization: XYZ
```

Expected auth failure when `--simple-auth` is enabled:

```sh
curl -i http://127.0.0.1:8080/architectures/calm-1.json
curl -i -H 'Authorization: wrong' http://127.0.0.1:8080/architectures/calm-1.json
```

## Notes

- Default host: `127.0.0.1`
- Default port: `8080`
- `--simple-auth` does not apply to `/health`
- `make start-webserver-authonly` runs `pyweb --simple-auth` in the foreground and is stopped with `CTRL-C`
- The repo's nginx/docker startup targets are `make start-webserver-noauth` and `make start-webserver-authcerts`
