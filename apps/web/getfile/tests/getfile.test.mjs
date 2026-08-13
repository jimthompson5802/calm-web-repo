import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..", "..");
const libraryPath = pathToFileURL(path.resolve(webRoot, "getfile", "dist", "lib.js")).href;
const { LOCAL_STACK_ORIGIN, buildAuthorizationUrl, runCli } = await import(libraryPath);

const TEST_ORIGIN = "https://127.0.0.1:8443";
const ALT_TEST_ORIGIN = "https://127.0.0.1:9443";

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createCaptureStream() {
  const chunks = [];

  return {
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    },
    toBuffer() {
      return Buffer.concat(chunks);
    },
    toString() {
      return this.toBuffer().toString("utf-8");
    },
  };
}

function runCliProcess(args) {
  const cliPath = path.resolve(webRoot, "getfile", "dist", "main.js");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: webRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stderr: Buffer.concat(stderr).toString("utf-8"),
        stdout: Buffer.concat(stdout).toString("utf-8"),
      });
    });
  });
}

function createMockCallbackHarness() {
  const pending = [];

  return {
    callbackServerFactory: async (expectedState) => {
      let resolveCode;
      let rejectCode;
      const waitForCode = new Promise((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });

      pending.push({ expectedState, rejectCode, resolveCode });
      return {
        close: async () => {},
        redirectUri: "http://127.0.0.1:51004",
        waitForCode,
      };
    },
    completeFromRedirect(redirectLocation) {
      const request = pending.shift();
      assert.ok(request, "expected a pending callback request");

      const redirectUrl = new URL(redirectLocation);
      const authError = redirectUrl.searchParams.get("error");
      if (authError) {
        const description = redirectUrl.searchParams.get("error_description") ?? authError;
        request.rejectCode(new Error(`Authentication failed: ${description}`));
        return;
      }

      const state = redirectUrl.searchParams.get("state");
      const code = redirectUrl.searchParams.get("code");
      if (!state || !code) {
        request.rejectCode(new Error("Authentication response did not include both state and code."));
        return;
      }

      if (state !== request.expectedState) {
        request.rejectCode(new Error("Authentication state did not match the login request."));
        return;
      }

      request.resolveCode(code);
    },
  };
}

function createMockTransport(handler, callbackHarness) {
  return {
    browserOpener: async (authUrl) => {
      const response = await handler({
        body: "",
        headers: {},
        method: "GET",
        url: new URL(authUrl),
      });

      const location = Array.isArray(response.headers?.location)
        ? response.headers.location[0]
        : response.headers?.location;
      if (!location) {
        throw new Error("Authorization response did not include a redirect.");
      }

      callbackHarness.completeFromRedirect(location);
    },
    requestBufferImpl: async (url, options) => {
      const response = await handler({
        body: options.body ?? "",
        headers: options.headers ?? {},
        method: options.method,
        url,
      });

      return {
        body: Buffer.from(response.body ?? "", "utf-8"),
        headers: response.headers ?? {},
        statusCode: response.statusCode,
      };
    },
  };
}

async function withTempCache(run) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "getfile-cache-"));
  const cacheFilePath = path.join(tempRoot, "home", ".calm", "getfile-token.json");

  try {
    await run(cacheFilePath);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function writeCacheFile(cacheFilePath, value) {
  await mkdir(path.dirname(cacheFilePath), { recursive: true });
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(cacheFilePath, content, "utf-8");
}

async function readCacheFile(cacheFilePath) {
  return JSON.parse(await readFile(cacheFilePath, "utf-8"));
}

function buildTokenResponse(accessToken, overrides = {}) {
  return JSON.stringify({
    access_token: accessToken,
    expires_in: 600,
    refresh_expires_in: 1800,
    refresh_token: "refresh-token",
    token_type: "Bearer",
    ...overrides,
  });
}

function authRedirect(requestUrl, code, stateOverride) {
  const redirectUri = requestUrl.searchParams.get("redirect_uri");
  const state = stateOverride ?? requestUrl.searchParams.get("state");
  return `${redirectUri}?code=${code}&state=${state}`;
}

const REFRESH_FAILURE_SECRET = "refresh-secret-value";
const TOKEN_FAILURE_SECRET = "token-secret-value";

function extractLifecycleLines(output) {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith(">>> "));
}

