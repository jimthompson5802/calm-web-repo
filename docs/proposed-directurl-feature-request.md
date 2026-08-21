# Feature Proposal: Authentication Support for Direct URL Document Loading

### Target Project:

`architecture-as-code` monorepo, primarily affecting:

* `@finos/calm-cli`
* `@finos/calm-shared`
* A new `@finos/calm-auth` package

### Description of Feature:

Add authentication support to the `DirectUrlDocumentLoader` so CALM can retrieve documents from HTTP/HTTPS URLs protected by an Identity Provider (IDP).

The primary use case is accessing architecture documents stored in an existing organizational repository that predates CALM Hub and requires authentication. This allows organizations adopting CALM to continue using existing repositories without first migrating their content into CALM Hub.

The feature should provide an IDP-agnostic authentication mechanism based on common industry standards rather than requiring CALM to implement vendor-specific authentication. Initial supported authentication mechanisms should include:

* Static bearer tokens
* API keys
* OAuth 2.0 Client Credentials
* OAuth 2.0 Authorization Code with PKCE
* Custom authentication providers implemented outside the `architecture-as-code` repository

Organizations should be able to use standards-compliant IDPs such as PingFederate, PingOne, Keycloak, Okta, Azure AD, ForgeRock, or Auth0 without requiring vendor-specific changes to CALM.

Authentication for direct URLs must remain independent from the existing CALM Hub authentication mechanism. The existing `authPluginPath` / `AuthPlugin` behavior must remain unchanged.

If direct URL authentication is not configured, `DirectUrlDocumentLoader` must continue to operate without authentication as it does today.

**IMPORTANT:** The scope of this feature proposal is limited to CALM artifact sharing and supporting CALM validation when the artifacts are stored on a repository supported by `DirectUrlDocumentLoader`.  This proposal does not intend to implement `CALMHub` functionality such as visualization, versioning, artifact diff, timeline, etc.

### User Stories:

As a CALM user, I want to access architecture documents stored in an authenticated repository that existed before CALM Hub so that CALM, for purposes of validation, can consume existing organizational content without requiring it to be migrated into CALM Hub.

As an enterprise user, I want CALM to authenticate to my organization's existing document repository using standard authentication protocols so that CALM can integrate with established repositories and security infrastructure.

As an automation or CI/CD user, I want CALM to authenticate to an existing protected repository using non-interactive mechanisms such as OAuth Client Credentials or static tokens so that CALM validation can retrieve required documents without user interaction.

As an interactive CLI user, I want CALM to authenticate to an existing protected repository using Authorization Code with PKCE so that I can access documents using my organization's browser-based authentication process.

As a user whose existing repository is protected by an API gateway, I want CALM to support API-key authentication so that CALM can retrieve documents without requiring changes to the repository.

As an organization with proprietary authentication requirements for an existing repository, I want to provide my own IDP implementation externally so that CALM can access the repository without embedding organization- or vendor-specific authentication logic in the CALM project.

As an organization adopting CALM Hub while continuing to use an existing repository, I want authentication for the existing repository and CALM Hub to be configured independently so that each repository can use its own authentication mechanism and credentials.

### Current Limitations:

`DirectUrlDocumentLoader` currently performs unauthenticated HTTP requests. As a result, documents hosted in an existing repository behind an IDP, OAuth-protected service, API gateway, or other authentication mechanism cannot be retrieved.

This prevents organizations with established authenticated repositories from directly referencing those documents when adopting CALM unless they make the documents publicly accessible or migrate them to another repository.

The existing `authPluginPath` mechanism is associated with CALM Hub authentication and requires users to provide an implementation of the complete `AuthPlugin` interface.

There is currently no structured configuration for common authentication mechanisms such as OAuth Client Credentials, PKCE, static bearer tokens, or API keys when accessing direct URLs.

Reusing the existing CALM Hub authentication configuration would also prevent users from independently configuring authentication for CALM Hub and their existing repositories.

### Proposed Implementation:

Introduce a separate authentication capability specifically for `DirectUrlDocumentLoader`.

The CLI should support a new `directUrlAuth` configuration in `~/.calm.json`. The configuration should identify the authentication type and the information necessary to perform that authentication.

The following authentication types should initially be supported:

| Type                 | Functional behavior                                                         |
| -------------------- | --------------------------------------------------------------------------- |
| `static-token`       | Supply a static bearer token, directly or through an environment variable.  |
| `api-key`            | Supply an API key using a configurable HTTP header.                         |
| `client-credentials` | Obtain an OAuth 2.0 access token using the Client Credentials grant.        |
| `pkce`               | Perform interactive OAuth 2.0 Authorization Code authentication using PKCE. |
| `custom`             | Load an externally supplied authentication implementation.                  |

Authentication credentials should be converted into HTTP request headers and automatically applied when `DirectUrlDocumentLoader` retrieves a protected resource.

OAuth access tokens should be cached for their usable lifetime rather than requesting a new token for every document request.

PKCE authentication should launch the user's browser and use a localhost redirect to complete the authorization flow. Because this requires user interaction, PKCE is intended for interactive CLI use and not headless CI environments.

For automated environments, users should be able to use `client-credentials` or `static-token`.

Sensitive values such as tokens and client secrets should be configurable through environment variables so they do not need to be stored in `~/.calm.json`.

A small IDP abstraction should be provided so authentication implementations expose a simple token-acquisition contract. Built-in implementations should handle the supported standard authentication flows.

Organizations with proprietary authentication requirements should be able to implement this contract in an external npm package and configure CALM to dynamically load that package. Adding a new organization-specific IDP must not require modification of the `architecture-as-code` repository.

