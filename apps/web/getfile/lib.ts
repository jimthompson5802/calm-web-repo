import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";

export const LOCAL_STACK_ORIGIN = "https://localhost:8443";
const AUTHORIZATION_PATH = "/keycloak/realms/calm-local/protocol/openid-connect/auth";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/oauth/callback";
const CALLBACK_TIMEOUT_MS = 120_000;
const CLIENT_ID = "calm-cli";
const TOKEN_PATH = "/keycloak/realms/calm-local/protocol/openid-connect/token";

export type BrowserOpener = (url: string) => Promise<void>;

export type CliOptions = {
  insecureLocalhost: boolean;
  url: URL;
};

type LoopbackCallbackServer = {
  close: () => Promise<void>;
  redirectUri: string;
  waitForCode: Promise<string>;
};

type ResponseData = {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
};

type RunCliOptions = {
  browserOpener?: BrowserOpener;
  callbackTimeoutMs?: number;
  stackOrigin?: string;
  stderr?: WritableLike;
  stdout?: WritableLike;
};

type WritableLike = {
  write: (chunk: string | Buffer) => void;
};

type ParsedArgs =
  | {
      helpRequested: true;
    }
  | CliOptions;

function writeTo(stream: WritableLike, chunk: string | Buffer): void {
  stream.write(chunk);
}

export function usage(): string {
  return [
    "Usage: getfile <url> [--insecure-localhost]",
    "",
    "Fetch a protected CALM file from the local Keycloak-protected stack.",
    "The browser will open for login when authentication is required.",
  ].join("\n");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function createHttpsOriginError(stackOrigin: string): Error {
  return new Error(`Only ${stackOrigin}/... URLs are supported.`);
}

export function parseArgs(argv: string[], stackOrigin = LOCAL_STACK_ORIGIN): ParsedArgs {
  let insecureLocalhost = false;
  let rawUrl: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { helpRequested: true };
    }

    if (arg === "--insecure-localhost") {
      insecureLocalhost = true;
      continue;
    }

    if (arg === "--username" || arg === "--password") {
      throw new Error(`${arg} is no longer supported. getfile now opens a browser for login.`);
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (rawUrl) {
      throw new Error("Only one URL argument is supported.");
    }

    rawUrl = arg;
  }

  if (!rawUrl) {
    throw new Error("A URL argument is required.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== "https:") {
    throw new Error("Only https:// URLs are supported.");
  }

  if (url.origin !== stackOrigin) {
    throw createHttpsOriginError(stackOrigin);
  }

  if (insecureLocalhost && !isLoopbackHost(url.hostname)) {
    throw new Error("--insecure-localhost can only be used with localhost, 127.0.0.1, or ::1 URLs.");
  }

  return {
    insecureLocalhost,
    url,
  };
}

function buildUrl(pathname: string, stackOrigin = LOCAL_STACK_ORIGIN): URL {
  return new URL(pathname, `${stackOrigin}/`);
}

export function buildAuthorizationUrl(
  redirectUri: string,
  state: string,
  codeChallenge: string,
  stackOrigin = LOCAL_STACK_ORIGIN,
): URL {
  const url = buildUrl(AUTHORIZATION_PATH, stackOrigin);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", state);
  return url;
}

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64url");
}

function createPkcePair(): { codeChallenge: string; codeVerifier: string } {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  return { codeChallenge, codeVerifier };
}

function createState(): string {
  return base64UrlEncode(randomBytes(24));
}

function successPage(): string {
  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>getfile login complete</title></head>",
    "<body><p>Authentication complete. You can close this tab.</p></body></html>",
  ].join("");
}

function errorPage(message: string): string {
  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>getfile login failed</title></head>",
    `<body><p>${message}</p></body></html>`,
  ].join("");
}

function sendHtml(response: ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(body, "utf-8").toString(),
    "content-type": "text/html; charset=utf-8",
  });
  response.end(body);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function startLoopbackCallbackServer(
  expectedState: string,
  timeoutMs = CALLBACK_TIMEOUT_MS,
): Promise<LoopbackCallbackServer> {
  let done = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let timeoutId: NodeJS.Timeout | undefined;

  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  void waitForCode.catch(() => {});

  const server = createServer((request, response) => {
    void handleCallbackRequest(request, response);
  });

  const finish = (callback: () => void): void => {
    if (done) {
      return;
    }

    done = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    callback();
    void closeServer(server);
  };

  const fail = (message: string): void => {
    finish(() => {
      rejectCode(new Error(message));
    });
  };

  const succeed = (code: string): void => {
    finish(() => {
      resolveCode(code);
    });
  };

  const handleCallbackRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestUrl = new URL(request.url ?? "/", `http://${CALLBACK_HOST}`);

    if (requestUrl.pathname !== CALLBACK_PATH) {
      sendHtml(response, 404, errorPage("Unknown callback path."));
      return;
    }

    const authError = requestUrl.searchParams.get("error");
    if (authError) {
      const description = requestUrl.searchParams.get("error_description") ?? authError;
      sendHtml(response, 400, errorPage("Authentication failed."));
      fail(`Authentication failed: ${description}`);
      return;
    }

    const state = requestUrl.searchParams.get("state");
    const code = requestUrl.searchParams.get("code");

    if (!state || !code) {
      sendHtml(response, 400, errorPage("Authentication response was incomplete."));
      fail("Authentication response did not include both state and code.");
      return;
    }

    if (state !== expectedState) {
      sendHtml(response, 400, errorPage("Authentication state did not match."));
      fail("Authentication state did not match the login request.");
      return;
    }

    sendHtml(response, 200, successPage());
    succeed(code);
  };

  server.on("error", (error) => {
    fail(`Unable to start authentication callback server: ${error.message}`);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, CALLBACK_HOST);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Unable to determine the authentication callback address.");
  }

  timeoutId = setTimeout(() => {
    fail("Timed out waiting for the browser authentication callback.");
  }, timeoutMs);

  return {
    close: async () => closeServer(server),
    redirectUri: `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`,
    waitForCode,
  };
}

