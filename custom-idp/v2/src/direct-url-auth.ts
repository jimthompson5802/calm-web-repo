import { readFile } from 'fs/promises';

type AuthConfig = {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
};

export default class DirectUrlAuthPlugin {
    private readonly configPromise: Promise<AuthConfig>;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('configPath is required');
        }

        this.configPromise = readFile(configPath, 'utf8').then((text) =>
            JSON.parse(text) as AuthConfig
        );
    }

    async getAuthHeaders(_url: string, _requestBody: unknown): Promise<Record<string, string>> {
        const config = await this.configPromise;

        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials'
            })
        });

        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status}`);
        }

        const body = (await response.json()) as { access_token?: string };

        if (!body.access_token) {
            throw new Error('No access_token in token response');
        }

        return {
            Authorization: `Bearer ${body.access_token}`
        };
    }
}
