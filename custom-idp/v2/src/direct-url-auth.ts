import * as http from 'node:http';
import * as https from 'node:https';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

type AuthConfig = {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    caCertPath?: string;
};

type LoadedAuthConfig = AuthConfig & {
    caCert?: string;
};

type TokenResponse = {
    access_token?: string;
    expires_in?: number;
};

type CachedToken = {
    accessToken: string;
    expiresAtEpochMs: number;
};

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class DirectUrlAuthPlugin {
    private readonly configPromise: Promise<LoadedAuthConfig>;
    private cachedToken?: CachedToken;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('Direct URL auth configPath is required');
        }

        this.configPromise = this.loadConfig(configPath);
    }

    async getAuthHeaders(_url: string, _requestBody: unknown): Promise<Record<string, string>> {
        return {
            Authorization: `Bearer ${await this.getAccessToken()}`
        };
    }

    async getTlsConfig(): Promise<{ httpsCaCert?: string }> {
        const config = await this.configPromise;
        return {
            httpsCaCert: config.caCert,
        };
    }

    private async getAccessToken(): Promise<string> {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAtEpochMs - 60_000) {
            return this.cachedToken.accessToken;
        }

        const config = await this.configPromise;
        const body = new URLSearchParams();
        body.set('client_id', config.clientId);
        body.set('client_secret', config.clientSecret);
        body.set('grant_type', 'client_credentials');

        const tokenResponse = await this.requestToken(config, body);

        if (!tokenResponse.access_token) {
            throw new Error(`Direct URL auth token response from ${config.tokenUrl} did not include access_token`);
        }

        const expiresInSeconds = tokenResponse.expires_in ?? 300;
        this.cachedToken = {
            accessToken: tokenResponse.access_token,
            expiresAtEpochMs: Date.now() + (expiresInSeconds * 1000)
        };

        return this.cachedToken.accessToken;
    }

    private async loadConfig(configPath: string): Promise<LoadedAuthConfig> {
        let text: string;
        try {
            text = await readFile(configPath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read direct URL auth config at ${configPath}: ${getErrorMessage(error)}`);
        }

        let config: AuthConfig;
        try {
            config = JSON.parse(text) as AuthConfig;
        } catch (error) {
            throw new Error(`Failed to parse direct URL auth config at ${configPath}: ${getErrorMessage(error)}`);
        }

        if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
            throw new Error(`Direct URL auth config at ${configPath} must include tokenUrl, clientId, and clientSecret`);
        }

        if (!config.caCertPath) {
            return config;
        }

        const certPath = isAbsolute(config.caCertPath)
            ? config.caCertPath
            : resolve(dirname(configPath), config.caCertPath);

        try {
            return {
                ...config,
                caCert: await readFile(certPath, 'utf8'),
            };
        } catch (error) {
            throw new Error(`Failed to read direct URL auth CA certificate at ${certPath}: ${getErrorMessage(error)}`);
        }
    }

    private getTokenEndpoint(config: LoadedAuthConfig): URL {
        try {
            return new URL(config.tokenUrl);
        } catch (error) {
            throw new Error(`Invalid direct URL auth tokenUrl '${config.tokenUrl}': ${getErrorMessage(error)}`);
        }
    }

    private async requestToken(config: LoadedAuthConfig, body: URLSearchParams): Promise<TokenResponse> {
        const tokenUrl = this.getTokenEndpoint(config);
        const requestBody = body.toString();
        const transport = tokenUrl.protocol === 'https:' ? https : http;

        if (tokenUrl.protocol !== 'https:' && tokenUrl.protocol !== 'http:') {
            throw new Error(`Direct URL auth token URL must use http or https: ${tokenUrl.protocol}`);
        }

        return await new Promise<TokenResponse>((resolvePromise, rejectPromise) => {
            const request = transport.request(tokenUrl, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/x-www-form-urlencoded',
                    'content-length': Buffer.byteLength(requestBody).toString(),
                },
                ca: tokenUrl.protocol === 'https:' ? config.caCert : undefined,
            }, (response) => {
                let responseBody = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    responseBody += chunk;
                });
                response.on('end', () => {
                    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                        rejectPromise(new Error(`Direct URL auth token request to ${config.tokenUrl} failed: ${response.statusCode ?? 'unknown'} ${response.statusMessage ?? ''}`.trim()));
                        return;
                    }

                    try {
                        resolvePromise(JSON.parse(responseBody) as TokenResponse);
                    } catch (error) {
                        rejectPromise(new Error(`Direct URL auth token response from ${config.tokenUrl} was not valid JSON: ${getErrorMessage(error)}`));
                    }
                });
            });

            request.on('error', (error) => {
                rejectPromise(new Error(`Direct URL auth token request to ${config.tokenUrl} failed: ${error.message}`));
            });
            request.write(requestBody);
            request.end();
        });
    }
}
