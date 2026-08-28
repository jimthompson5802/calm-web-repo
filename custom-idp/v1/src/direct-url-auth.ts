import { readFile } from 'fs/promises';

type AuthConfig = {
    fakeToken: string;
};

export default class DirectUrlAuthPlugin {
    private readonly configPath: string;
    private readonly configPromise: Promise<AuthConfig>;

    constructor(configPath?: string) {
        if (!configPath) {
            throw new Error('configPath is required');
        }

        this.configPath = configPath;
        this.configPromise = readFile(configPath, 'utf8').then((text) =>
            JSON.parse(text) as AuthConfig
        );
    }

    async getAuthHeaders(_url: string, _requestBody: unknown): Promise<Record<string, string>> {
        const config = await this.configPromise;

        // write to stdout the configpath, _url and _requestBody
        console.log('>>>configPath:', this.configPath);
        console.log('>>>config:', this.configPromise);
        console.log('>>>url:', _url); 
        console.log('>>>requestBody:', _requestBody);


        if (!config.fakeToken) {
            throw new Error('fakeToken is required');
        }

        return {
            Authorization: config.fakeToken
        };
    }
}
