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

export default class DirectUrlAuthPlugin {
    private readonly configPromise: Promise<LoadedAuthConfig>;
    private cachedToken?: CachedToken;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('configPath is required');
        }

        this.configPromise = readFile(configPath, 'utf8').then(async (text: string) => {
            const config = JSON.parse(text) as AuthConfig;
            if (!config.caCertPath) {
                return config;
            }

            const certPath = isAbsolute(config.caCertPath)
                ? config.caCertPath
                : resolve(dirname(configPath), config.caCertPath);

            return {
                ...config,
                caCert: await readFile(certPath, 'utf8'),
            };
        });
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
            throw new Error('No access_token in token response');
        }

        const expiresInSeconds = tokenResponse.expires_in ?? 300;
        this.cachedToken = {
            accessToken: tokenResponse.access_token,
            expiresAtEpochMs: Date.now() + (expiresInSeconds * 1000)
        };

        return this.cachedToken.accessToken;
    }

    private async requestToken(config: LoadedAuthConfig, body: URLSearchParams): Promise<TokenResponse> {
        const tokenUrl = new URL(config.tokenUrl);
        const requestBody = body.toString();
        const transport = tokenUrl.protocol === 'https:' ? https : http;

        if (tokenUrl.protocol !== 'https:' && tokenUrl.protocol !== 'http:') {
            throw new Error(`Unsupported token URL protocol: ${tokenUrl.protocol}`);
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
                        rejectPromise(new Error(`Token request failed: ${response.statusCode ?? 'unknown'} ${response.statusMessage ?? ''}`.trim()));
                        return;
                    }

                    try {
                        resolvePromise(JSON.parse(responseBody) as TokenResponse);
                    } catch (error) {
                        rejectPromise(error);
                    }
                });
            });

            request.on('error', (error) => {
                rejectPromise(new Error(`Token request failed: ${error.message}`));
            });
            request.write(requestBody);
            request.end();
        });
    }
}
