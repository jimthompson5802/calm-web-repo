import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..", "..");
const certPath = path.resolve(__dirname, "fixtures", "localhost-cert.pem");
const keyPath = path.resolve(__dirname, "fixtures", "localhost-key.pem");
const libraryPath = pathToFileURL(path.resolve(webRoot, "getfile", "dist", "lib.js")).href;
const {
  LOCAL_STACK_ORIGIN,
  buildAuthorizationUrl,
  runCli,
} = await import(libraryPath);

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

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function visitAuthUrl(authUrl, insecureLocalhost) {
  const authResponse = await new Promise((resolve, reject) => {
    const request = https.request(authUrl, { method: "GET", rejectUnauthorized: !insecureLocalhost }, (response) => {
      resolve(response);
    });

    request.on("error", reject);
    request.end();
  });

  const location = authResponse.headers.location;
  const redirectLocation = Array.isArray(location) ? location[0] : location;
  if (!redirectLocation) {
    throw new Error("Authorization response did not include a redirect.");
  }

  await new Promise((resolve, reject) => {
    const request = http.request(redirectLocation, { method: "GET" }, (response) => {
      response.resume();
      response.on("end", resolve);
    });

    request.on("error", reject);
    request.end();
  });
}

async function withHttpsFixture(handler, run) {
  const [cert, key] = await Promise.all([
    readFile(certPath, "utf-8"),
    readFile(keyPath, "utf-8"),
  ]);

  const server = https.createServer({ cert, key }, handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to determine HTTPS fixture address.");
  }

  try {
    await run(`https://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
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
    [
      "https://localhost:8443/architectures/calm-1.json",
      "--username",
      "local-user",
    ],
    { stderr, stdout },
  );

  assert.equal(code, 1);
  assert.match(stderr.toString(), /--username is no longer supported/);
  assert.equal(stdout.toString(), "");
});

test("rejects a missing --browser value", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();

  const code = await runCli(
    ["https://localhost:8443/architectures/calm-1.json", "--browser"],
    { stderr, stdout },
  );

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Missing value for --browser\./);
  assert.equal(stdout.toString(), "");
});

test("builds a PKCE authorization URL for the local stack", () => {
  const authUrl = buildAuthorizationUrl(
    "http://127.0.0.1:51004",
    "state-123",
    "challenge-abc",
    LOCAL_STACK_ORIGIN,
  );

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
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli(["https://localhost:8443/architectures/calm-1.json"], {
    browserOpener: async (_authUrl) => {
      throw new Error("browser unavailable");
    },
    stackOrigin: "https://192.168.0.20:8443",
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/192\.168\.0\.20:8443\//);
});

test("accepts configured hostname file URLs", async () => {
  const stdout = createCaptureStream();
  const stderr = createCaptureStream();
  const code = await runCli(["https://my-arch.repo:8443/architectures/calm-1.json"], {
    browserOpener: async () => {
      throw new Error("browser unavailable");
    },
    stackOrigin: "https://my-arch.repo:8443",
    stderr,
    stdout,
  });

  assert.equal(code, 1);
  assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/my-arch\.repo:8443\//);
});

test("prints a manual auth URL when the browser cannot be opened", async () => {
  await withHttpsFixture((request, response) => {
    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${origin}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: async () => {
        throw new Error("browser unavailable");
      },
      stackOrigin: origin,
      stderr,
      stdout,
    });

    assert.equal(code, 1);
    assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), /Unable to open browser automatically\. Open this URL manually:\nhttps:\/\/127\.0\.0\.1:/);
    assert.equal(stdout.toString(), "");
  });
});

test("passes the selected browser app to the opener", async () => {
  await withHttpsFixture((request, response) => {
    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli(
      [`${origin}/architectures/calm-1.json`, "--insecure-localhost", "--browser", "Google Chrome"],
      {
        browserOpener: async (_authUrl, browser) => {
          assert.equal(browser, "Google Chrome");
          throw new Error("browser unavailable");
        },
        stackOrigin: origin,
        stderr,
        stdout,
      },
    );

    assert.equal(code, 1);
    assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), /Unable to open browser automatically\. Open this URL manually:\nhttps:\/\/127\.0\.0\.1:/);
    assert.equal(stdout.toString(), "");
  });
});

test("fails when the callback state does not match", async () => {
  await withHttpsFixture((request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/keycloak/realms/calm-local/protocol/openid-connect/auth")) {
      const requestUrl = new URL(request.url, "https://127.0.0.1");
      const redirectUri = requestUrl.searchParams.get("redirect_uri");

      assert.ok(redirectUri);
      assert.equal(requestUrl.searchParams.get("client_id"), "calm-cli");
      assert.equal(requestUrl.searchParams.get("code_challenge_method"), "S256");

      response.writeHead(302, { location: `${redirectUri}?code=test-code&state=wrong-state` });
      response.end();
      return;
    }

    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${origin}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: async (authUrl) => visitAuthUrl(authUrl, true),
      callbackTimeoutMs: 5_000,
      stackOrigin: origin,
      stderr,
      stdout,
    });

    assert.equal(code, 1);
    assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), /Authentication state did not match the login request\./);
    assert.equal(stdout.toString(), "");
  });
});

test("fetches a protected file after browser login", async () => {
  await withHttpsFixture(async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/keycloak/realms/calm-local/protocol/openid-connect/auth")) {
      const requestUrl = new URL(request.url, "https://127.0.0.1");
      const redirectUri = requestUrl.searchParams.get("redirect_uri");
      const state = requestUrl.searchParams.get("state");

      assert.ok(redirectUri);
      assert.ok(state);
      assert.equal(requestUrl.searchParams.get("client_id"), "calm-cli");
      assert.equal(requestUrl.searchParams.get("code_challenge_method"), "S256");

      response.writeHead(302, { location: `${redirectUri}?code=test-code&state=${state}` });
      response.end();
      return;
    }

    if (request.method === "POST" && request.url === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      const body = await readBody(request);
      const params = new URLSearchParams(body);

      assert.equal(params.get("grant_type"), "authorization_code");
      assert.equal(params.get("client_id"), "calm-cli");
      assert.equal(params.get("code"), "test-code");
      assert.ok(params.get("redirect_uri")?.startsWith("http://127.0.0.1:"));
      assert.ok(params.get("code_verifier"));

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "good-token" }));
      return;
    }

    if (request.method === "GET" && request.url === "/architectures/calm-1.json") {
      assert.equal(request.headers.authorization, "Bearer good-token");
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"name":"calm-1"}');
      return;
    }

    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${origin}/architectures/calm-1.json`, "--insecure-localhost"], {
      browserOpener: async (authUrl) => visitAuthUrl(authUrl, true),
      callbackTimeoutMs: 5_000,
      stackOrigin: origin,
      stderr,
      stdout,
    });

    assert.equal(code, 0);
    assert.equal(stdout.toString(), '{"name":"calm-1"}');
    assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/127\.0\.0\.1:/);
  });
});

test("exits non-zero when the protected file returns a non-2xx status", async () => {
  await withHttpsFixture(async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/keycloak/realms/calm-local/protocol/openid-connect/auth")) {
      const requestUrl = new URL(request.url, "https://127.0.0.1");
      const redirectUri = requestUrl.searchParams.get("redirect_uri");
      const state = requestUrl.searchParams.get("state");

      response.writeHead(302, { location: `${redirectUri}?code=test-code&state=${state}` });
      response.end();
      return;
    }

    if (request.method === "POST" && request.url === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "good-token" }));
      return;
    }

    if (request.method === "GET" && request.url === "/architectures/missing.json") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }

    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const code = await runCli([`${origin}/architectures/missing.json`, "--insecure-localhost"], {
      browserOpener: async (authUrl) => visitAuthUrl(authUrl, true),
      callbackTimeoutMs: 5_000,
      stackOrigin: origin,
      stderr,
      stdout,
    });

    assert.equal(code, 1);
    assert.match(stderr.toString(), /Opening browser for authentication:\nhttps:\/\/127\.0\.0\.1:/);
    assert.match(stderr.toString(), /File request failed with status 404/);
    assert.equal(stdout.toString(), "");
  });
});
