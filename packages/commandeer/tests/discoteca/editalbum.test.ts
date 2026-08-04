import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures, anyRarityId } from "@girae/tests";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { DiscotecaDB } from "@girae/database/discoteca";
import { db } from "@girae/database/index";
import { discotecaEntries, discotecaEntrySubcategories } from "@girae/database/schemas/discoteca";
import { auditLogs } from "@girae/database/schemas/audit";
import { eq } from "drizzle-orm";

mockTelegram();

import EditAlbumCommand from "../../commands/discoteca/editalbum";

describe("/editalbum", () => {
  const fx = new TestFixtures();
  let staffPlatformId: string;
  let staffId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
    staffPlatformId = `test-editalbum-staff-${Date.now()}`;
    staffId = (await fx.user({ displayName: "Test Editalbum Staff", platform: 'telegram', platformId: staffPlatformId })).id;
    fx.onCleanup(async () => { await db.delete(auditLogs).where(eq(auditLogs.actorUserId, staffId)); });
  });

  afterAll(() => fx.cleanup());

  test("renaming an existing album via the ✏️ Nome button updates the stored name", async () => {
    const artistId = (await fx.discotecaArtist({ name: "Test Edit Artist" })).id;
    const rarityId = await anyRarityId();
    const entry = await DiscotecaDB.createEntry({
      name: "Test Original Album Name", artistId, appleMusicId: `test-editalbum-${Date.now()}`, type: 'album', rarityId,
    });
    fx.onCleanup(async () => {
      await db.delete(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entry!.id));
      await db.delete(discotecaEntries).where(eq(discotecaEntries.id, entry!.id));
    });

    const workflowID = `test-editalbum-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'editalbum', authorId: staffPlatformId, args: [String(entry!.id)], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(EditAlbumCommand, { workflowID }).execute(runCtx, { entry: { id: entry!.id } } as any);

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'editName' } }, 'discoteca:confirm');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: "Test Renamed Album Name" }, 'discoteca:name');
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: { action: 'confirm' } }, 'discoteca:confirm');
    await handle.getResult();

    const updated = await db.select().from(discotecaEntries).where(eq(discotecaEntries.id, entry!.id)).then(r => r[0]);
    expect(updated?.name).toBe("Test Renamed Album Name");
  }, 15000);
});
