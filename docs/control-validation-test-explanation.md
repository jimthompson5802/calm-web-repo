# Control Validation Test Explanation

This document explains why `calm validate` succeeds for the first two nodes in [`architectures/control-test-architecture.json`](../static/architectures/control-test-architecture.json) and fails for the third node, and how the new pattern-based validation also catches the fourth node that omits its controls section.

Repository assets are now served only through authenticated `https://localhost:8443`. The example URLs below use that HTTPS origin; auth-aware CLI execution is deferred to a later follow-up.

## `calm validate` output for validating the architecture

### Validation without the pattern

```
$ calm validate -a https://localhost:8443/architectures/control-test-architecture.json 
(node:65626) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [
        {
            "code": "control-requirement-validation",
            "severity": "error",
            "message": "must be equal to one of the allowed values",
            "path": "/nodes/2/controls/session-protection/requirements/0/protection-level",
            "schemaPath": "#/properties/protection-level/enum",
            "source": "architecture"
        },
        {
            "code": "control-requirement-validation",
            "severity": "error",
            "message": "must be >= 1",
            "path": "/nodes/2/controls/session-protection/requirements/0/idle-timeout-minutes",
            "schemaPath": "#/properties/idle-timeout-minutes/minimum",
            "source": "architecture"
        }
    ],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": true,
    "hasWarnings": false
```

### Validation with the control pattern

```
$ calm validate -a https://localhost:8443/architectures/control-test-architecture.json -p https://localhost:8443/patterns/company-control-pattern.json 
(node:4933) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
info [calm-cli]:     Using CALMHub URL from config file: https://localhost:8443
info [calm-cli]:     Using allowed remote hosts from config file
info [calmhub-document-loader]:     Configuring CALMHub document loader with base URL: https://localhost:8443
info [calm-validate]:     Formatting output as json
{
    "jsonSchemaValidationOutputs": [
        {
            "code": "json-schema",
            "severity": "error",
            "message": "must have required property 'controls'",
            "path": "/nodes/3",
            "schemaPath": "#/allOf/1/required",
            "source": "architecture"
        },
        {
            "code": "control-requirement-validation",
            "severity": "error",
            "message": "must be equal to one of the allowed values",
            "path": "/nodes/2/controls/session-protection/requirements/0/protection-level",
            "schemaPath": "#/properties/protection-level/enum",
            "source": "architecture"
        },
        {
            "code": "control-requirement-validation",
            "severity": "error",
            "message": "must be >= 1",
            "path": "/nodes/2/controls/session-protection/requirements/0/idle-timeout-minutes",
            "schemaPath": "#/properties/idle-timeout-minutes/minimum",
            "source": "architecture"
        }
    ],
    "spectralSchemaValidationOutputs": [],
    "hasErrors": true,
    "hasWarnings": false
```

## Control Requirement

The session control requirement in [`controls/session/schemas/session-protection.json`](../static/controls/session/schemas/session-protection.json) defines three rules:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"title": "Session Protection Requirement",
	"description": "Defines minimum protection requirements for interactive user sessions.",
	"type": "object",
	"properties": {
		"protection-level": {
			"type": "string",
			"enum": ["low", "medium", "high"]
		},
		"idle-timeout-minutes": {
			"type": "integer",
			"minimum": 1
		},
		"encryption-required": {
			"type": "boolean"
		}
	},
	"required": [
		"protection-level",
		"idle-timeout-minutes",
		"encryption-required"
	]
}
```

- `protection-level` must be one of `low`, `medium`, or `high`
- `idle-timeout-minutes` must be at least `1`
- `encryption-required` must be a boolean

## First Node: Passed

The first node uses an inline control config:

```json
{
	"session-protection": {
		"description": "Session protection requirement defined with inline configuration",
		"requirements": [
			{
				"requirement-url": "https://localhost:8443/controls/session/schemas/session-protection.json",
				"config": {
					"protection-level": "medium",
					"idle-timeout-minutes": 20,
					"encryption-required": true
				}
			}
		]
	}
}
```

- `protection-level: "medium"`
- `idle-timeout-minutes: 20`
- `encryption-required: true`

These values satisfy the schema, so validation passes.

## Second Node: Passed

The second node references an approved control config URL:

```json
{
	"session-protection": {
		"description": "Session protection requirement loaded from the shared config file",
		"requirements": [
			{
				"requirement-url": "https://localhost:8443/controls/session/schemas/session-protection.json",
				"config-url": "https://localhost:8443/controls/session/configs/session-config.json"
			}
		]
	}
}
```

- [`config-url: https://localhost:8443/controls/session/configs/session-config.json`](../static/controls/session/configs/session-config.json)

That config file contains valid values:

- `protection-level: "high"`
- `idle-timeout-minutes: 15`
- `encryption-required: true`

Because the referenced config matches the schema, validation passes.

## Third Node: Failed

The third node uses an inline control config that violates the schema:

```json
{
	"session-protection": {
		"description": "Session protection requirement loaded from the bad shared config file",
		"requirements": [
			{
				"requirement-url": "https://localhost:8443/controls/session/schemas/session-protection.json",
				"config": {
					"protection-level": "extreme",
					"idle-timeout-minutes": 0,
					"encryption-required": true
				}
			}
		]
	}
}
```

- `protection-level: "extreme"`
- `idle-timeout-minutes: 0`
- `encryption-required: true`

The validation fails for two reasons:

- `extreme` is not one of the allowed enum values for `protection-level`
- `0` is below the minimum value required for `idle-timeout-minutes`

## Fourth Node: Failed

The fourth node intentionally omits the `controls` section entirely. Under the control pattern, that is invalid because the pattern requires every node to conform to the Node Control Standard, and that standard requires a `controls` object containing a `session-protection` control.

The node is defined as:

```json
{
  "unique-id": "session-no-controls-node",
  "node-type": "service",
  "name": "Session No Controls Node",
  "description": "Service node that intentionally has no controls section"
}
```

The validation error reports:

- `must have required property 'controls'`

This demonstrates that the pattern enforces the presence of the control section, not just the internal validity of the control values.

## Summary

- The first node passes because its inline config is valid.
- The second node passes because it references an approved config URL with valid values.
- The third node fails because its inline config does not satisfy the control requirement schema.
- The fourth node fails because it does not include the required `controls` section at all.

The failure is isolated to the third and fourth nodes’ control settings and structure.tructure itself is valid.
