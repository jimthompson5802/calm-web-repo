# IDP Auth Plugin Design for DirectUrlDocumentLoader

## Overview

This document simplifies the requirement for adding authentication support to
`DirectUrlDocumentLoader`.

The main requirement is straightforward: an end-user organization must be able
to provide a module that returns the authentication information needed for a
protected direct-URL request, and the direct URL loading path must add that
information to the outbound request before the fetch is sent.

The existing CALM Hub authentication path remains unchanged. This work only
adds a direct URL integration point for organization-specific authentication.

The Mermaid diagrams show concrete package names, protocol examples, or config names,
read those as illustrative examples of where the change applies rather than as
final required implementation detail.

---

## Current State

Today, authentication support exists only for the CALM Hub path. The direct URL
path sends unauthenticated HTTP requests, so documents behind organization
identity controls cannot be loaded. The practical gap is not the lack of a
specific OAuth flow; it is the lack of a place for an organization module to
supply the authentication information required by its own environment.

```mermaid
graph TD
    subgraph CLI["CLI (cli/src/cli.ts)"]
        PC[parseDocumentLoaderConfig]
    end

    subgraph Config["~/.calm.json"]
        CFG["{ authPluginPath: '~/my-plugin.js' }"]
    end

    subgraph Shared["@finos/calm-shared"]
        AP["«interface» AuthPlugin\n──────────────────\ngetAuthHeaders(url, body)\n  : Promise‹Record‹string,string››"]
        NAP["NoAuthPlugin\nimplements AuthPlugin\n(returns {})"]
        BDL["buildDocumentLoader()"]

        subgraph Loaders["Document Loader Chain"]
            direction TB
            WDL["WorkspaceDocumentLoader"]
            MDL["MappedDocumentLoader"]
            CHDL["CalmHubDocumentLoader\n✅ uses AuthPlugin"]
            FSDL["FileSystemDocumentLoader"]
            DUDL["DirectUrlDocumentLoader\n❌ no auth"]
        end
    end

    CFG -- "dynamic import()" --> PC
    PC -- "authPlugin?" --> BDL
    BDL --> WDL --> MDL --> CHDL --> FSDL --> DUDL
    AP -.-> NAP
    AP -.-> CHDL
```

The change implied by this gap is simple:

1. The direct URL path needs its own authentication integration point.
2. That integration point must accept organization-supplied authentication
   information for the request being made.
3. Existing CALM Hub authentication behavior stays as-is.

---

## Proposed Design

The revised design centers on one idea: the product must accept an
organization-provided module for direct URL authentication, ask it for the
authentication information needed for the target request, and append that
information before the request is sent.

This means the implementation changes are focused in a few high-level areas:
the CLI or configuration path must resolve the organization module, the direct
URL loader path must call it, and the outbound request must be augmented with
the returned authentication data. The document does not need to require a
particular set of built-in flows to achieve that.

### Package Dependency Graph

The dependency diagram below still shows one possible structural shape. For the
purposes of this requirement, the important point is simply that organization
authentication logic can live outside this repository and be consumed by the
direct URL path.

```mermaid
graph LR
    CLI["@finos/calm-cli"]
    AUTH["@finos/calm-auth\n(new)"]
    SHARED["@finos/calm-shared"]
    EXTORG["@acme/calm-inhouse-idp\n(external org package)"]

    CLI --> AUTH
    CLI --> SHARED
    AUTH --> SHARED
    EXTORG --> AUTH
```

### Interface Layer

At the interface level, the only requirement that matters is that the
organization module can provide what the direct URL request needs in order to
authenticate. The specific class names in the diagram are illustrative examples. The design intent is for an organization to implement their specific logic
in a module separate from the CALM project using an minimal interface specification defined by the CALM project and the direct URL loader consumes the end user organization information to facilitate authentication.

```mermaid
classDiagram
    namespace calm_shared {
        class AuthPlugin {
            <<interface>>
            +getAuthHeaders(url, body) Promise~Record~
        }
        class NoAuthPlugin {
            +getAuthHeaders(url, body) Promise~Record~
        }
    }

    namespace calm_auth {
        class IdpClient {
            <<interface>>
            +getAccessToken() Promise~string~
        }
        class IdpAuthPlugin {
            -idpClient IdpClient
            -headerName string?
            -headerPrefix string?
            +getAuthHeaders(url, body) Promise~Record~
        }
    }

    namespace external_org {
        class AcmeInhouseIdpClient {
            +getAccessToken() Promise~string~
        }
    }

    AuthPlugin <|.. NoAuthPlugin
    AuthPlugin <|.. IdpAuthPlugin
    IdpClient <|.. AcmeInhouseIdpClient
    IdpAuthPlugin --> IdpClient
```

### Example Authentication Flows

The next two diagrams are examples of how an organization module
might obtain authentication information before the request is augmented. They
should not be read as a definitive way to implement these flows. The requirement is only that the system can work with an
organization module that knows how to obtain the needed authentication data.

