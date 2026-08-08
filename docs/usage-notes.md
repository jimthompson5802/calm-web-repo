## Notes as of 2026-08-08

## Test of validating architectures with `details.detailed-architecture` references

```
$ ./scripts/validate-detailed-architecture.sh 
+ printf '\n\nValidating top level CALM architecture files with valid detailed architectures...NO Errors\n'


Validating top level CALM architecture files with valid detailed architectures...NO Errors
+ calm validate -a http://localhost:8080/architectures/calm-3.json
(node:76841) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: http://localhost:8080
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: http://localhost:8080
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\nValid detailed architecture file...NO Errors\n'


Valid detailed architecture file...NO Errors
+ calm validate -a http://localhost:8080/architectures/calm-hub-detail.architecture.json
(node:76842) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: http://localhost:8080
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: http://localhost:8080
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\n\nValid top-level architecture that references a detailed architecture with an error in it. No Errors flagged\n'



Valid top-level architecture that references a detailed architecture with an error in it. No Errors flagged
+ calm validate -a http://localhost:8080/architectures/calm-3-ref-bad.json
(node:76843) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: http://localhost:8080
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: http://localhost:8080
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\n\nDetailed architecture with an error in it. ERRORS flagged\n'



Detailed architecture with an error in it. ERRORS flagged
+ calm validate -a http://localhost:8080/architectures/calm-hub-detail.architecture-bad.json
(node:76846) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: http://localhost:8080
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: http://localhost:8080
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [
        {
            "code": "connects-relationship-references-existing-nodes-in-architecture",
            "severity": "error",
            "message": "'mongodb-bad' does not refer to the unique-id of an existing node.",
            "path": "/relationships/2/relationship-type/connects/destination/node",
            "schemaPath": "",
            "line_start": 0,
            "line_end": 0,
            "character_start": 2153,
            "character_end": 2166,
            "source": "architecture"
        },
        {
            "code": "architecture-nodes-must-be-referenced",
            "severity": "warning",
            "message": "Node with ID 'mongodb' is not referenced by any relationships.",
            "path": "/nodes/3/unique-id",
            "schemaPath": "",
            "line_start": 0,
            "line_end": 0,
            "character_start": 1047,
            "character_end": 1056,
            "source": "architecture"
        }
    ],
    "hasErrors": true,
    "hasWarnings": true
```

## Web server capable commands (can fetch CALM docs over HTTP/HTTPS)

1. calm validate
- Supports remote input for architecture, pattern, and timeline.
- Examples of remote-capable flags: --architecture, --pattern, --timeline.
- Direct URL loading is host-restricted by allowed remote hosts.

2. calm generate
- Supports remote pattern input (not remote architecture input).
- Remote-capable flag: --pattern.

3. calm hub pull architecture
- Fetches architecture documents from a CALM Hub server over HTTP.

4. calm hub pull pattern
- Fetches pattern documents from a CALM Hub server over HTTP.

5. calm hub pull standard
- Fetches standard documents from a CALM Hub server over HTTP.

6. calm hub pull control-requirement and control-configuration
- Fetches control documents from CALM Hub over HTTP.

7. calm hub list and calm hub create
- Access CALM Hub over HTTP for listing/creating resources (not file-path inputs, but still server access).

8. calm workspace push, workspace check, workspace bump
- These call CALM Hub over HTTP for comparison/publish workflows.

## Local-file-only commands (for CALM document file inputs)

1. calm docify
- --architecture expects a local file path.

2. calm template
- --architecture expects a local file path.

3. calm diff
- --document-a and --document-b are local file paths.
- --timeline is also local timeline file input.

4. calm timeline
- --architecture inputs are local files.

5. calm workspace add/new/rm/tree/list/show/switch/clean
- Local workspace/bundle operations.

## Quick rule of thumb

1. If the command path uses the document loader path (notably validate and generate), it can use direct HTTP/HTTPS document URLs (subject to host allowlist).
2. If it is a templating/doc generation/diff/timeline file-processing command, it is local-file based.
3. If it is under calm hub, it talks to CALM Hub server APIs over HTTP rather than reading local file URLs directly.