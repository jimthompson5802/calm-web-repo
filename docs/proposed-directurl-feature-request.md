# Feature Proposal: Authentication Support for Direct URL Document Loading

### Target Project:

`architecture-as-code` monorepo, primarily affecting:

* `@finos/calm-cli`
* `@finos/calm-shared`
* A new `@finos/calm-auth` package

### Description of Feature:

Add authentication support to the `DirectUrlDocumentLoader` so CALM can retrieve documents from HTTP/HTTPS URLs protected by an Identity Provider (IDP).

The primary use case is accessing architecture documents stored in an existing organizational repository that predates CALM Hub and requires authentication. This allows organizations adopting CALM to continue using existing repositories without first migrating their content into CALM Hub.

The feature should provide an IDP-agnostic authentication mechanism based on common industry standards rather than requiring CALM to implement vendor-specific authentication. For this repository, the supported local machine-to-machine mechanism is intentionally limited to OAuth 2.0 Client Credentials plus optional CA trust for private or self-signed certificates.

Organizations should be able to use standards-compliant IDPs such as PingFederate, PingOne, Keycloak, Okta, Azure AD, ForgeRock, or Auth0 without requiring vendor-specific changes to CALM.

Authentication for direct URLs must remain independent from the existing CALM Hub authentication mechanism. The existing `authPluginPath` / `AuthPlugin` behavior must remain unchanged.

If direct URL authentication is not configured, `DirectUrlDocumentLoader` must continue to operate without authentication as it does today.

**IMPORTANT:** The scope of this feature proposal is limited to CALM artifact sharing and supporting CALM validation when the artifacts are stored on a repository supported by `DirectUrlDocumentLoader`.  This proposal does not intend to implement `CALMHub` functionality such as visualization, versioning, artifact diff, timeline, etc.

### User Stories:

As a CALM user, I want to access architecture documents stored in an authenticated repository that existed before CALM Hub so that CALM, for purposes of validation, can consume existing organizational content without requiring it to be migrated into CALM Hub.

As an enterprise user, I want CALM to authenticate to my organization's existing document repository using standard authentication protocols so that CALM can integrate with established repositories and security infrastructure.

As an automation or CI/CD user, I want CALM to authenticate to an existing protected repository using OAuth Client Credentials so that CALM validation can retrieve required documents without user interaction.

As an organization adopting CALM Hub while continuing to use an existing repository, I want authentication for the existing repository and CALM Hub to be configured independently so that each repository can use its own authentication mechanism and credentials.

### Current Limitations:

`DirectUrlDocumentLoader` currently performs unauthenticated HTTP requests. As a result, documents hosted in an existing repository behind an IDP or OAuth-protected service cannot be retrieved.

This prevents organizations with established authenticated repositories from directly referencing those documents when adopting CALM unless they make the documents publicly accessible or migrate them to another repository.

The existing `authPluginPath` mechanism is associated with CALM Hub authentication and requires users to provide an implementation of the complete `AuthPlugin` interface.

There is currently no structured configuration for OAuth Client Credentials plus private/self-signed certificate trust when accessing direct URLs.

Reusing the existing CALM Hub authentication configuration would also prevent users from independently configuring authentication for CALM Hub and their existing repositories.

### Proposed Implementation:

Introduce a separate authentication capability specifically for `DirectUrlDocumentLoader`.

The CLI should support a new `directUrlAuth` configuration in `~/.calm.json`. For this repository, the supported machine-to-machine configuration is limited to the information needed for client credentials plus TLS trust:

| Key            | Functional behavior                                                          |
| -------------- | ---------------------------------------------------------------------------- |
| `tokenUrl`     | OAuth 2.0 token endpoint used for the Client Credentials grant.              |
| `clientId`     | OAuth client identifier.                                                     |
| `clientSecret` | OAuth client secret.                                                         |
| `caCertPath`   | Optional CA certificate path for private or self-signed HTTPS trust.         |

Authentication credentials should be converted into HTTP request headers and automatically applied when `DirectUrlDocumentLoader` retrieves a protected resource.

OAuth access tokens should be cached for their usable lifetime rather than requesting a new token for every document request.

