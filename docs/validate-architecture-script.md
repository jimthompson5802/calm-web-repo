# validate-architecture.sh

`scripts/validate-architecture.sh` is retained as a legacy validation helper and still contains the pre-auth remote URL commands. This document describes what the script checks and records that a follow-up change is required before it will match the current authenticated HTTPS-only stack.

## Purpose

Use this document to understand the intended validation coverage of the retained script. The script itself is intentionally unchanged in this repo revision and still targets legacy unauthenticated URLs.

The script covers these scenarios:

- A valid top-level architecture that references a valid detailed architecture.
- A valid detailed architecture on its own.
- A top-level architecture that references a detailed architecture containing an error, showing that the reference is not currently flagged from the parent validation.
- A detailed architecture with a known validation error, where errors and warnings are expected.
- A generated architecture validated against a pattern.
- An architecture that includes control requirements.

## Prerequisites

- The local web stack now serves repository content over authenticated `https://localhost:8443`.
- The `calm` CLI must be installed and available on `PATH`.
- The repository's static assets must be available under the expected paths such as `/architectures` and `/patterns`.

Start the local static server with:

```sh
make start-web-server
```

The script still uses legacy unauthenticated URLs and is pending a separate auth-aware update. Do not treat it as the supported validation path for the current HTTPS-only stack.

## Run

The current script command remains:

```sh
./scripts/validate-architecture.sh
```

The script uses `set -x`, so each `calm validate` command is echoed before it runs. Those commands still reference the removed anonymous HTTP endpoint until a later follow-up change updates the workflow.

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

- This script still validates documents over legacy remote URLs, not by local file path.
- The behavior around referenced detailed architectures is documented intentionally because it captures a current validation gap.
- Related command output examples and CLI notes are recorded in `docs/usage-notes.md`.
