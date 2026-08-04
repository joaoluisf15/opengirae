import { db } from "./index";
import { maybeTransaction } from "./decorators";
import { settings } from "./schemas/settings";

export class SettingsDB {
  static getState = async () => {
    return await db.select().from(settings).limit(1).then(rows => rows[0]!);
  }

  static isDiscotecaEnabled = async (): Promise<boolean> => {
    return (await SettingsDB.getState()).enableDiscoteca;
  }

  static setDiscotecaEnabled = maybeTransaction('setDiscotecaEnabled', async (client, enabled: boolean) => {
    return await client.update(settings).set({ enableDiscoteca: enabled }).returning().then(rows => rows[0]);
  })
}