The existing CALM Hub `AuthPlugin` mechanism must remain unchanged. Direct URL authentication should be passed independently to `DirectUrlDocumentLoader`, ensuring that CALM Hub and direct URL requests can use different credentials and authentication mechanisms.

When `directUrlAuth` is absent, no authentication headers should be added and existing direct URL behavior must be preserved.

### Alternatives Considered:

**Reuse the existing CALM Hub `authPluginPath`.** This would couple CALM Hub authentication with authentication for existing repositories and make it difficult for the two resource types to use different credentials or authentication mechanisms.

**Require users to implement an `AuthPlugin` for direct URLs.** This provides extensibility but places unnecessary implementation burden on users for the supported client-credentials flow.

**Implement IDP-specific integrations directly in CALM.** Supporting PingFederate, Keycloak, Okta, Azure AD, and other vendors individually would introduce vendor-specific dependencies and increase long-term maintenance. Supporting industry-standard protocols allows standards-compliant IDPs to work without CALM-specific integrations.

**Support additional direct-URL auth modes beyond client credentials.** This would expand flexibility but is not needed for the supported local machine-to-machine flow in this repository.

**Require existing documents to be migrated to CALM Hub.** This would create an unnecessary adoption barrier for organizations with established repositories and document-management processes. Direct authenticated access allows CALM to integrate with those repositories while organizations independently determine whether or when content should be migrated to CALM Hub.

### Testing Strategy:

Unit tests should verify the supported authentication mechanism, including:

* OAuth Client Credentials token acquisition and caching
* Private/self-signed CA certificate loading
* Authentication header generation
* Error handling for invalid or missing configuration

`DirectUrlDocumentLoader` tests should verify that authentication headers are added to outbound HTTP requests when authentication is configured and omitted when it is not.

Integration tests should verify at minimum:

1. An OAuth Client Credentials token can be obtained and used to retrieve a protected direct URL.
2. A protected direct URL can be retrieved when the local CA is self-signed and supplied through `caCertPath`.
3. CALM Hub and an existing repository accessed through `DirectUrlDocumentLoader` can use different authentication configurations during the same execution.
4. Existing configurations without `directUrlAuth` continue to operate unchanged.

Existing CALM Hub authentication tests should continue to pass without modification to their expected behavior.

### Documentation Requirements:

Update the CALM CLI configuration documentation to describe `directUrlAuth` for OAuth Client Credentials and optional CA certificate trust.

Provide configuration examples for:

* OAuth Client Credentials
* Optional CA certificate trust for private or self-signed HTTPS
* Simultaneous CALM Hub and existing repository authentication

### Implementation Checklist:

* [ ] Design reviewed and approved
* [ ] Define direct URL authentication configuration
* [ ] Implement client-credentials direct URL authentication
* [ ] Implement private/self-signed CA support
* [ ] Add authentication support to `DirectUrlDocumentLoader`
* [ ] Preserve independent CALM Hub authentication behavior
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

For the supported local `calm-web-repo` example, CALM direct URL authentication is intentionally narrowed to OAuth 2.0 Client Credentials plus optional CA trust for private or self-signed certificates. Authorization Code with PKCE is out of scope for this repo's supported machine-to-machine flow.

The feature must also maintain a strict separation between the existing CALM Hub authentication path and the authentication path used to access existing repositories. A configuration such as the following should therefore be supported:

```json
{
  "calmHubUrl": "https://calm.example.com",
  "authPluginPath": "~/company-calmhub-plugin.js",
  "directUrlAuth": {
    "module": "~/company-direct-url-plugin.js",
    "options": {
      "tokenUrl": "https://idp.example.com/token",
      "clientId": "calm-cli",
      "clientSecret": "replace-me",
      "caCertPath": "/absolute/path/to/idp-ca.crt"
    }
  }
}
```

In this example, CALM Hub continues to use the existing `authPluginPath`, while documents stored in the organization's existing authenticated repository are retrieved through `DirectUrlDocumentLoader` using OAuth Client Credentials.

This separation preserves backward compatibility while allowing organizations to incrementally adopt CALM Hub without disrupting existing repositories or authentication infrastructure.

The underlying design explicitly preserves the existing CALM Hub authentication path while adding an independent authentication path for `DirectUrlDocumentLoader`, which supports this incremental-adoption framing. 