#### Client Credentials (OAuth2 RFC 6749 §4.4)

```mermaid
sequenceDiagram
    participant Loader as Document Loader
    participant IAP as IdpAuthPlugin
    participant CC as AcmeInhouseIdpClient
    participant IDP as Token Endpoint

    Loader->>IAP: getAuthHeaders(url, body)
    IAP->>CC: getAccessToken()
    alt token cached and not expiring
        CC-->>IAP: cached access token
    else token absent or expiring within 60s
        CC->>IDP: POST /token\n(client_credentials grant)
        IDP-->>CC: { access_token, expires_in }
        CC->>CC: cache token + expiry
        CC-->>IAP: access token
    end
    IAP-->>Loader: { Authorization: "Bearer <token>" }
```

#### Authorization Code + PKCE (RFC 7636)

```mermaid
sequenceDiagram
    participant Loader as Document Loader
    participant IAP as IdpAuthPlugin
    participant PC as AcmeInhouseIdpClient
    participant Browser as System Browser
    participant LS as Local Redirect Server (localhost)
    participant IDP as Authorization Server

    Loader->>IAP: getAuthHeaders(url, body)
    IAP->>PC: getAccessToken()
    alt token cached and not expiring
        PC-->>IAP: cached access token
    else first run or token expired
        PC->>PC: generate code_verifier + code_challenge (S256)
        PC->>LS: start HTTP listener on redirectPort
        PC->>Browser: open authorizationUrl?code_challenge=...
        Browser->>IDP: user authenticates
        IDP->>LS: GET /callback?code=<auth_code>
        LS-->>PC: auth_code
        PC->>LS: shut down listener
        PC->>IDP: POST /token\n(authorization_code + code_verifier)
        IDP-->>PC: { access_token, expires_in }
        PC->>PC: cache token + expiry
        PC-->>IAP: access token
    end
    IAP-->>Loader: { Authorization: "Bearer <token>" }
```

---

### Auth Resolution in the CLI

The CLI needs to keep the two authentication paths distinct. CALM Hub continues
to resolve authentication exactly as it does today. The new behavior is that
the direct URL path resolves an organization module and prepares it for request
augmentation on protected direct-URL fetches.

```mermaid
flowchart TD
    START([parseDocumentLoaderConfig]) --> LOAD["load ~/.calm.json"]

    LOAD --> CHHUB["─── CALM Hub (unchanged) ───"]
    CHHUB --> HASPATH{authPluginPath set?}
    HASPATH -- yes --> DYNJS["loadAuthPlugin(path)\ndynamic import .js file"]
    HASPATH -- no --> NOAUTH_CH["NoAuthPlugin\n(no-op)"]
    DYNJS & NOAUTH_CH --> CH_DONE["authPlugin\n→ CalmHubDocumentLoader"]

    LOAD --> DIRECT["─── Direct URL (new) ───"]
    DIRECT --> HASDU{directUrlAuth.type set?}
    HASDU -- no --> NOAUTH_DU["no auth\n(unauthenticated, current behaviour)"]
    HASDU -- custom --> DYNMOD["dynamic import(directUrlAuth.module)\nexternal IdpClient\n(npm package or file path)"]
    DYNMOD --> WRAP["wrap in IdpAuthPlugin"]
    WRAP & NOAUTH_DU --> DU_DONE["directUrlAuthPlugin\n→ DirectUrlDocumentLoader"]
```

The direct URL path gains a dedicated resolution step for organization-provided
authentication data, while the CALM Hub path is left untouched.

---

### Document Loader Chain (After Change)

In the loader chain, the change is that direct URL loading receives
authentication input from the organization module and applies that input to the
request. This is where the request augmentation actually affects document
retrieval behavior.

```mermaid
graph TD
    subgraph CLI
        PC[parseDocumentLoaderConfig]
        APL["authPluginPath → loadAuthPlugin()\n(existing, unchanged)"]
        DUF["directUrlAuth → createDirectUrlAuthPlugin()\n(new)"]
    end

    PC --> APL
    PC --> DUF

    subgraph Shared["@finos/calm-shared  ·  buildDocumentLoader()"]
        BDL["buildDocumentLoader(opts)"]
        direction TB
        WDL["WorkspaceDocumentLoader\n(no auth)"]
        MDL["MappedDocumentLoader\n(no auth)"]
        CHDL["CalmHubDocumentLoader\n✅ opts.authPlugin (existing path)"]
        FSDL["FileSystemDocumentLoader\n(no auth)"]
        DUDL["DirectUrlDocumentLoader\n✅ opts.directUrlAuthPlugin (new)"]
    end

    APL -- "opts.authPlugin" --> BDL
    DUF -- "opts.directUrlAuthPlugin" --> BDL
    BDL --> WDL --> MDL --> CHDL --> FSDL --> DUDL
```

