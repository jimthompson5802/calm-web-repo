import { readFile } from 'fs/promises';

type AuthConfig = {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
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
    private readonly configPromise: Promise<AuthConfig>;
    private cachedToken?: CachedToken;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('configPath is required');
        }

        this.configPromise = readFile(configPath, 'utf8').then((text: string) =>
            JSON.parse(text) as AuthConfig
        );
    }

    async getAuthHeaders(_url: string, _requestBody: unknown): Promise<Record<string, string>> {
        return {
            Authorization: `Bearer ${await this.getAccessToken()}`
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

        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded'
            },
            body
        });

        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status} ${response.statusText}`.trim());
        }

        const tokenResponse = (await response.json()) as TokenResponse;

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
}
