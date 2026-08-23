## Condensed specification: remove getTlsConfig() support from the Calm CLI/shared modules

### Change requested

Remove the custom TLS configuration hook from the direct URL auth contract used by the Calm CLI and shared document loader.

### Current behavior
The direct URL auth plugin interface currently supports:
- getAuthHeaders(url, requestBody)
- optional getTlsConfig() returning httpsCaCert

The shared loader calls getTlsConfig() for HTTPS requests and, if a CA cert is returned, creates an HTTPS agent with that certificate before fetching the document.

### Proposed behavior
The direct URL auth contract will support only:
- getAuthHeaders(url, requestBody)

The shared loader will no longer call getTlsConfig() or create a custom HTTPS agent from the plugin. Certificate trust will instead rely on standard Node TLS configuration, such as:
- NODE_EXTRA_CA_CERTS
- NODE_TLS_REJECT_UNAUTHORIZED

### Scope
This change applies to:
- direct-url-auth-plugin.ts
- direct-url-document-loader.ts
- cli-config.ts

### Acceptance criteria

1. The direct URL auth plugin interface no longer includes getTlsConfig().
2. The shared document loader no longer invokes getTlsConfig() or creates a custom HTTPS agent from plugin-provided CA data.
3. The CLI loader still validates and instantiates direct URL auth modules that implement getAuthHeaders().
4. Direct URL authentication continues to work through headers added to allowlisted HTTP/HTTPS requests.
5. Node runtime TLS trust settings continue to work without any Calm-specific TLS API.
6. Modules that previously implemented getTlsConfig() must be updated to remove that method; they should rely on runtime environment trust configuration instead.

### Impact
This is a breaking change for any organization-owned direct URL auth module that currently depends on the optional CA-cert hook. Those modules should be migrated to header-only auth logic and trust their CA using the Node process environment.