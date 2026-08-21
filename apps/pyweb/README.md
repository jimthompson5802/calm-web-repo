# pyweb

Small Python standard-library web server for serving files from the repository `static/` directory.

This is a developer helper for local work. It does not replace the existing Nginx workflow.

## Commands

Run these commands from the repository root unless noted otherwise:

```sh
uv sync --project apps/pyweb                         # Install the project plus dev dependencies
uv run --project apps/pyweb pyweb                    # Start the server with the default host and port
uv run --project apps/pyweb pyweb --host 127.0.0.1 --port 8081  # Start the server with explicit bind settings
uv run --project apps/pyweb pytest                   # Run the pyweb test suite
uv run --project apps/pyweb mypy                     # Run static type checking
uv run --project apps/pyweb ruff check .             # Run lint checks
```

## Behavior

- Serves `GET /<path>` from `../../static/<path>`
- Mirrors the Nginx URL layout, for example:
  - `/architectures/calm-1.json`
  - `/patterns/company-base-pattern.json`
  - `/controls/security/schemas/tls-encryption.json`
- Rejects path traversal attempts
- Returns `404` for missing files and directories
- Exposes `GET /health` with `{"status":"ok"}`

## Notes

- Default host: `127.0.0.1`
- Default port: `8081`
- Existing `make start-web-server` / Nginx flow remains unchanged
