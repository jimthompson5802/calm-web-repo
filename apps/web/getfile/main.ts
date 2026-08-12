import { request as httpRequest, type RequestOptions as HttpRequestOptions } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";
import { Buffer } from "node:buffer";

const CLIENT_ID = "calm-cli";
const TOKEN_PATH = "/keycloak/realms/calm-local/protocol/openid-connect/token";

type CliOptions = {
  insecureLocalhost: boolean;
  password: string;
  url: URL;
  username: string;
};

type ResponseData = {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  statusCode: number;
};

function usage(): string {
  return [
    "Usage: getfile <url> --username <value> --password <value> [--insecure-localhost]",
    "",
    "Fetch a protected CALM file and write its contents to stdout.",
  ].join("\n");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parseArgs(argv: string[]): CliOptions {
  let insecureLocalhost = false;
  let password: string | undefined;
  let rawUrl: string | undefined;
  let username: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }

    if (arg === "--insecure-localhost") {
      insecureLocalhost = true;
      continue;
    }

    if (arg === "--username" || arg === "--password") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}.`);
      }

      if (arg === "--username") {
        username = value;
      } else {
        password = value;
      }

      index += 1;
      continue;
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

  if (!username) {
    throw new Error("Missing required --username option.");
  }

  if (!password) {
    throw new Error("Missing required --password option.");
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

  if (insecureLocalhost && !isLoopbackHost(url.hostname)) {
    throw new Error("--insecure-localhost can only be used with localhost, 127.0.0.1, or ::1 URLs.");
  }

  return {
    insecureLocalhost,
    password,
    url,
    username,
  };
}

function buildTokenUrl(resourceUrl: URL): URL {
  return new URL(TOKEN_PATH, resourceUrl.origin);
}

function isHttps(url: URL): boolean {
  return url.protocol === "https:";
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
  const headers = options.headers ?? {};
  const requestOptions: HttpRequestOptions | HttpsRequestOptions = {
    headers,
    hostname: url.hostname,
    method: options.method,
    path: `${url.pathname}${url.search}`,
    port: url.port ? Number(url.port) : undefined,
  };

  if (isHttps(url)) {
    (requestOptions as HttpsRequestOptions).rejectUnauthorized = !options.insecureLocalhost;
  }

  const caller = isHttps(url) ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = caller(url, requestOptions, (response) => {
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

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
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

async function getAccessToken(options: CliOptions): Promise<string> {
  const tokenUrl = buildTokenUrl(options.url);
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "password",
    password: options.password,
    username: options.username,
  }).toString();

  const response = await requestBuffer(tokenUrl, {
    body,
    headers: {
      "accept": "application/json",
      "content-length": Buffer.byteLength(body, "utf-8").toString(),
      "content-type": "application/x-www-form-urlencoded",
    },
    insecureLocalhost: options.insecureLocalhost,
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

async function fetchFile(options: CliOptions, token: string): Promise<void> {
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

  process.stdout.write(response.body);
}

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  const token = await getAccessToken(options);
  await fetchFile(options, token);
  return 0;
}

void main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  },
);
