import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import https from "node:https";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.resolve(webRoot, "getfile", "dist", "main.js");
const certPath = path.resolve(__dirname, "fixtures", "localhost-cert.pem");
const keyPath = path.resolve(__dirname, "fixtures", "localhost-key.pem");

function runCli(args) {
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
  const result = await runCli([]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Usage: getfile/);
  assert.equal(result.stdout, "");
});

test("rejects --insecure-localhost for non-local URLs before making requests", async () => {
  const result = await runCli([
    "https://example.com/architectures/calm-1.json",
    "--username",
    "local-user",
    "--password",
    "secret",
    "--insecure-localhost",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--insecure-localhost can only be used/);
  assert.equal(result.stdout, "");
});

test("rejects plain HTTP localhost URLs", async () => {
  const result = await runCli([
    "http://localhost:8443/architectures/calm-1.json",
    "--username",
    "local-user",
    "--password",
    "secret",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Only https:\/\/ URLs are supported\./);
  assert.equal(result.stdout, "");
});

test("rejects plain HTTP remote URLs", async () => {
  const result = await runCli([
    "http://example.com/architectures/calm-1.json",
    "--username",
    "local-user",
    "--password",
    "secret",
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Only https:\/\/ URLs are supported\./);
  assert.equal(result.stdout, "");
});

test("fails cleanly when the token request is rejected", async () => {
  await withHttpsFixture((request, response) => {
    if (request.method === "POST" && request.url === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_grant" }));
      return;
    }

    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const result = await runCli([
      `${origin}/architectures/calm-1.json`,
      "--username",
      "local-user",
      "--password",
      "wrong-password",
      "--insecure-localhost",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Token request failed with status 401/);
    assert.equal(result.stdout, "");
  });
});

test("fetches a protected file and writes it to stdout", async () => {
  await withHttpsFixture((request, response) => {
    if (request.method === "POST" && request.url === "/keycloak/realms/calm-local/protocol/openid-connect/token") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ access_token: "good-token" }));
      return;
    }

    if (request.method === "GET" && request.url === "/architectures/calm-1.json") {
      if (request.headers.authorization !== "Bearer good-token") {
        response.writeHead(302, { location: "/oauth2/sign_in" });
        response.end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"name":"calm-1"}');
      return;
    }

    response.writeHead(404);
    response.end();
  }, async (origin) => {
    const result = await runCli([
      `${origin}/architectures/calm-1.json`,
      "--username",
      "local-user",
      "--password",
      "correct-password",
      "--insecure-localhost",
    ]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '{"name":"calm-1"}');
    assert.equal(result.stderr, "");
  });
});

test("exits non-zero when the protected file returns a non-2xx status", async () => {
  await withHttpsFixture((request, response) => {
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
    const result = await runCli([
      `${origin}/architectures/missing.json`,
      "--username",
      "local-user",
      "--password",
      "correct-password",
      "--insecure-localhost",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /File request failed with status 404/);
    assert.equal(result.stdout, "");
  });
});
