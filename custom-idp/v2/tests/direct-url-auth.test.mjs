import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import DirectUrlAuthPlugin from "../dist/direct-url-auth.js";

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
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ access_token: "token-123", expires_in: 300 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const headers = await plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json");
      assert.deepEqual(headers, { Authorization: "Bearer token-123" });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://idp.example.com/oauth/token");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["content-type"], "application/x-www-form-urlencoded");
      assert.equal(calls[0].options.headers.accept, "application/json");
      assert.equal(calls[0].options.body.toString(), "client_id=calm-direct-url&client_secret=top-secret&grant_type=client_credentials");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("fails clearly when the token endpoint returns a non-200 response", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response("bad request", {
        status: 400,
        statusText: "Bad Request",
      });

    try {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
        /Token request failed: 400 Bad Request/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("fails clearly when the token response omits access_token", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ expires_in: 300 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      await assert.rejects(
        plugin.getAuthHeaders("https://my-arch.repo:8443/architectures/calm-1.json"),
        /No access_token in token response/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("reuses a cached token until it is near expiry", async () => {
  await withTempDir(async (root) => {
    const configPath = await writeConfig(root);
    const plugin = new DirectUrlAuthPlugin(configPath);
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    const issuedAt = 1_000_000;
    let now = issuedAt;
    let tokenIndex = 0;

    Date.now = () => now;
    globalThis.fetch = async () => {
      tokenIndex += 1;
      return new Response(
        JSON.stringify({ access_token: `token-${tokenIndex}`, expires_in: 120 }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    try {
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
    } finally {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
    }
  });
});