The existing CALM Hub `AuthPlugin` mechanism must remain unchanged. Direct URL authentication should be passed independently to `DirectUrlDocumentLoader`, ensuring that CALM Hub and direct URL requests can use different credentials and authentication mechanisms.

When `directUrlAuth` is absent, no authentication headers should be added and existing direct URL behavior must be preserved.

### Alternatives Considered:

**Reuse the existing CALM Hub `authPluginPath`.** This would couple CALM Hub authentication with authentication for existing repositories and make it difficult for the two resource types to use different credentials or authentication mechanisms.

**Require users to implement an `AuthPlugin` for direct URLs.** This provides extensibility but places unnecessary implementation burden on users for common OAuth and token-based authentication flows.

**Implement IDP-specific integrations directly in CALM.** Supporting PingFederate, Keycloak, Okta, Azure AD, and other vendors individually would introduce vendor-specific dependencies and increase long-term maintenance. Supporting industry-standard protocols allows standards-compliant IDPs to work without CALM-specific integrations.

**Support only OAuth Client Credentials.** This would address CI/CD and service-to-service authentication but would not support interactive user authentication, static tokens, API gateways, or proprietary enterprise authentication requirements.

**Require existing documents to be migrated to CALM Hub.** This would create an unnecessary adoption barrier for organizations with established repositories and document-management processes. Direct authenticated access allows CALM to integrate with those repositories while organizations independently determine whether or when content should be migrated to CALM Hub.

### Testing Strategy:

Unit tests should verify each supported authentication mechanism, including:

* Static token retrieval
* API key handling
* OAuth Client Credentials token acquisition and caching
* PKCE authorization and token acquisition
* Custom authentication module loading
* Authentication header generation
* Environment-variable configuration and precedence
* Error handling for invalid or missing configuration

`DirectUrlDocumentLoader` tests should verify that authentication headers are added to outbound HTTP requests when authentication is configured and omitted when it is not.

Integration tests should verify at minimum:

1. A direct URL in an existing repository protected by a static bearer token can be retrieved.
2. An OAuth Client Credentials token can be obtained and used to retrieve a protected direct URL.
3. An external custom authentication implementation can be loaded and used.
4. CALM Hub and an existing repository accessed through `DirectUrlDocumentLoader` can use different authentication mechanisms during the same execution.
5. Existing configurations without `directUrlAuth` continue to operate unchanged.

Existing CALM Hub authentication tests should continue to pass without modification to their expected behavior.

### Documentation Requirements:

Update the CALM CLI configuration documentation to describe `directUrlAuth` and each supported authentication type.

Provide configuration examples for:

* Static bearer token
* API key
* OAuth Client Credentials
* OAuth Authorization Code with PKCE
* Custom external IDP implementation
* Environment-variable-based secret configuration
* Simultaneous CALM Hub and existing repository authentication

Document that PKCE requires an interactive browser session and should not be used for headless CI/CD execution.

Document the extension contract and packaging requirements for organizations that want to provide custom IDP implementations outside the `architecture-as-code` repository.

Security guidance should recommend environment variables or equivalent external secret-management mechanisms rather than storing production credentials directly in `~/.calm.json`.

### Implementation Checklist:

* [ ] Design reviewed and approved
* [ ] Define direct URL authentication configuration
* [ ] Implement standard authentication mechanisms
* [ ] Implement external/custom IDP extension mechanism
* [ ] Add authentication support to `DirectUrlDocumentLoader`
* [ ] Preserve independent CALM Hub authentication behavior
* [ ] Implement environment-variable configuration
* [ ] Implementation completed
* [ ] Unit tests written and passing
* [ ] Integration tests written and passing
* [ ] Backward compatibility verified
* [ ] Documentation updated
* [ ] Relevant workflows updated (if needed)
* [ ] Performance impact assessed

### Additional Context:

The primary use case for this feature is integration with **existing authenticated repositories that predate CALM Hub**. Organizations may already maintain architecture documents or other CALM-referenced artifacts in repositories governed by established authentication and access-control infrastructure.

Adopting CALM should not require these organizations to migrate existing content into CALM Hub before that content can be referenced by CALM architectures.

The primary design requirement is therefore to separate **authentication protocol support** from **IDP vendor implementation**.

CALM should understand standard mechanisms such as OAuth 2.0 Client Credentials and Authorization Code with PKCE rather than having explicit dependencies on PingFederate, Keycloak, Okta, or other IDPs.

The feature must also maintain a strict separation between the existing CALM Hub authentication path and the authentication path used to access existing repositories. A configuration such as the following should therefore be supported:

```json
{
  "calmHubUrl": "https://calm.example.com",
  "authPluginPath": "~/company-calmhub-plugin.js",
  "directUrlAuth": {
    "type": "client-credentials",
    "tokenUrl": "https://idp.example.com/token",
    "clientId": "calm-cli",
    "clientSecretEnvVar": "CALM_CLIENT_SECRET"
  }
}
```

In this example, CALM Hub continues to use the existing `authPluginPath`, while documents stored in the organization's existing authenticated repository are retrieved through `DirectUrlDocumentLoader` using OAuth Client Credentials.

This separation preserves backward compatibility while allowing organizations to incrementally adopt CALM Hub without disrupting existing repositories or authentication infrastructure.

The underlying design explicitly preserves the existing CALM Hub authentication path while adding an independent authentication path for `DirectUrlDocumentLoader`, which supports this incremental-adoption framing. 
