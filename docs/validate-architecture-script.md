# validate-architecture.sh

`scripts/validate-architecture.sh` runs a fixed set of CALM CLI validation commands against the JSON documents served by the local static web server.

## Purpose

Use this script to quickly verify that the sample architecture assets in this repository behave as expected when loaded over anonymous HTTP from `http://localhost:8080`.

The script covers these scenarios:

- A valid top-level architecture that references a valid detailed architecture.
- A valid detailed architecture on its own.
- A top-level architecture that references a detailed architecture containing an error, showing that the reference is not currently flagged from the parent validation.
- A detailed architecture with a known validation error, where errors and warnings are expected.
- A generated architecture validated against a pattern.
- An architecture that includes control requirements.

## Prerequisites

- The local web stack must be running and serving the anonymous compatibility endpoint on `http://localhost:8080`.
- The `calm` CLI must be installed and available on `PATH`.
- The repository's static assets must be available under the expected paths such as `/architectures` and `/patterns`.

Start the local static server with:

```sh
make start-web-server
```

The script intentionally uses the anonymous HTTP endpoint rather than the authenticated HTTPS endpoint so that CALM CLI validation does not need to log in through Keycloak.

## Run

From the repository root:

```sh
./scripts/validate-architecture.sh
```

The script uses `set -x`, so each `calm validate` command is echoed before it runs.

## Checks Performed

1. Validate `calm-3.json`.
Expected result: no errors.

2. Validate `calm-hub-detail.architecture.json`.
Expected result: no errors.

3. Validate `calm-3-ref-bad.json`.
Expected result: no errors are currently flagged, even though the referenced detailed architecture contains an error.

4. Validate `calm-hub-detail.architecture-bad.json`.
Expected result: validation errors and warnings.

5. Validate `generated-webapp.json` against `company-base-pattern.json`.
Expected result: no errors.

6. Validate `ecommerce-platform.json`.
Expected result: no errors.

## Notes

- This script validates documents over HTTP, not by local file path.
- The behavior around referenced detailed architectures is documented intentionally because it captures a current validation gap.
- Related command output examples and CLI notes are recorded in `docs/usage-notes.md`.
