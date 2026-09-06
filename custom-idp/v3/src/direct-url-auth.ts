import * as http from 'node:http';
import * as https from 'node:https';
import { readFile } from 'node:fs/promises';

type AuthConfig = {
    tokenUrl: string;
    clientId: string;
    vaultUrl: string;
    vaultToken: string;
    vaultSecretPath: string;
    vaultSecretField?: string;
};

type TokenResponse = {
    access_token?: string;
    expires_in?: number;
};

type VaultSecretResponse = {
    data?: {
        data?: Record<string, unknown>;
    };
};

type CachedToken = {
    accessToken: string;
    expiresAtEpochMs: number;
};

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class DirectUrlAuthPlugin {
    private readonly configPath: string;
    private configPromise?: Promise<AuthConfig>;
    private cachedToken?: CachedToken;
    private clientSecretPromise?: Promise<string>;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('Direct URL auth configPath is required');
        }

        this.configPath = configPath;
    }

    async getAuthHeaders(url: string, _requestBody: unknown): Promise<Record<string, string>> {

        return {
            Authorization: `Bearer ${await this.getAccessToken()}`
        };
    }

    private async getAccessToken(): Promise<string> {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAtEpochMs - 60_000) {
            return this.cachedToken.accessToken;
        }

        const config = await this.getConfig();
        const body = new URLSearchParams();
        body.set('client_id', config.clientId);
        body.set('client_secret', await this.getClientSecret(config));
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

    private async getConfig(): Promise<AuthConfig> {
        if (!this.configPromise) {
            this.configPromise = this.loadConfig(this.configPath);
        }

        return this.configPromise;
    }

    private async getClientSecret(config: AuthConfig): Promise<string> {
        if (!this.clientSecretPromise) {
            this.clientSecretPromise = this.loadClientSecret(config);
        }

        return this.clientSecretPromise;
    }

    private async loadConfig(configPath: string): Promise<AuthConfig> {
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

        if (!config.tokenUrl || !config.clientId || !config.vaultUrl || !config.vaultToken || !config.vaultSecretPath) {
            throw new Error(
                `Direct URL auth config at ${configPath} must include tokenUrl, clientId, vaultUrl, vaultToken, and vaultSecretPath`
            );
        }

        return config;
    }

    private async loadClientSecret(config: AuthConfig): Promise<string> {
        const fieldName = config.vaultSecretField ?? 'clientSecret';
        const vaultResponse = await this.requestVaultSecret(config);
        const secretValue = vaultResponse.data?.data?.[fieldName];

        if (typeof secretValue !== 'string' || !secretValue) {
            throw new Error(
                `Vault secret at ${config.vaultSecretPath} did not include string field '${fieldName}'`
            );
        }

        return secretValue;
    }

    private getEndpoint(urlText: string, label: string): URL {
        try {
            return new URL(urlText);
        } catch (error) {
            throw new Error(`Invalid direct URL auth ${label} '${urlText}': ${getErrorMessage(error)}`);
        }
    }

    private async requestVaultSecret(config: AuthConfig): Promise<VaultSecretResponse> {
        const vaultBaseUrl = this.getEndpoint(config.vaultUrl, 'vaultUrl');
        const vaultUrl = new URL(`/v1/${config.vaultSecretPath.replace(/^\/+/, '')}`, vaultBaseUrl);

        return await this.requestJson<VaultSecretResponse>(
            vaultUrl,
            {
                accept: 'application/json',
                'x-vault-token': config.vaultToken,
            },
            `Vault secret request to ${vaultUrl.toString()}`
        );
    }

    private async requestToken(config: AuthConfig, body: URLSearchParams): Promise<TokenResponse> {
        const tokenUrl = this.getEndpoint(config.tokenUrl, 'tokenUrl');
        const requestBody = body.toString();

        return await this.requestJson<TokenResponse>(
            tokenUrl,
            {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': Buffer.byteLength(requestBody).toString(),
            },
            `Direct URL auth token request to ${config.tokenUrl}`,
            requestBody
        );
    }

    private async requestJson<T>(
        endpoint: URL,
        headers: Record<string, string>,
        description: string,
        requestBody?: string
    ): Promise<T> {
        const transport = endpoint.protocol === 'https:' ? https : endpoint.protocol === 'http:' ? http : undefined;

        if (!transport) {
            throw new Error(`${description} failed: unsupported protocol ${endpoint.protocol}`);
        }

        return await new Promise<T>((resolvePromise, rejectPromise) => {
            const request = transport.request(endpoint, {
                method: requestBody ? 'POST' : 'GET',
                headers,
            }, (response) => {
                let responseBody = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    responseBody += chunk;
                });
                response.on('end', () => {
                    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                        rejectPromise(
                            new Error(`${description} failed: ${response.statusCode ?? 'unknown'} ${response.statusMessage ?? ''}`.trim())
                        );
                        return;
                    }

                    try {
                        resolvePromise(JSON.parse(responseBody) as T);
                    } catch (error) {
                        rejectPromise(new Error(`${description} failed: response was not valid JSON: ${getErrorMessage(error)}`));
                    }
                });
            });

            request.on('error', (error) => {
                rejectPromise(new Error(`${description} failed: ${error.message}`));
            });

            if (requestBody) {
                request.write(requestBody);
            }
            request.end();
        });
    }
}