function assertLifecycleLogs(output) {
  const lines = extractLifecycleLines(output);
  assert.ok(lines.length > 0, "expected lifecycle logs");
  for (const line of lines) {
    assert.match(line, /^>>> /);
  }
}

function assertNoSecretLeak(outputs, secrets) {
  for (const output of outputs) {
    for (const secret of secrets) {
      assert.ok(!output.includes(secret), `did not expect output to include secret: ${secret}`);
    }
  }
}

test("prints usage and exits non-zero when the URL is missing", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli([], { stderr, stdout });

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Usage: getfile/);
  assert.equal(stdout.toString(), "");
});

test("prints help and exits zero", async () => {
  const result = await runCliProcess(["--help"]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: getfile/);
  assert.equal(result.stderr, "");
});

test("rejects non-local stack URLs", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli(["https://example.com/architectures/calm-1.json"], { stderr, stdout });

  assert.equal(code, 1);
  const expectedMessage =
    LOCAL_STACK_ORIGIN === "https://localhost:8443"
      ? /Only https:\/\/localhost:8443\/\.\.\. URLs are supported\./
      : new RegExp(
          `Only https://localhost:8443/\\.\\.\\. or ${escapeForRegExp(LOCAL_STACK_ORIGIN)}/\\.\\.\\. URLs are supported\\.`,
        );
  assert.match(stderr.toString(), expectedMessage);
  assert.equal(stdout.toString(), "");
});

test("rejects plain HTTP URLs", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli(["http://localhost:8443/architectures/calm-1.json"], { stderr, stdout });

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Only https:\/\/ URLs are supported\./);
  assert.equal(stdout.toString(), "");
});

test("rejects the removed username/password options", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli(
    ["https://localhost:8443/architectures/calm-1.json", "--username", "local-user"],
    { stderr, stdout },
  );

  assert.equal(code, 1);
  assert.match(stderr.toString(), /--username is no longer supported/);
  assert.equal(stdout.toString(), "");
});

test("rejects a missing --browser value", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli(["https://localhost:8443/architectures/calm-1.json", "--browser"], { stderr, stdout });

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Missing value for --browser\./);
  assert.equal(stdout.toString(), "");
});

test("builds a PKCE authorization URL for the local stack", () => {
  const authUrl = buildAuthorizationUrl("http://127.0.0.1:51004", "state-123", "challenge-abc", LOCAL_STACK_ORIGIN);

  assert.equal(authUrl.origin, LOCAL_STACK_ORIGIN);
  assert.equal(authUrl.pathname, "/keycloak/realms/calm-local/protocol/openid-connect/auth");
  assert.equal(authUrl.searchParams.get("client_id"), "calm-cli");
  assert.equal(authUrl.searchParams.get("response_type"), "code");
  assert.equal(authUrl.searchParams.get("scope"), "openid");
  assert.equal(authUrl.searchParams.get("state"), "state-123");
  assert.equal(authUrl.searchParams.get("code_challenge"), "challenge-abc");
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authUrl.searchParams.get("redirect_uri"), "http://127.0.0.1:51004");
});

