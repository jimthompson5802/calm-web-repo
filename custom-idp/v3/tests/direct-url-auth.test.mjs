import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import DirectUrlAuthPlugin from "../dist/direct-url-auth.js";

const require = createRequire(import.meta.url);
const http = require("node:http");
const https = require("node:https");

async function writeConfig(root, overrides = {}) {
  const configPath = path.join(root, "direct-url-auth.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        tokenUrl: "https://idp.example.com/oauth/token",
        clientId: "calm-direct-url",
        vaultUrl: "http://127.0.0.1:8200",
        vaultToken: "vault-dev-token",
        vaultSecretPath: "secret/data/calm/direct-url",
        vaultSecretField: "clientSecret",
        ...overrides,
      },
      null,
      2,
    ),
    "utf8",
  );
  return configPath;
}

function createResponse(body, { headers, statusCode, statusText } = {}) {
  const response = Readable.from([body]);
  response.headers = headers ?? { "content-type": "application/json" };
  response.statusCode = statusCode ?? 200;
  response.statusMessage = statusText ?? "OK";
  return response;
}

async function withMockRequests({ httpHandler, httpsHandler }, run) {
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  const createMockRequest = (handler, scheme) => (url, options, responseListener) => {
    const request = new EventEmitter();
    let requestBody = "";

    request.write = (chunk) => {
      requestBody += chunk.toString();
      return true;
    };

    request.end = () => {
      Promise.resolve(handler({ body: requestBody, options, url, scheme }))
        .then((result) => {
          if (result?.error) {
            request.emit("error", result.error);
            return;
          }
          responseListener(
            createResponse(result.body, {
              headers: result.headers,
              statusCode: result.statusCode,
              statusText: result.statusText,
            }),
          );
        })
        .catch((error) => {
          request.emit("error", error);
        });
    };

    return request;
  };

  http.request = createMockRequest(httpHandler, "http");
  https.request = createMockRequest(httpsHandler, "https");
  syncBuiltinESMExports();

  try {
    await run();
  } finally {
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
    syncBuiltinESMExports();
  }
}

async function withTempDir(run) {
  const root = await mkdtemp(path.join(tmpdir(), "direct-url-auth-v3-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("reads the client secret from Vault and requests a client-credentials token", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const httpCalls = [];
    const httpsCalls = [];

    await withMockRequests({
      httpHandler: ({ body, options, url }) => {
        httpCalls.push({ body, options, url });
        return {
          body: JSON.stringify({
            data: {
              data: {
                clientSecret: "top-secret",
              },
            },
          }),
        };
      },
      httpsHandler: ({ body, options, url }) => {
        httpsCalls.push({ body, options, url });
        return {
          body: JSON.stringify({ access_token: "token-123", expires_in: 300 }),
        };
      },
    }, async () => {
      const headers = await plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json");
      assert.deepEqual(headers, { Authorization: "Bearer token-123" });
      assert.equal(httpCalls.length, 1);
      assert.equal(httpCalls[0].url.toString(), "http://127.0.0.1:8200/v1/secret/data/calm/direct-url");
      assert.equal(httpCalls[0].options.method, "GET");
      assert.equal(httpCalls[0].options.headers["x-vault-token"], "vault-dev-token");
      assert.equal(httpsCalls.length, 1);
      assert.equal(httpsCalls[0].body, "client_id=calm-direct-url&client_secret=top-secret&grant_type=client_credentials");
    });
  });
});

test("caches the OAuth token and avoids repeated Vault reads until token refresh is needed", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const originalNow = Date.now;
    let now = 1_000_000;
    let tokenIndex = 0;
    let vaultCalls = 0;
    let tokenCalls = 0;

    Date.now = () => now;

    await withMockRequests({
      httpHandler: () => {
        vaultCalls += 1;
        return {
          body: JSON.stringify({
            data: {
              data: {
                clientSecret: "top-secret",
              },
            },
          }),
        };
      },
      httpsHandler: () => {
        tokenCalls += 1;
        tokenIndex += 1;
        return {
          body: JSON.stringify({ access_token: `token-${tokenIndex}`, expires_in: 120 }),
        };
      },
    }, async () => {
      assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"), {
        Authorization: "Bearer token-1",
      });
      now += 30_000;
      assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"), {
        Authorization: "Bearer token-1",
      });
      now += 70_000;
      assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"), {
        Authorization: "Bearer token-2",
      });
      assert.equal(vaultCalls, 1);
      assert.equal(tokenCalls, 2);
    });

    Date.now = originalNow;
  });
});

test("fails clearly when the Vault secret field is missing", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockRequests({
      httpHandler: () => ({
        body: JSON.stringify({
          data: {
            data: {},
          },
        }),
      }),
      httpsHandler: () => {
        throw new Error("token endpoint should not be called");
      },
    }, async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
        /Vault secret at secret\/data\/calm\/direct-url did not include string field 'clientSecret'/,
      );
    });
  });
});

test("fails clearly when the Vault request returns a non-200 response", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockRequests({
      httpHandler: () => ({
        body: "forbidden",
        statusCode: 403,
        statusText: "Forbidden",
        headers: { "content-type": "text/plain" },
      }),
      httpsHandler: () => {
        throw new Error("token endpoint should not be called");
      },
    }, async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
        /Vault secret request to http:\/\/127\.0\.0\.1:8200\/v1\/secret\/data\/calm\/direct-url failed: 403 Forbidden/,
      );
    });
  });
});

test("fails clearly when the config file is missing required Vault fields", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root, { vaultUrl: "" });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await assert.rejects(
      plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
      /must include tokenUrl, clientId, vaultUrl, vaultToken, and vaultSecretPath/,
    );
  });
});

test("never leaks the secret value in error messages", async () => {
  await withTempDir(async (root) => {
    const clientSecret = "super-secret-value";
    const configPath = await writeConfig(root, { tokenUrl: "::not-a-url::" });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockRequests({
      httpHandler: () => ({
        body: JSON.stringify({
          data: {
            data: {
              clientSecret,
            },
          },
        }),
      }),
      httpsHandler: () => {
        throw new Error("token endpoint should not be called");
      },
    }, async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
        (error) => {
          assert.equal(error instanceof Error, true);
          assert.equal(error.message.includes(clientSecret), false);
          return true;
        },
      );
    });
  });
});

test("fails clearly when the Vault response is not valid JSON", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockRequests({
      httpHandler: () => ({
        body: "{not-json",
      }),
      httpsHandler: () => {
        throw new Error("token endpoint should not be called");
      },
    }, async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
        /Vault secret request to http:\/\/127\.0\.0\.1:8200\/v1\/secret\/data\/calm\/direct-url failed: response was not valid JSON:/,
      );
    });
  });
});
