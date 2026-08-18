# Generalised IDP Auth Plugin Design

## Overview

This document simplifies the requirement for adding authentication support to
`DirectUrlDocumentLoader`.

The main requirement is straightforward: an end-user organization must be able
to provide a module that returns the authentication information needed for a
protected direct-URL request, and the direct URL loading path must add that
information to the outbound request before the fetch is sent.

The existing CALM Hub authentication path remains unchanged. This work only
adds a direct URL integration point for organization-specific authentication.

The Mermaid diagrams in this document are retained from the earlier draft.
Where they show concrete package names, protocol examples, or config names,
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

The next two diagrams are retained as examples of how an organization module
might obtain authentication information before the request is augmented. They
should not be read as a commitment to ship all of these flows as built-in
product features. The requirement is only that the system can work with an
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
when the authentication requirements are organization-specific. That module can
live outside this repository, evolve independently, and carry whatever internal
logic is needed to gather the authentication information for protected direct
URLs.

```mermaid
graph TB
    subgraph FINOS["FINOS (public)"]
        subgraph AAC["git repo: finos/architecture-as-code"]
            SHARED["@finos/calm-shared\n(publishes AuthPlugin interface)"]
            AUTH["@finos/calm-auth\n(publishes IdpClient interface)"]
            CLI["@finos/calm-cli"]
        end
        NPM_PUB["npm registry (public)\nnpmjs.com"]
        SHARED -- "npm publish" --> NPM_PUB
        AUTH -- "npm publish" --> NPM_PUB
    end

    subgraph ORG["Organisation (private)"]
        subgraph ORG_REPO["git repo: acme/calm-inhouse-idp\n(separate repo, no fork of architecture-as-code)"]
            ORG_SRC["src/acme-inhouse-idp-client.ts\nimplements IdpClient"]
        end
        ORG_REG["npm registry (private)\ne.g. Artifactory / GitHub Packages"]
        ORG_REPO -- "npm publish" --> ORG_REG
    end

    NPM_PUB -- "npm install @finos/calm-auth" --> ORG_SRC
    ORG_REG -- "npm install @acme/calm-inhouse-idp" --> CLI

    style AAC fill:#e8f4e8,stroke:#2d7a2d
    style ORG_REPO fill:#e8f0fb,stroke:#3a6bc4
    style FINOS fill:#f0faf0,stroke:#2d7a2d
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

Configuration still needs a way to tell the CLI how to locate or activate the
organization module for direct URL authentication. The earlier draft used
`directUrlAuth` as the working example, and the retained diagrams continue to
show that name, but the key requirement is conceptual rather than syntactic:
there must be enough configuration to connect the direct URL path to the
organization-provided authentication module.

The document deliberately does not require a final union shape, a fixed set of
built-in flow types, or a detailed environment-variable matrix. Those are
implementation choices. The requirement is simply that protected direct URL
requests can be augmented with authentication data supplied by the organization
module, while current CALM Hub configuration continues to work unchanged.

---

## Implementation Plan

The retained plan diagram still usefully shows the main surfaces that change:
module resolution, direct URL request wiring, and validation. For this revised
document, read it as an illustration of impacted areas rather than as a locked,
phase-by-phase delivery commitment.

```mermaid
gantt
    dateFormat  YYYY-MM-DD
    axisFormat  Phase %s

    section Phase 1 · calm-auth package
    Scaffold package (package.json, tsconfig, vitest)     :p1a, 2025-01-01, 1d
    IdpClient interface                                    :p1b, after p1a, 1d
    StaticTokenIdpClient + tests                          :p1c, after p1b, 1d
    ApiKeyIdpClient + tests                               :p1d, after p1b, 1d
    ClientCredentialsIdpClient + tests                    :p1e, after p1b, 2d
    PkceIdpClient + tests                                 :p1f, after p1b, 3d
    IdpAuthPlugin + tests                                 :p1g, after p1c, 1d
    Barrel export (index.ts)                              :p1h, after p1g, 1d

    section Phase 2 · DirectUrlDocumentLoader auth
    Add authPlugin param + interceptor                    :p2a, 2025-01-01, 1d
    Update DirectUrlDocumentLoader tests                  :p2b, after p2a, 1d

    section Phase 3 · CLI structured config
    Extend CLIConfig with directUrlAuth union             :p3a, after p1h, 1d
    createDirectUrlAuthPlugin factory + tests             :p3b, after p3a, 2d
    Add directUrlAuthPlugin to DocumentLoaderOptions      :p3c, after p3b p2b, 1d
    mergeWithEnvVars env-var overrides                    :p3d, after p3c, 1d

    section Phase 4 · Validation
    Integration test: static-token + direct URL           :p4a, after p3d, 1d
    Integration test: client-credentials + direct URL     :p4b, after p3d, 1d
    Integration test: custom external module              :p4c, after p3d, 1d
```

The high-level implementation changes captured by this simplified document are:
the direct URL loading path gains an organization-module integration point, the
module provides authentication data needed for the request, the loader appends
that data before sending the request, and compatibility with the existing CALM
Hub authentication path is preserved.

## Constraints and Notes

- Backward compatibility is required: current CALM Hub authentication remains
  unchanged.
- The organization module owns the logic for obtaining whatever authentication
  information its environment requires.
- The direct URL path owns request augmentation, meaning it applies the module
  output to the outbound request before fetching the document.
- Specific protocols, package names, and config shapes shown in diagrams are
  illustrative unless and until implementation work chooses concrete forms.
