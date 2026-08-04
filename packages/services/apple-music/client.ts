import { AppleMusic, AuthType, Region } from "@syncfm/applemusic-api";
import { warn } from "@girae/common/logger";

const client = new AppleMusic({ authType: AuthType.Scraped, region: Region.US });

let initPromise: Promise<void> | null = null;

export async function getClient(): Promise<AppleMusic> {
  if (!initPromise) {
    initPromise = client.init().catch((e) => {
      initPromise = null;
      warn('apple-music', `client init failed: ${e}`);
      throw e;
    });
  }
  await initPromise;
  return client;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const c = await getClient();
  const axiosInstance = (c as unknown as { client: { get(url: string, opts: any): Promise<unknown> } }).client;
  let captured: Record<string, string> = {};
  await axiosInstance.get('https://amp-api-edge.music.apple.com/v1/test', {
    adapter: async (config: { headers?: { toJSON?: () => Record<string, string> } & Record<string, unknown> }) => {
      captured = typeof config.headers?.toJSON === 'function'
        ? config.headers.toJSON()
        : (config.headers as unknown as Record<string, string>) ?? {};
      return { data: null, status: 200, statusText: 'OK', headers: {}, config };
    },
  });
  return captured;
}

// bypasses the wrapper's typed Albums.get(), which only allows extend=artistUrl and drops anything else (e.g. extend=editorialVideo)
export async function rawGet(path: string): Promise<any> {
  const headers = await getAuthHeaders();
  const res = await fetch(`https://amp-api-edge.music.apple.com${path}`, { headers });
  if (!res.ok) throw new Error(`rawGet(${path}) failed: ${res.status}`);
  return res.json();
}
