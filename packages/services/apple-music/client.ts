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