What changes will be made at this layer is now clear:
the direct URL loader gains a way to receive organization-provided
authentication information, it adds that information to outbound requests, and
the existing CALM Hub wiring continues to behave exactly as it does today.

---

### External Organisation IDP Support

The organization module is expected to be owned by the end-user organization
when the authentication requirements are organization-specific. That module 
lives outside the CALM project repository, evolve independently, and carry whatever internal
logic is needed to gather the authentication information for protected direct
URLs.

In this model, the end-user organization clones the CALM repository, builds the
`@finos/calm-auth` package locally from that source, and includes it alongside
its own in-house module in the same deployment or execution environment.

```mermaid
graph TB
    subgraph ORG["Organisation (private)"]
        subgraph CALM_SRC["git repo: acme/architecture-as-code\n(cloned from FINOS CALM repo)"]
            SHARED["@finos/calm-shared"]
            AUTH["@finos/calm-auth\n(built locally)"]
            CLI["@finos/calm-cli"]
        end

        subgraph INHOUSE["git repo: Local org integration"]
            ORG_SRC["src/acme-inhouse-idp-client.ts\nimplements IdpClient"]
            ORG_AUTH["built acme-inhouse-idp-client"]
        end

        AUTH -- "local package build" --> ORG_SRC
        AUTH -- "dependency" --> CLI
        ORG_SRC -- "npm install / local workspace link" --> ORG_AUTH
        ORG_AUTH -- "via configuration directUrlAuth.module integrate with" --> CLI
    end

    style CALM_SRC fill:#e8f4e8,stroke:#2d7a2d
    style INHOUSE fill:#e8f0fb,stroke:#3a6bc4
    style ORG fill:#f0f4ff,stroke:#3a6bc4
```

The required product change is therefore not "implement every possible
enterprise auth flow in this repository." It is "provide a supported path for
an organization module to participate in direct URL authentication."

```mermaid
sequenceDiagram
    participant User as User / CI
    participant CLI as calm-cli
    participant Factory as createAuthPluginFromConfig
    participant Dyn as dynamic import()
    participant Ext as @acme/calm-inhouse-idp
    participant IAP as IdpAuthPlugin
    participant Loader as DirectUrlDocumentLoader

    User->>CLI: calm validate --architecture arch.json
    CLI->>Factory: createDirectUrlAuthPlugin(config.directUrlAuth)
    Factory->>Dyn: import("@acme/calm-inhouse-idp")
    Dyn->>Ext: load module
    Ext-->>Dyn: class AcmeInhouseIdpClient
    Dyn-->>Factory: AcmeInhouseIdpClient
    Factory->>Ext: new AcmeInhouseIdpClient(options)
    Factory->>IAP: new IdpAuthPlugin(acmeClient)
    Factory-->>CLI: authPlugin
    CLI->>Loader: loadMissingDocument(url)
    Loader->>IAP: getAuthHeaders(url, body)
    IAP->>Ext: getAccessToken()
    Ext-->>IAP: access token
    IAP-->>Loader: { Authorization: "Bearer <token>" }
```

In practical terms, the direct URL path changes by loading the organization
module, asking it for authentication information, and using the returned data
to augment the outgoing request. No equivalent change is required for the
existing CALM Hub path.

---

### Configuration Reference

The example below is illustrative only. It is not prescriptive of the final
configuration design, naming, or protocol choices; it exists to show one
possible way the direct URL auth hook could be expressed in a real config file.

An illustrative example of the configuration shape looks like this, showing
how the CLI can be told where the end-user organization module is located so
it can provide authentication information for the direct URL loader:

```json
{
  "authPluginPath": "~/plugins/calm-hub-auth.js",
  "directUrlAuth": {
    "module": "~/plugins/acme-direct-url-auth.js",
    "options": {
      "tokenUrl": "https://idp.acme.example.com/oauth/token",
      "clientId": "calm-direct-url",
      "clientSecret": "${ACME_IDP_CLIENT_SECRET}",
      "scopes": ["calm:read", "calm:documents"],
      "headerName": "Authorization",
      "headerPrefix": "Bearer "
    }
  }
}
```

This example is intentionally illustrative: the direct URL path resolves a
module located by the organization for protected fetches, while the existing
`authPluginPath` setting remains available for the unchanged CALM Hub behavior.
The actual config shape and naming can vary by implementation, but the required
behavior is the same: the CLI resolves the direct URL auth module, the loader
calls it for the request being made, and the returned headers are added before
the fetch is sent.

---

## Constraints and Notes

- Backward compatibility is required: current CALM Hub authentication remains
  unchanged.
- The organization module owns the logic for obtaining whatever authentication
  information its environment requires.
- The direct URL path owns request augmentation, meaning it applies the module
  output to the outbound request before fetching the document.
- Specific protocols, package names, and config shapes shown in diagrams are
  illustrative unless and until implementation work chooses concrete forms.
