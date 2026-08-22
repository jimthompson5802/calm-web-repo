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
const https = require("node:https");

async function writeConfig(root, overrides = {}) {
  const configPath = path.join(root, "direct-url-auth.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        tokenUrl: "https://idp.example.com/oauth/token",
        clientId: "calm-direct-url",
        clientSecret: "top-secret",
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

async function withMockHttpsRequest(handler, run) {
  const originalRequest = https.request;

  https.request = (url, options, responseListener) => {
    const request = new EventEmitter();
    let requestBody = "";

    request.write = (chunk) => {
      requestBody += chunk.toString();
      return true;
    };

    request.end = () => {
      Promise.resolve(handler({ body: requestBody, options, url }))
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
  syncBuiltinESMExports();

  try {
    await run();
  } finally {
    https.request = originalRequest;
    syncBuiltinESMExports();
  }
}

async function withTempDir(run) {
  const root = await mkdtemp(path.join(tmpdir(), "direct-url-auth-v2-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("requests a client-credentials token with form-encoded data", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const calls = [];

    await withMockHttpsRequest(({ body, options, url }) => {
      calls.push({ body, options, url });
      return {
        body: JSON.stringify({ access_token: "token-123", expires_in: 300 }),
      };
    }, async () => {
      const headers = await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json");
      assert.deepEqual(headers, { Authorization: "Bearer token-123" });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url.toString(), "https://idp.example.com/oauth/token");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["content-type"], "application/x-www-form-urlencoded");
      assert.equal(calls[0].options.headers.accept, "application/json");
      assert.equal(calls[0].body, "client_id=calm-direct-url&client_secret=top-secret&grant_type=client_credentials");
      assert.equal(calls[0].options.ca, undefined);
    });
  });
});

test("fails clearly when the token endpoint returns a non-200 response", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockHttpsRequest(() => ({
      body: "bad request",
      statusCode: 400,
      statusText: "Bad Request",
      headers: { "content-type": "text/plain" },
    }), async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
        /Direct URL auth token request to https:\/\/idp\.example\.com\/oauth\/token failed: 400 Bad Request/,
      );
    });
  });
});

test("fails clearly when the token response omits access_token", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockHttpsRequest(() => ({
      body: JSON.stringify({ expires_in: 300 }),
    }), async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
        /Direct URL auth token response from https:\/\/idp\.example\.com\/oauth\/token did not include access_token/,
      );
    });
  });
});

test("uses the configured CA certificate for the token request", async () => {
  await withTempDir(async (root) => {
    const certPath = path.join(root, "local-ca.pem");
    await writeFile(certPath, "test-ca-cert", "utf8");
    const configPath = await writeConfig(root, { caCertPath: "./local-ca.pem" });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockHttpsRequest(({ options }) => {
      assert.equal(options.ca, "test-ca-cert");
      return {
        body: JSON.stringify({ access_token: "token-123", expires_in: 300 }),
      };
    }, async () => {
      const headers = await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json");
      assert.deepEqual(headers, { Authorization: "Bearer token-123" });
    });
  });
});

test("fails clearly when the TLS handshake fails", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);

    await withMockHttpsRequest(() => ({
      error: new Error("self-signed certificate"),
    }), async () => {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
        /Direct URL auth token request to https:\/\/idp\.example\.com\/oauth\/token failed: self-signed certificate/,
      );
    });
  });
});

test("fails clearly when the config file cannot be parsed", async () => {
  await withTempDir(async (root) => {
    const configPath = path.join(root, "direct-url-auth.json");
    await writeFile(configPath, "{not-json", "utf8");
    const plugin = new DirectUrlAuthPlugin(configPath);

    await assert.rejects(
      plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
      /Failed to parse direct URL auth config at .*direct-url-auth\.json:/,
    );
  });
});

test("fails clearly when the configured CA certificate cannot be read", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root, { caCertPath: "./missing-ca.pem" });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await assert.rejects(
      plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
      /Failed to read direct URL auth CA certificate at .*missing-ca\.pem:/,
    );
  });
});

test("fails clearly when the token URL is invalid", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root, { tokenUrl: "::not-a-url::" });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await assert.rejects(
      plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
      /Invalid direct URL auth tokenUrl '::not-a-url::':/,
    );
  });
});

test("never leaks client secrets in error messages", async () => {
  await withTempDir(async (root) => {
    const clientSecret = "super-secret-value";
    const configPath = await writeConfig(root, {
      tokenUrl: "::not-a-url::",
      clientSecret,
    });
    const plugin = new DirectUrlAuthPlugin(configPath);

    await assert.rejects(
      plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
      (error) => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message.includes(clientSecret), false);
        return true;
      },
    );
  });
});

test("reuses a cached token until it is near expiry", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const originalNow = Date.now;
    const issuedAt = 1_000_000;
    let now = issuedAt;
    let tokenIndex = 0;

    Date.now = () => now;

    try {
      await withMockHttpsRequest(() => {
        tokenIndex += 1;
        return {
          body: JSON.stringify({ access_token: `token-${tokenIndex}`, expires_in: 120 }),
        };
      }, async () => {
        assert.deepEqual(await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"), {
          Authorization: "Bearer token-1",
        });

        now += 30_000;
        assert.deepEqual(await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-2.json"), {
          Authorization: "Bearer token-1",
        });

        now += 31_000;
        assert.deepEqual(await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-3.json"), {
          Authorization: "Bearer token-2",
        });
      });
    } finally {
      Date.now = originalNow;
    }
  });
});
