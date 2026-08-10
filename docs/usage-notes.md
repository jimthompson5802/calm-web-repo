## Notes as of 2026-08-08

These notes describe CALM CLI document-loading behavior and example validation outputs. Repository content is now served only through authenticated `https://localhost:8443`, and the checked-in validation script is pending a separate follow-up before it can run against the current auth-only stack. The URL examples below are normalized to the current HTTPS origin for documentation consistency.

## Test of validating architectures with `details.detailed-architecture` references, pattern/standards and controls

```
$ ./scripts/validate-architecture.sh 
+ printf '\n\nValidating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED\n'


Validating top level CALM architecture files with valid detailed architectures...NO ERRORS EXPECTED
+ calm validate -a https://localhost:8443/architectures/calm-3.json
(node:67439) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\nValid detailed architecture file...NO ERRORS EXPECTED\n'


Valid detailed architecture file...NO ERRORS EXPECTED
+ calm validate -a https://localhost:8443/architectures/calm-hub-detail.architecture.json
(node:67440) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\n\nValid top-level architecture that references a detailed architecture with an error in it. No Errors flagged\n'



Valid top-level architecture that references a detailed architecture with an error in it. No Errors flagged
+ calm validate -a https://localhost:8443/architectures/calm-3-ref-bad.json
(node:67454) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\n\nDetailed architecture with an error in it. ERRORS EXPECTED\n'



Detailed architecture with an error in it. ERRORS EXPECTED
+ calm validate -a https://localhost:8443/architectures/calm-hub-detail.architecture-bad.json
(node:67455) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
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
}+ printf '\n\n\nValidate architecture against pattern/standards NO ERRORS EXPECTED\n'



Validate architecture against pattern/standards NO ERRORS EXPECTED
+ calm validate -a https://localhost:8443/architectures/generated-webapp.json -p https://localhost:8443/patterns/company-base-pattern.json
(node:67458) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
}+ printf '\n\n\nValidate architecture with Controls.  NO ERRORS EXPECTED\n'



Validate architecture with Controls.  NO ERRORS EXPECTED
+ calm validate -a https://localhost:8443/architectures/ecommerce-platform.json
(node:67459) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": false,
    "hasWarnings": false
```

## Web server capable commands (can fetch CALM docs over HTTPS)

1. calm validate
- Supports remote input for architecture, pattern, and timeline.
- Examples of remote-capable flags: --architecture, --pattern, --timeline.
- Direct URL loading is host-restricted by allowed remote hosts.

2. calm generate
- Supports remote pattern input (not remote architecture input).
- Remote-capable flag: --pattern.

3. calm hub pull architecture
- Fetches architecture documents from a CALM Hub server over HTTPS.

4. calm hub pull pattern
- Fetches pattern documents from a CALM Hub server over HTTPS.

5. calm hub pull standard
- Fetches standard documents from a CALM Hub server over HTTPS.

6. calm hub pull control-requirement and control-configuration
- Fetches control documents from CALM Hub over HTTPS.

7. calm hub list and calm hub create
- Access CALM Hub over HTTPS for listing/creating resources (not file-path inputs, but still server access).

8. calm workspace push, workspace check, workspace bump
- These call CALM Hub over HTTPS for comparison/publish workflows.

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

1. If the command path uses the document loader path (notably validate and generate), it can use direct HTTPS document URLs (subject to host allowlist and any required authentication support).
2. If it is a templating/doc generation/diff/timeline file-processing command, it is local-file based.
3. If it is under calm hub, it talks to CALM Hub server APIs over HTTPS rather than reading local file URLs directly.
