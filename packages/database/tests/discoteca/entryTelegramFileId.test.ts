import { test, expect, describe } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { db } from "../../index";
import { discotecaEntries } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.setEntryTelegramFileId", () => {
  const fx = new TestFixtures();

  test("persists file_id and file_unique_id onto the entry", async () => {
    const artistId = (await fx.discotecaArtist()).id;
    const entryRow = await DiscotecaDB.createEntry({
      name: `Test Entry ${Date.now()}`, artistId, appleMusicId: `test-${Date.now()}`, type: 'single',
      rarityId: await anyRarityId(),
    });
    fx.onCleanup(async () => { await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entryRow!.id)); });

    await DiscotecaDB.setEntryTelegramFileId(entryRow!.id, "FILEID123", "UNIQUE123");

    const details = await DiscotecaDB.getEntryWithDetails(entryRow!.id);
    expect(details?.telegramFileId).toBe("FILEID123");
    expect(details?.telegramFileUniqueId).toBe("UNIQUE123");
  });
});
