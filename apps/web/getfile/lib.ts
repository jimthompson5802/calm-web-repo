import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACCESS_TOKEN_REFRESH_EARLY_MS = 60_000;
const AUTHORIZATION_PATH = "/keycloak/realms/calm-local/protocol/openid-connect/auth";
const CACHE_DIR_NAME = ".calm";
const CACHE_FILE_NAME = "getfile-token.json";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/";
const CALLBACK_TIMEOUT_MS = 120_000;
const CLIENT_ID = "calm-cli";
const DEFAULT_ACCESS_TOKEN_TTL_MS = 300_000;
const LOCALHOST_ORIGIN = "https://localhost:8443";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const STACK_ORIGIN_FILE = path.join(REPO_ROOT, "infra", "keycloak", "import", "stack-origin.txt");
const TOKEN_PATH = "/keycloak/realms/calm-local/protocol/openid-connect/token";

export const LOCAL_STACK_ORIGIN = getConfiguredStackOrigin();

export type BrowserOpener = (url: string, browser?: string) => Promise<void>;

export type CliOptions = {
  browser?: string;
  insecureLocalhost: boolean;
  url: URL;
};

type CachedSession = {
  accessToken: string;
  expiresAtEpochMs: number;
  refreshExpiresAtEpochMs?: number;
  refreshToken?: string;
  tokenType?: string;
};

type LoopbackCallbackServer = {
  close: () => Promise<void>;
  redirectUri: string;
  waitForCode: Promise<string>;
};

type ParsedArgs =
  | {
      helpRequested: true;
    }
  | CliOptions;

type ResponseData = {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
};

type RequestBuffer = (
  url: URL,
  options: {
    body?: string;
    headers?: Record<string, string>;
    insecureLocalhost: boolean;
    method: string;
  },
) => Promise<ResponseData>;

type RunCliOptions = {
  browserOpener?: BrowserOpener;
  cacheFilePath?: string;
  callbackServerFactory?: (expectedState: string, timeoutMs?: number) => Promise<LoopbackCallbackServer>;
  callbackTimeoutMs?: number;
  nowMs?: () => number;
  requestBufferImpl?: RequestBuffer;
  stackOrigin?: string;
  stderr?: WritableLike;
  stdout?: WritableLike;
};

type SessionSource = "browser" | "cache" | "refresh";

type TokenResponse = {
  access_token: string;
  expires_in?: unknown;
  refresh_expires_in?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
};

type WritableLike = {
  write: (chunk: string | Buffer) => void;
};

class HttpResponseError extends Error {
  readonly statusCode: number;

  constructor(prefix: string, response: ResponseData) {
    super(describeResponseFailure(prefix, response));
    this.name = "HttpResponseError";
    this.statusCode = response.statusCode;
  }
}

function writeTo(stream: WritableLike, chunk: string | Buffer): void {
  stream.write(chunk);
}

function authLogStream(runtime: RunCliOptions): WritableLike {
  return runtime.stderr ?? process.stderr;
}

function logAuthEvent(runtime: RunCliOptions, message: string): void {
  writeTo(authLogStream(runtime), `>>> ${message}\n`);
}

function secondsUntilExpiry(expiresAtEpochMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtEpochMs - nowMs) / 1000));
}