function browserLaunchArgs(url: string): { args: string[]; command: string } {
  if (process.platform === "darwin") {
    return { args: [url], command: "open" };
  }

  if (process.platform === "win32") {
    return { args: ["/c", "start", "", url], command: "cmd" };
  }

  return { args: [url], command: "xdg-open" };
}

export async function openBrowser(url: string): Promise<void> {
  const launch = browserLaunchArgs(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, { stdio: "ignore" });

    child.on("error", () => {
      reject(new Error(`Unable to open browser automatically. Open this URL manually:\n${url}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Unable to open browser automatically. Open this URL manually:\n${url}`));
    });
  });
}

function requestBuffer(
  url: URL,
  options: {
    body?: string;
    headers?: Record<string, string>;
    insecureLocalhost: boolean;
    method: string;
  },
): Promise<ResponseData> {
  const requestOptions: HttpsRequestOptions = {
    headers: options.headers ?? {},
    hostname: url.hostname,
    method: options.method,
    path: `${url.pathname}${url.search}`,
    port: url.port ? Number(url.port) : undefined,
    rejectUnauthorized: !options.insecureLocalhost,
  };

  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, requestOptions, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks),
          headers: response.headers,
          statusCode: response.statusCode ?? 0,
        });
      });
      response.on("error", reject);
    });

    request.on("error", reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

function describeResponseFailure(prefix: string, response: ResponseData): string {
  const location = response.headers.location;
  const redirectLocation = Array.isArray(location) ? location[0] : location;
  const bodyText = response.body.toString("utf-8").trim();
  const detail = bodyText ? `: ${bodyText}` : "";

  if (redirectLocation) {
    return `${prefix} with status ${response.statusCode} and redirect to ${redirectLocation}`;
  }

  return `${prefix} with status ${response.statusCode}${detail}`;
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  insecureLocalhost: boolean,
  stackOrigin = LOCAL_STACK_ORIGIN,
): Promise<string> {
  const tokenUrl = buildUrl(TOKEN_PATH, stackOrigin);
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }).toString();

  const response = await requestBuffer(tokenUrl, {
    body,
    headers: {
      "accept": "application/json",
      "content-length": Buffer.byteLength(body, "utf-8").toString(),
      "content-type": "application/x-www-form-urlencoded",
    },
    insecureLocalhost,
    method: "POST",
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(describeResponseFailure("Token request failed", response));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.body.toString("utf-8"));
  } catch {
    throw new Error("Token response was not valid JSON.");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("access_token" in payload) ||
    typeof payload.access_token !== "string" ||
    payload.access_token.length === 0
  ) {
    throw new Error("Token response did not include an access_token.");
  }

  return payload.access_token;
}

async function authenticateViaBrowser(options: CliOptions, runtime: RunCliOptions): Promise<string> {
  const stackOrigin = runtime.stackOrigin ?? LOCAL_STACK_ORIGIN;
  const opener = runtime.browserOpener ?? openBrowser;
  const state = createState();
  const pkce = createPkcePair();
  const callbackServer = await startLoopbackCallbackServer(state, runtime.callbackTimeoutMs);
  const authorizationUrl = buildAuthorizationUrl(
    callbackServer.redirectUri,
    state,
    pkce.codeChallenge,
    stackOrigin,
  );

  try {
    await opener(authorizationUrl.toString());
  } catch {
    await callbackServer.close();
    throw new Error(`Unable to open browser automatically. Open this URL manually:\n${authorizationUrl}`);
  }

  try {
    const code = await callbackServer.waitForCode;
    return await exchangeAuthorizationCode(
      code,
      pkce.codeVerifier,
      callbackServer.redirectUri,
      options.insecureLocalhost,
      stackOrigin,
    );
  } finally {
    await callbackServer.close();
  }
}

async function fetchProtectedFile(options: CliOptions, token: string): Promise<Buffer> {
  const response = await requestBuffer(options.url, {
    headers: {
      "authorization": `Bearer ${token}`,
    },
    insecureLocalhost: options.insecureLocalhost,
    method: "GET",
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(describeResponseFailure("File request failed", response));
  }

  return response.body;
}

export async function runCli(argv: string[], runtime: RunCliOptions = {}): Promise<number> {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;

  try {
    const parsed = parseArgs(argv, runtime.stackOrigin);
    if ("helpRequested" in parsed) {
      writeTo(stdout, `${usage()}\n`);
      return 0;
    }

    const token = await authenticateViaBrowser(parsed, runtime);
    const body = await fetchProtectedFile(parsed, token);
    writeTo(stdout, body);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeTo(stderr, `${message}\n`);
    writeTo(stderr, `${usage()}\n`);
    return 1;
  }
}
