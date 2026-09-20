import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { Readable } from "node:stream";
import test from "node:test";

import DirectUrlEnvAuthPlugin from "../dist/direct-url-env-auth.js";

const require = createRequire(import.meta.url);
const http = require("node:http");
const https = require("node:https");

const environmentVariables = [
  "DIRECT_URL_CONFIG_TOKEN_URL",
  "DIRECT_URL_CONFIG_CLIENT_ID",
  "DIRECT_URL_CONFIG_VAULT_URL",
  "DIRECT_URL_CONFIG_VAULT_TOKEN",
  "DIRECT_URL_CONFIG_VAULT_SECRET_PATH",
  "DIRECT_URL_CONFIG_VAULT_SECRET_FIELD",
];

const defaultEnvironment = {
  DIRECT_URL_CONFIG_TOKEN_URL: "https://idp.example.com/oauth/token",
  DIRECT_URL_CONFIG_CLIENT_ID: "calm-direct-url",
  DIRECT_URL_CONFIG_VAULT_URL: "http://127.0.0.1:8200",
  DIRECT_URL_CONFIG_VAULT_TOKEN: "vault-dev-token",
  DIRECT_URL_CONFIG_VAULT_SECRET_PATH: "secret/data/calm/direct-url",
};

async function withEnvironment(overrides, run) {
  const previousValues = new Map(
    environmentVariables.map((name) => [name, process.env[name]]),
  );

  for (const name of environmentVariables) {
    const value = overrides[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const name of environmentVariables) {
      const previousValue = previousValues.get(name);
      if (previousValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousValue;
      }
    }
  }
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
        .catch((error) => request.emit("error", error));
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

test("reads Vault and OAuth settings from the environment", async () => {
  await withEnvironment(defaultEnvironment, async () => {
    const plugin = new DirectUrlEnvAuthPlugin();
    const httpCalls = [];
    const httpsCalls = [];

    await withMockRequests({
      httpHandler: ({ options, url }) => {
        httpCalls.push({ options, url });
        return {
          body: JSON.stringify({ data: { data: { clientSecret: "top-secret" } } }),
        };
      },
      httpsHandler: ({ body, url }) => {
        httpsCalls.push({ body, url });
        return {
          body: JSON.stringify({ access_token: "token-123", expires_in: 300 }),
        };
      },
    }, async () => {
      assert.deepEqual(
        await plugin.getAuthHeaders("https://my-calm.repo:8443/architectures/calm-1.json"),
        { Authorization: "Bearer token-123" },
      );
    });

    assert.equal(httpCalls.length, 1);
    assert.equal(httpCalls[0].url.toString(), "http://127.0.0.1:8200/v1/secret/data/calm/direct-url");
    assert.equal(httpCalls[0].options.headers["x-vault-token"], "vault-dev-token");
    assert.equal(httpsCalls.length, 1);
    assert.equal(httpsCalls[0].url.toString(), "https://idp.example.com/oauth/token");
    assert.equal(
      httpsCalls[0].body,
      "client_id=calm-direct-url&client_secret=top-secret&grant_type=client_credentials",
    );
  });
});

test("caches tokens and uses the configured Vault secret field", async () => {
  await withEnvironment(
    { ...defaultEnvironment, DIRECT_URL_CONFIG_VAULT_SECRET_FIELD: "oauthSecret" },
    async () => {
      const plugin = new DirectUrlEnvAuthPlugin();
      const originalNow = Date.now;
      let now = 1_000_000;
      let vaultCalls = 0;
      let tokenCalls = 0;
      Date.now = () => now;

      try {
        await withMockRequests({
          httpHandler: () => {
            vaultCalls += 1;
            return {
              body: JSON.stringify({ data: { data: { oauthSecret: "top-secret" } } }),
            };
          },
          httpsHandler: () => {
            tokenCalls += 1;
            return {
              body: JSON.stringify({ access_token: `token-${tokenCalls}`, expires_in: 120 }),
            };
          },
        }, async () => {
          assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo/one"), {
            Authorization: "Bearer token-1",
          });
          now += 30_000;
          assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo/two"), {
            Authorization: "Bearer token-1",
          });
          now += 70_000;
          assert.deepEqual(await plugin.getAuthHeaders("https://my-calm.repo/three"), {
            Authorization: "Bearer token-2",
          });
        });
      } finally {
        Date.now = originalNow;
      }

      assert.equal(vaultCalls, 1);
      assert.equal(tokenCalls, 2);
    },
  );
});

test("fails clearly for missing required environment variables without exposing the Vault token", async () => {
  const vaultToken = "super-secret-vault-token";
  await withEnvironment(
    { ...defaultEnvironment, DIRECT_URL_CONFIG_VAULT_TOKEN: vaultToken, DIRECT_URL_CONFIG_VAULT_URL: undefined },
    async () => {
      const plugin = new DirectUrlEnvAuthPlugin();

      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo/architectures/calm-1.json"),
        (error) => {
          assert.equal(error instanceof Error, true);
          assert.match(error.message, /DIRECT_URL_CONFIG_VAULT_URL/);
          assert.equal(error.message.includes(vaultToken), false);
          return true;
        },
      );
    },
  );
});

test("fails clearly when the configured Vault secret field is absent", async () => {
  await withEnvironment(defaultEnvironment, async () => {
    const plugin = new DirectUrlEnvAuthPlugin();

    await withMockRequests({
      httpHandler: () => ({ body: JSON.stringify({ data: { data: {} } }) }),
      httpsHandler: () => {
        throw new Error("token endpoint should not be called");
      },
    }, async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-calm.repo/architectures/calm-1.json"),
        /Vault secret at secret\/data\/calm\/direct-url did not include string field 'clientSecret'/,
      );
    });
  });
});
