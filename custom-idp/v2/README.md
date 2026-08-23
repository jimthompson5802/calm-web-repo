# Custom IDP Direct URL Auth v2

This sample direct URL auth module follows the current Calm header-only contract.

The plugin exports a class that implements:

```ts
getAuthHeaders(url: string, requestBody: unknown): Promise<Record<string, string>>
```

It does not implement `getTlsConfig()`. It does not load CA certificates from plugin config. It gets an OAuth client-credentials token and returns it as an `Authorization` header.

## Config

Use `config/direct-url-auth.json` as the starting point:

```json
{
  "tokenUrl": "https://idp.example.com/oauth/token",
  "clientId": "calm-direct-url",
  "clientSecret": "replace-me"
}
```

`configPath` is required when Calm loads the plugin.

## Private Certificates

Keep private CA certificates out of source control.

Recommended local location:

```text
custom-idp/v2/config/certs/private-root-ca.pem
```

That path is a local operator convention only. Do not commit real certificate files into `config/certs/`.

If your IDP or direct URL endpoint uses a private CA, configure Node trust before you run Calm:

```bash
export NODE_EXTRA_CA_CERTS="$PWD/custom-idp/v2/config/certs/private-root-ca.pem"
```

You can also keep the certificate in any other private machine-specific location and point `NODE_EXTRA_CA_CERTS` there instead.

`NODE_TLS_REJECT_UNAUTHORIZED=0` is available as a Node override, but it is not the recommended default because it disables certificate verification for the process.

## Build And Test

```bash
npm test
```