test("accepts localhost file URLs when the auth origin uses a shared local-stack host", async () => {
  const callbackHarness = createMockCallbackHarness();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli(["https://localhost:8443/architectures/calm-1.json"], {
    browserOpener: async () => {
      throw new Error("browser unavailable");
    },
    callbackServerFactory: callbackHarness.callbackServerFactory,
    stackOrigin: "https://192.168.0.20:8443",
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/192\.168\.0\.20:8443\//);
  assertLifecycleLogs(stderr.toString());
});

test("accepts configured hostname file URLs", async () => {
  const callbackHarness = createMockCallbackHarness();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli(["https://my-arch.repo:8443/architectures/calm-1.json"], {
    browserOpener: async () => {
      throw new Error("browser unavailable");
    },
    callbackServerFactory: callbackHarness.callbackServerFactory,
    stackOrigin: "https://my-arch.repo:8443",
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/my-arch\.repo:8443\//);
  assertLifecycleLogs(stderr.toString());
});

test("prints a manual auth URL when the browser cannot be opened", async () => {
  const callbackHarness = createMockCallbackHarness();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
    browserOpener: async () => {
      throw new Error("browser unavailable");
    },
    callbackServerFactory: callbackHarness.callbackServerFactory,
    stackOrigin: TEST_ORIGIN,
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
  assert.match(stderr.toString(), /Unable to open browser automatically\. Open this URL manually:\nhttps:\/\/127\.0\.0\.1:/);
  assertLifecycleLogs(stderr.toString());
  assert.equal(stdout.toString(), "");
});

test("passes the selected browser app to the opener", async () => {
  const callbackHarness = createMockCallbackHarness();
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost", "--browser", "Google Chrome"], {
    browserOpener: async (_authUrl, browser) => {
      assert.equal(browser, "Google Chrome");
      throw new Error("browser unavailable");
    },
    callbackServerFactory: callbackHarness.callbackServerFactory,
    stackOrigin: TEST_ORIGIN,
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
  assert.match(stderr.toString(), /Unable to open browser automatically\. Open this URL manually:\nhttps:\/\/127\.0\.0\.1:/);
  assertLifecycleLogs(stderr.toString());
  assert.equal(stdout.toString(), "");
});

test("fails when the callback state does not match", async () => {
  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      return {
        headers: { location: authRedirect(url, "test-code", "wrong-state") },
        statusCode: 302,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
    browserOpener: transport.browserOpener,
    callbackServerFactory: callbackHarness.callbackServerFactory,
    requestBufferImpl: transport.requestBufferImpl,
    stackOrigin: TEST_ORIGIN,
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
  assert.match(stderr.toString(), /Authentication state did not match the login request\./);
  assertLifecycleLogs(stderr.toString());
  assert.equal(stdout.toString(), "");
});

test("fetches a protected file after browser login and writes the cache entry", async () => {
  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ body, headers, method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      return {
        headers: { location: authRedirect(url, "test-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      const params = new URLSearchParams(body);

      assert.equal(params.get("grant_type"), "authorization_code");
      assert.equal(params.get("client_id"), "calm-cli");
      assert.equal(params.get("code"), "test-code");
      assert.equal(params.get("redirect_uri"), "http://127.0.0.1:51004");
      assert.ok(params.get("code_verifier"));

      return {
        body: buildTokenResponse("good-token", { refresh_token: "good-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      assert.equal(headers.authorization, "Bearer good-token");
      return {
        body: '{"name":"calm-1"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"calm-1"}');
    assert.match(stderr.toString(), />>> Starting token session acquisition for https:\/\/127\.0\.0\.1:8443\/architectures\/calm-1\.json/);
    assert.match(stderr.toString(), />>> No cache file found at .*getfile-token\.json/);
    assert.match(stderr.toString(), />>> No cached session entry found for https:\/\/127\.0\.0\.1:8443/);
    assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), />>> Received authorization callback code/);
    assert.match(stderr.toString(), />>> Authorization code exchange succeeded; access token expires in \d+s/);
    assert.match(stderr.toString(), />>> Saved browser-authenticated session to cache at .*getfile-token\.json/);
    assert.match(stderr.toString(), />>> Fetching protected file using browser session/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak([stderr.toString(), stdout.toString()], ["good-token", "good-refresh"]);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "good-token");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "good-refresh");
    assert.equal(cache[TEST_ORIGIN].tokenType, "Bearer");
    assert.ok(cache[TEST_ORIGIN].expiresAtEpochMs > Date.now());
    assert.ok(cache[TEST_ORIGIN].refreshExpiresAtEpochMs > cache[TEST_ORIGIN].expiresAtEpochMs);
  });
});

test("reuses a cached token across separate CLI runs without opening the browser again", async () => {
  let authRequests = 0;
  let tokenRequests = 0;
  let fileRequests = 0;

  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ body, headers, method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      authRequests += 1;
      return {
        headers: { location: authRedirect(url, "test-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      tokenRequests += 1;
      const params = new URLSearchParams(body);
      assert.equal(params.get("grant_type"), "authorization_code");

      return {
        body: buildTokenResponse("good-token", { refresh_token: "good-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      fileRequests += 1;
      assert.equal(headers.authorization, "Bearer good-token");
      return {
        body: '{"name":"cached"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const firstCode = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr: createCaptureStream(),
      stdout: createCaptureStream(),
    });

    assert.equal(firstCode, 0);

    const secondStdout = createCaptureStream();
    const secondStderr = createCaptureStream();
    const secondCode = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: async () => {
        throw new Error("browser should not open");
      },
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr: secondStderr,
      stdout: secondStdout,
    });

    assert.equal(secondCode, 0);
    assert.equal(secondStdout.toString(), '{"name":"cached"}');
    assert.match(secondStderr.toString(), />>> Checking token cache at .*getfile-token\.json for https:\/\/127\.0\.0\.1:8443/);
    assert.match(secondStderr.toString(), />>> Using cached access token; expires in \d+s/);
    assert.match(secondStderr.toString(), />>> Fetching protected file using cache session/);
    assertLifecycleLogs(secondStderr.toString());
    assertNoSecretLeak([secondStderr.toString(), secondStdout.toString()], ["good-token", "good-refresh"]);
    assert.equal(authRequests, 1);
    assert.equal(tokenRequests, 1);
    assert.equal(fileRequests, 2);
  });
});

test("refreshes an expiring cached token without opening the browser", async () => {
  let refreshRequests = 0;

  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ body, headers, method, url }) => {
    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      refreshRequests += 1;
      const params = new URLSearchParams(body);

      assert.equal(params.get("grant_type"), "refresh_token");
      assert.equal(params.get("refresh_token"), "refresh-1");

      return {
        body: buildTokenResponse("refreshed-token", { refresh_token: "refresh-2" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      assert.equal(headers.authorization, "Bearer refreshed-token");
      return {
        body: '{"name":"refreshed"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const now = Date.now();
    await writeCacheFile(cacheFilePath, {
      [TEST_ORIGIN]: {
        accessToken: "stale-token",
        expiresAtEpochMs: now + 5_000,
        refreshExpiresAtEpochMs: now + 600_000,
        refreshToken: "refresh-1",
        tokenType: "Bearer",
      },
    });

    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: async () => {
        throw new Error("browser should not open");
      },
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"refreshed"}');
    assert.match(stderr.toString(), />>> Cached access token expired or near expiry; expires in \d+s/);
    assert.match(stderr.toString(), />>> Refresh token is usable; attempting silent refresh/);
    assert.match(stderr.toString(), />>> Refreshing access token with refresh_token grant/);
    assert.match(stderr.toString(), />>> Refresh succeeded; access token expires in \d+s/);
    assert.match(stderr.toString(), />>> Saved refreshed session to cache at .*getfile-token\.json/);
    assert.match(stderr.toString(), />>> Fetching protected file using refresh session/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak([stderr.toString(), stdout.toString()], ["stale-token", "refresh-1", "refreshed-token", "refresh-2"]);
    assert.equal(refreshRequests, 1);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "refreshed-token");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "refresh-2");
  });
});

test("falls back to browser login when refresh fails and rewrites the cache", async () => {
  let authRequests = 0;
  let refreshRequests = 0;
  let authCodeTokenRequests = 0;

  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ body, headers, method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      authRequests += 1;
      return {
        headers: { location: authRedirect(url, "browser-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      const params = new URLSearchParams(body);

      if (params.get("grant_type") === "refresh_token") {
        refreshRequests += 1;
        return {
          body: `refresh failed ${REFRESH_FAILURE_SECRET}`,
          headers: { "content-type": "text/plain" },
          statusCode: 400,
        };
      }

      authCodeTokenRequests += 1;
      assert.equal(params.get("grant_type"), "authorization_code");
      return {
        body: buildTokenResponse("browser-token", { refresh_token: "browser-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      assert.equal(headers.authorization, "Bearer browser-token");
      return {
        body: '{"name":"browser"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const now = Date.now();
    await writeCacheFile(cacheFilePath, {
      [TEST_ORIGIN]: {
        accessToken: "expired-token",
        expiresAtEpochMs: now - 1_000,
        refreshExpiresAtEpochMs: now + 600_000,
        refreshToken: "refresh-1",
        tokenType: "Bearer",
      },
    });

    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"browser"}');
    assert.match(
      stderr.toString(),
      />>> Refresh failed; clearing cached session and falling back to browser authentication \(token request failed with status 400\)/,
    );
    assert.match(stderr.toString(), />>> Cleared cached session for https:\/\/127\.0\.0\.1:8443/);
    assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), />>> Authorization code exchange succeeded; access token expires in \d+s/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak(
      [stderr.toString(), stdout.toString()],
      ["expired-token", "refresh-1", "browser-token", "browser-refresh", REFRESH_FAILURE_SECRET],
    );
    assert.equal(refreshRequests, 1);
    assert.equal(authRequests, 1);
    assert.equal(authCodeTokenRequests, 1);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "browser-token");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "browser-refresh");
  });
});

test("redacts token endpoint response bodies when authorization code exchange fails", async () => {
  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      return {
        headers: { location: authRedirect(url, "test-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      return {
        body: `authorization failed ${TOKEN_FAILURE_SECRET}`,
        headers: { "content-type": "text/plain" },
        statusCode: 400,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 1);
    assert.match(stderr.toString(), /Token request failed with status 400/);
    assert.ok(!stderr.toString().includes(TOKEN_FAILURE_SECRET));
    assert.ok(!stdout.toString().includes(TOKEN_FAILURE_SECRET));
    assertLifecycleLogs(stderr.toString());
    assert.equal(stdout.toString(), "");
  });
});

test("ignores a corrupt cache file and replaces it with a fresh session", async () => {
  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ headers, method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      return {
        headers: { location: authRedirect(url, "test-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      return {
        body: buildTokenResponse("recovered-token", { refresh_token: "recovered-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      assert.equal(headers.authorization, "Bearer recovered-token");
      return {
        body: '{"name":"recovered"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    await writeCacheFile(cacheFilePath, "{not-json");

    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"recovered"}');
    assert.match(stderr.toString(), />>> Cache file at .*getfile-token\.json is invalid JSON; ignoring cached sessions/);
    assert.match(stderr.toString(), />>> No cached session entry found for https:\/\/127\.0\.0\.1:8443/);
    assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak([stderr.toString(), stdout.toString()], ["recovered-token", "recovered-refresh"]);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "recovered-token");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "recovered-refresh");
  });
});

test("re-authenticates once when a cached token gets a 401 response", async () => {
  let authRequests = 0;
  let fileRequests = 0;

  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ body, headers, method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      authRequests += 1;
      return {
        headers: { location: authRedirect(url, "browser-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      const params = new URLSearchParams(body);
      assert.equal(params.get("grant_type"), "authorization_code");

      return {
        body: buildTokenResponse("browser-token", { refresh_token: "browser-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
      fileRequests += 1;
      if (headers.authorization === "Bearer cached-token") {
        return {
          body: "expired",
          headers: { "content-type": "text/plain" },
          statusCode: 401,
        };
      }

      assert.equal(headers.authorization, "Bearer browser-token");
      return {
        body: '{"name":"retried"}',
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    await writeCacheFile(cacheFilePath, {
      [TEST_ORIGIN]: {
        accessToken: "cached-token",
        expiresAtEpochMs: Date.now() + 600_000,
        refreshToken: "cached-refresh",
        tokenType: "Bearer",
      },
    });

    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"retried"}');
    assert.match(stderr.toString(), />>> Using cached access token; expires in \d+s/);
    assert.match(stderr.toString(), />>> Fetching protected file using cache session/);
    assert.match(stderr.toString(), />>> Received 401; clearing cached session and retrying with browser authentication/);
    assert.match(stderr.toString(), />>> Starting browser re-authentication after 401/);
    assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), />>> Browser re-authentication succeeded; saved session to cache at .*getfile-token\.json/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak([stderr.toString(), stdout.toString()], ["cached-token", "cached-refresh", "browser-token", "browser-refresh"]);
    assert.equal(authRequests, 1);
    assert.equal(fileRequests, 2);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "browser-token");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "browser-refresh");
  });
});

test("stores cache entries separately for different stack origins", async () => {
  await withTempCache(async (cacheFilePath) => {
    const callbackHarnessOne = createMockCallbackHarness();
    const transportOne = createMockTransport(async ({ headers, method, url }) => {
      if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
        return {
          headers: { location: authRedirect(url, "origin-one") },
          statusCode: 302,
        };
      }

      if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
        return {
          body: buildTokenResponse("token-one", { refresh_token: "refresh-one" }),
          headers: { "content-type": "application/json" },
          statusCode: 200,
        };
      }

      if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
        assert.equal(headers.authorization, "Bearer token-one");
        return {
          body: '{"name":"one"}',
          headers: { "content-type": "application/json" },
          statusCode: 200,
        };
      }

      return { statusCode: 404 };
    }, callbackHarnessOne);

    const firstCode = await runCli([`${TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transportOne.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarnessOne.callbackServerFactory,
      requestBufferImpl: transportOne.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr: createCaptureStream(),
      stdout: createCaptureStream(),
    });

    assert.equal(firstCode, 0);

    const callbackHarnessTwo = createMockCallbackHarness();
    const transportTwo = createMockTransport(async ({ headers, method, url }) => {
      if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
        return {
          headers: { location: authRedirect(url, "origin-two") },
          statusCode: 302,
        };
      }

      if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
        return {
          body: buildTokenResponse("token-two", { refresh_token: "refresh-two" }),
          headers: { "content-type": "application/json" },
          statusCode: 200,
        };
      }

      if (method === "GET" && url.pathname === "/architectures/calm-1.json") {
        assert.equal(headers.authorization, "Bearer token-two");
        return {
          body: '{"name":"two"}',
          headers: { "content-type": "application/json" },
          statusCode: 200,
        };
      }

      return { statusCode: 404 };
    }, callbackHarnessTwo);

    const secondCode = await runCli([`${ALT_TEST_ORIGIN}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: transportTwo.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarnessTwo.callbackServerFactory,
      requestBufferImpl: transportTwo.requestBufferImpl,
      stackOrigin: ALT_TEST_ORIGIN,
      stderr: createCaptureStream(),
      stdout: createCaptureStream(),
    });

    assert.equal(secondCode, 0);

    const cache = await readCacheFile(cacheFilePath);
    assert.equal(cache[TEST_ORIGIN].accessToken, "token-one");
    assert.equal(cache[TEST_ORIGIN].refreshToken, "refresh-one");
    assert.equal(cache[ALT_TEST_ORIGIN].accessToken, "token-two");
    assert.equal(cache[ALT_TEST_ORIGIN].refreshToken, "refresh-two");
  });
});

test("exits non-zero when the protected file returns a non-2xx status", async () => {
  const callbackHarness = createMockCallbackHarness();
  const transport = createMockTransport(async ({ method, url }) => {
    if (method === "GET" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/auth") {
      return {
        headers: { location: authRedirect(url, "test-code") },
        statusCode: 302,
      };
    }

    if (method === "POST" && url.pathname === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      return {
        body: buildTokenResponse("good-token", { refresh_token: "good-refresh" }),
        headers: { "content-type": "application/json" },
        statusCode: 200,
      };
    }

    if (method === "GET" && url.pathname === "/architectures/missing.json") {
      return {
        body: "not found",
        headers: { "content-type": "text/plain" },
        statusCode: 404,
      };
    }

    return { statusCode: 404 };
  }, callbackHarness);

  await withTempCache(async (cacheFilePath) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${TEST_ORIGIN}/architectures/missing.json`, "--insecure-localhost"], {
      browserOpener: transport.browserOpener,
      cacheFilePath,
      callbackServerFactory: callbackHarness.callbackServerFactory,
      requestBufferImpl: transport.requestBufferImpl,
      stackOrigin: TEST_ORIGIN,
      stderr,
      stdout,
    });

    assert.equal(code, 1);
    assert.match(stderr.toString(), />>> Opening browser for authentication: https:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), /File request failed with status 404: not found/);
    assertLifecycleLogs(stderr.toString());
    assertNoSecretLeak([stderr.toString(), stdout.toString()], ["good-token", "good-refresh"]);
    assert.equal(stdout.toString(), "");
  });
});