export function usage(): string {
  return [
    "Usage: getfile <url> [--browser <app>] [--insecure-localhost]",
    "",
    "Fetch a protected CALM file from the local Keycloak-protected stack.",
    "The browser will open for login when authentication is required.",
  ].join("\n");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getConfiguredStackOrigin(): string {
  const configuredOrigin = process.env.CALM_PUBLIC_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const configuredHost = process.env.CALM_PUBLIC_HOST?.trim();
  if (configuredHost) {
    return `https://${configuredHost}:8443`;
  }

  if (existsSync(STACK_ORIGIN_FILE)) {
    const fileValue = readFileSync(STACK_ORIGIN_FILE, "utf-8").trim();
    if (fileValue) {
      return fileValue;
    }
  }

  return LOCALHOST_ORIGIN;
}

function allowedOrigins(stackOrigin: string): string[] {
  return stackOrigin === LOCALHOST_ORIGIN ? [LOCALHOST_ORIGIN] : [LOCALHOST_ORIGIN, stackOrigin];
}

function createHttpsOriginError(stackOrigin: string): Error {
  const origins = allowedOrigins(stackOrigin).map((origin) => `${origin}/...`);
  return origins.length === 1
    ? new Error(`Only ${origins[0]} URLs are supported.`)
    : new Error(`Only ${origins[0]} or ${origins[1]} URLs are supported.`);
}

export function parseArgs(argv: string[], stackOrigin = LOCAL_STACK_ORIGIN): ParsedArgs {
  let browser: string | undefined;
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

    if (arg === "--browser") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --browser.");
      }

      browser = value;
      index += 1;
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

  if (!allowedOrigins(stackOrigin).includes(url.origin)) {
    throw createHttpsOriginError(stackOrigin);
  }

  const stackHost = new URL(stackOrigin).hostname;
  if (insecureLocalhost && !isLoopbackHost(url.hostname) && url.hostname !== stackHost) {
    throw new Error(
      "--insecure-localhost can only be used with localhost, 127.0.0.1, ::1, or the configured local stack host.",
    );
  }

  return {
    browser,
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
    redirectUri: `http://${CALLBACK_HOST}:${address.port}`,
    waitForCode,
  };
}

function browserLaunchArgs(url: string, browser?: string): { args: string[]; command: string } {
  if (process.platform === "darwin") {
    return browser
      ? { args: ["-a", browser, url], command: "open" }
      : { args: [url], command: "open" };
  }

  if (process.platform === "win32") {
    return browser
      ? { args: ["/c", "start", "", browser, url], command: "cmd" }
      : { args: ["/c", "start", "", url], command: "cmd" };
  }

  return browser ? { args: [url], command: browser } : { args: [url], command: "xdg-open" };
}

