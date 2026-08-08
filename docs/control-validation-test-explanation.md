# Control Validation Test Explanation

This document explains why `calm validate` succeeds for the first two nodes in `static/architectures/control-test-architecture.json` and fails for the third node.

## Control Requirement

The session control requirement in `static/controls/session/schemas/session-protection.json` defines three rules:

- `protection-level` must be one of `low`, `medium`, or `high`
- `idle-timeout-minutes` must be at least `1`
- `encryption-required` must be a boolean

## First Node: Passed

The first node uses an inline control config:

- `protection-level: "medium"`
- `idle-timeout-minutes: 20`
- `encryption-required: true`

These values satisfy the schema, so validation passes.

## Second Node: Passed

The second node references an approved control config URL:

- `config-url: http://localhost:8080/controls/session/configs/session-config.json`

That config file contains valid values:

- `protection-level: "high"`
- `idle-timeout-minutes: 15`
- `encryption-required: true`

Because the referenced config matches the schema, validation passes.

## Third Node: Failed

The third node uses an inline control config that violates the schema:

- `protection-level: "extreme"`
- `idle-timeout-minutes: 0`
- `encryption-required: true`

The validation fails for two reasons:

- `extreme` is not one of the allowed enum values for `protection-level`
- `0` is below the minimum value required for `idle-timeout-minutes`

## Summary

- The first node passes because its inline config is valid.
- The second node passes because it references an approved config URL with valid values.
- The third node fails because its inline config does not satisfy the control requirement schema.

The failure is isolated to the third node’s control settings. The architecture structure itself is valid.