export async function openBrowser(url: string, browser?: string): Promise<void> {
  const launch = browserLaunchArgs(url, browser);

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

function getRequestBuffer(runtime: RunCliOptions): RequestBuffer {
  return runtime.requestBufferImpl ?? requestBuffer;
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

function getNowMs(runtime: RunCliOptions): number {
  return runtime.nowMs ? runtime.nowMs() : Date.now();
}

function getCacheFilePath(runtime: RunCliOptions): string {
  if (runtime.cacheFilePath) {
    return runtime.cacheFilePath;
  }

  return path.join(homedir(), CACHE_DIR_NAME, CACHE_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function tryReadJwtExpiryEpochMs(token: string): number | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) {
      return undefined;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function resolveAccessTokenExpiryEpochMs(accessToken: string, expiresIn: unknown, nowMs: number): number {
  const expiresInSeconds = readPositiveNumber(expiresIn);
  if (expiresInSeconds) {
    return nowMs + expiresInSeconds * 1000;
  }

  const jwtExpiry = tryReadJwtExpiryEpochMs(accessToken);
  if (jwtExpiry) {
    return jwtExpiry;
  }

  return nowMs + DEFAULT_ACCESS_TOKEN_TTL_MS;
}

function normalizeTokenResponse(
  payload: unknown,
  nowMs: number,
  previousSession?: CachedSession,
): CachedSession {
  if (!isRecord(payload)) {
    throw new Error("Token response did not include an access_token.");
  }

  const accessToken = readNonEmptyString(payload.access_token);
  if (!accessToken) {
    throw new Error("Token response did not include an access_token.");
  }

  const refreshToken = readNonEmptyString(payload.refresh_token) ?? previousSession?.refreshToken;
  const tokenType = readNonEmptyString(payload.token_type) ?? previousSession?.tokenType;
  const refreshExpiresAtEpochMs = hasOwn(payload, "refresh_expires_in")
    ? readPositiveNumber(payload.refresh_expires_in)
      ? nowMs + Number(payload.refresh_expires_in) * 1000
      : undefined
    : previousSession?.refreshExpiresAtEpochMs;

  return {
    accessToken,
    expiresAtEpochMs: resolveAccessTokenExpiryEpochMs(accessToken, payload.expires_in, nowMs),
    ...(refreshExpiresAtEpochMs ? { refreshExpiresAtEpochMs } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(tokenType ? { tokenType } : {}),
  };
}

function normalizeCachedSession(value: unknown): CachedSession | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const accessToken = readNonEmptyString(value.accessToken);
  const expiresAtEpochMs = readPositiveNumber(value.expiresAtEpochMs);
  if (!accessToken || !expiresAtEpochMs) {
    return undefined;
  }

  const refreshExpiresAtEpochMs = readPositiveNumber(value.refreshExpiresAtEpochMs);
  const refreshToken = readNonEmptyString(value.refreshToken);
  const tokenType = readNonEmptyString(value.tokenType);

  return {
    accessToken,
    expiresAtEpochMs,
    ...(refreshExpiresAtEpochMs ? { refreshExpiresAtEpochMs } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(tokenType ? { tokenType } : {}),
  };
}

async function maybeChmod(targetPath: string, mode: number): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  try {
    await chmod(targetPath, mode);
  } catch {
    // Best-effort on local developer machines.
  }
}

async function readCacheEntries(runtime: RunCliOptions): Promise<Record<string, CachedSession>> {
  const cacheFilePath = getCacheFilePath(runtime);

  let raw: string;
  try {
    raw = await readFile(cacheFilePath, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logAuthEvent(runtime, `No cache file found at ${cacheFilePath}`);
      return {};
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logAuthEvent(runtime, `Cache file at ${cacheFilePath} is invalid JSON; ignoring cached sessions`);
    return {};
  }

  if (!isRecord(parsed)) {
    logAuthEvent(runtime, `Cache file at ${cacheFilePath} has an unexpected structure; ignoring cached sessions`);
    return {};
  }

  const entries: Record<string, CachedSession> = {};
  for (const [stackOrigin, value] of Object.entries(parsed)) {
    const session = normalizeCachedSession(value);
    if (session) {
      entries[stackOrigin] = session;
    }
  }

  return entries;
}

async function writeCacheEntries(entries: Record<string, CachedSession>, runtime: RunCliOptions): Promise<void> {
  const cacheFilePath = getCacheFilePath(runtime);
  const cacheDir = path.dirname(cacheFilePath);

  await mkdir(cacheDir, { recursive: true });
  await maybeChmod(cacheDir, 0o700);

  await writeFile(cacheFilePath, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  await maybeChmod(cacheFilePath, 0o600);
}

async function loadCachedSession(stackOrigin: string, runtime: RunCliOptions): Promise<CachedSession | undefined> {
  const entries = await readCacheEntries(runtime);
  return entries[stackOrigin];
}

async function saveCachedSession(stackOrigin: string, session: CachedSession, runtime: RunCliOptions): Promise<void> {
  const entries = await readCacheEntries(runtime);
  entries[stackOrigin] = session;
  await writeCacheEntries(entries, runtime);
}

async function deleteCachedSession(stackOrigin: string, runtime: RunCliOptions): Promise<void> {
  const entries = await readCacheEntries(runtime);
  if (!(stackOrigin in entries)) {
    return;
  }

  delete entries[stackOrigin];
  await writeCacheEntries(entries, runtime);
}

function isAccessTokenUsable(
  session: CachedSession,
  nowMs: number,
  refreshEarlyMs = ACCESS_TOKEN_REFRESH_EARLY_MS,
): boolean {
  return nowMs + refreshEarlyMs < session.expiresAtEpochMs;
}

function canAttemptRefresh(session: CachedSession, nowMs: number): boolean {
  if (!session.refreshToken) {
    return false;
  }

  return session.refreshExpiresAtEpochMs === undefined || nowMs < session.refreshExpiresAtEpochMs;
}

async function requestToken(
  bodyParams: URLSearchParams,
  insecureLocalhost: boolean,
  stackOrigin: string,
  runtime: RunCliOptions,
  previousSession?: CachedSession,
): Promise<CachedSession> {
  const body = bodyParams.toString();
  const tokenUrl = buildUrl(TOKEN_PATH, stackOrigin);
  const response = await getRequestBuffer(runtime)(tokenUrl, {
    body,
    headers: {
      accept: "application/json",
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
    payload = JSON.parse(response.body.toString("utf-8")) as TokenResponse;
  } catch {
    throw new Error("Token response was not valid JSON.");
  }

  return normalizeTokenResponse(payload, getNowMs(runtime), previousSession);
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  insecureLocalhost: boolean,
  runtime: RunCliOptions,
  stackOrigin = LOCAL_STACK_ORIGIN,
): Promise<CachedSession> {
  logAuthEvent(runtime, "Exchanging authorization code for tokens");
  const session = await requestToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    insecureLocalhost,
    stackOrigin,
    runtime,
  );
  logAuthEvent(
    runtime,
    `Authorization code exchange succeeded; access token expires in ${secondsUntilExpiry(
      session.expiresAtEpochMs,
      getNowMs(runtime),
    )}s`,
  );
  return session;
}

async function refreshAccessToken(
  session: CachedSession,
  insecureLocalhost: boolean,
  runtime: RunCliOptions,
  stackOrigin = LOCAL_STACK_ORIGIN,
): Promise<CachedSession> {
  logAuthEvent(runtime, "Refreshing access token with refresh_token grant");
  const refreshedSession = await requestToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken ?? "",
    }),
    insecureLocalhost,
    stackOrigin,
    runtime,
    session,
  );
  logAuthEvent(
    runtime,
    `Refresh succeeded; access token expires in ${secondsUntilExpiry(
      refreshedSession.expiresAtEpochMs,
      getNowMs(runtime),
    )}s`,
  );
  return refreshedSession;
}

async function authenticateViaBrowser(options: CliOptions, runtime: RunCliOptions): Promise<CachedSession> {
  const callbackServerFactory = runtime.callbackServerFactory ?? startLoopbackCallbackServer;
  const stackOrigin = runtime.stackOrigin ?? LOCAL_STACK_ORIGIN;
  const opener = runtime.browserOpener ?? openBrowser;
  const state = createState();
  const pkce = createPkcePair();
  logAuthEvent(runtime, `Starting browser PKCE authentication for ${stackOrigin}`);
  const callbackServer = await callbackServerFactory(state, runtime.callbackTimeoutMs);
  const authorizationUrl = buildAuthorizationUrl(
    callbackServer.redirectUri,
    state,
    pkce.codeChallenge,
    stackOrigin,
  );
  logAuthEvent(runtime, `Opening browser for authentication: ${authorizationUrl}`);

  try {
    await opener(authorizationUrl.toString(), options.browser);
  } catch {
    await callbackServer.close();
    throw new Error(`Unable to open browser automatically. Open this URL manually:\n${authorizationUrl}`);
  }

  try {
    const code = await callbackServer.waitForCode;
    logAuthEvent(runtime, "Received authorization callback code");
    return await exchangeAuthorizationCode(
      code,
      pkce.codeVerifier,
      callbackServer.redirectUri,
      options.insecureLocalhost,
      runtime,
      stackOrigin,
    );
  } finally {
    await callbackServer.close();
  }
}

async function acquireSession(
  options: CliOptions,
  runtime: RunCliOptions,
): Promise<{ session: CachedSession; source: SessionSource }> {
  const stackOrigin = runtime.stackOrigin ?? LOCAL_STACK_ORIGIN;
  const nowMs = getNowMs(runtime);
  logAuthEvent(runtime, `Starting token session acquisition for ${options.url.origin}${options.url.pathname}`);
  logAuthEvent(runtime, `Checking token cache at ${getCacheFilePath(runtime)} for ${stackOrigin}`);
  const cachedSession = await loadCachedSession(stackOrigin, runtime);

  if (cachedSession && isAccessTokenUsable(cachedSession, nowMs)) {
    logAuthEvent(
      runtime,
      `Using cached access token; expires in ${secondsUntilExpiry(cachedSession.expiresAtEpochMs, nowMs)}s`,
    );
    return { session: cachedSession, source: "cache" };
  }

  if (!cachedSession) {
    logAuthEvent(runtime, `No cached session entry found for ${stackOrigin}`);
  } else {
    logAuthEvent(
      runtime,
      `Cached access token expired or near expiry; expires in ${secondsUntilExpiry(cachedSession.expiresAtEpochMs, nowMs)}s`,
    );
  }

  if (cachedSession && canAttemptRefresh(cachedSession, nowMs)) {
    logAuthEvent(runtime, "Refresh token is usable; attempting silent refresh");
    try {
      const refreshedSession = await refreshAccessToken(cachedSession, options.insecureLocalhost, runtime, stackOrigin);
      await saveCachedSession(stackOrigin, refreshedSession, runtime);
      logAuthEvent(runtime, `Saved refreshed session to cache at ${getCacheFilePath(runtime)}`);
      return { session: refreshedSession, source: "refresh" };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logAuthEvent(runtime, `Refresh failed; clearing cached session and falling back to browser authentication (${message})`);
      try {
        await deleteCachedSession(stackOrigin, runtime);
        logAuthEvent(runtime, `Cleared cached session for ${stackOrigin}`);
      } catch {
        // Ignore cache cleanup failures and fall back to the browser flow.
      }
    }
  } else if (cachedSession) {
    logAuthEvent(runtime, "Refresh token is unavailable or expired; starting browser authentication");
  }

  const browserSession = await authenticateViaBrowser(options, runtime);
  await saveCachedSession(stackOrigin, browserSession, runtime);
  logAuthEvent(runtime, `Saved browser-authenticated session to cache at ${getCacheFilePath(runtime)}`);
  return { session: browserSession, source: "browser" };
}

async function fetchProtectedFile(options: CliOptions, runtime: RunCliOptions, token: string): Promise<Buffer> {
  const response = await getRequestBuffer(runtime)(options.url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    insecureLocalhost: options.insecureLocalhost,
    method: "GET",
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpResponseError("File request failed", response);
  }

  return response.body;
}

function shouldRetryViaBrowser(error: unknown, source: SessionSource): boolean {
  return error instanceof HttpResponseError && source !== "browser" && (error.statusCode === 401 || error.statusCode === 403);
}

export async function runCli(argv: string[], runtime: RunCliOptions = {}): Promise<number> {
  const stdout = runtime.stdout ?? process.stdout;
  const stderr = runtime.stderr ?? process.stderr;
  const stackOrigin = runtime.stackOrigin ?? LOCAL_STACK_ORIGIN;

  try {
    const parsed = parseArgs(argv, stackOrigin);
    if ("helpRequested" in parsed) {
      writeTo(stdout, `${usage()}\n`);
      return 0;
    }

    const initialSession = await acquireSession(parsed, runtime);

    try {
      logAuthEvent(runtime, `Fetching protected file using ${initialSession.source} session`);
      const body = await fetchProtectedFile(parsed, runtime, initialSession.session.accessToken);
      writeTo(stdout, body);
      return 0;
    } catch (error: unknown) {
      if (!shouldRetryViaBrowser(error, initialSession.source)) {
        throw error;
      }

      const statusCode = error instanceof HttpResponseError ? error.statusCode : "unknown";
      logAuthEvent(runtime, `Received ${statusCode}; clearing cached session and retrying with browser authentication`);
      try {
        await deleteCachedSession(stackOrigin, runtime);
        logAuthEvent(runtime, `Cleared cached session for ${stackOrigin}`);
      } catch {
        // Ignore cache cleanup failures and continue the recovery login.
      }

      logAuthEvent(runtime, `Starting browser re-authentication after ${statusCode}`);
      const browserSession = await authenticateViaBrowser(parsed, runtime);
      await saveCachedSession(stackOrigin, browserSession, runtime);
      logAuthEvent(runtime, `Browser re-authentication succeeded; saved session to cache at ${getCacheFilePath(runtime)}`);
      logAuthEvent(runtime, "Fetching protected file using browser session after retry");
      const body = await fetchProtectedFile(parsed, runtime, browserSession.accessToken);
      writeTo(stdout, body);
      return 0;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    writeTo(stderr, `${message}\n`);
    writeTo(stderr, `${usage()}\n`);
    return 1;
  }
}
