import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { VanitiesDB } from "../../vanities";

describe("VanitiesDB.getStoreItemsForAnnouncementBatch", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  test("returns every item claimed under the same (type, schedTime) batch key, ordered by id", async () => {
    const items = await Promise.all(
      Array.from({ length: 3 }, (_, i) => fx.storeItem({ title: `Test Batch Sticker ${Date.now()}-${i}`, type: 'sticker' })),
    );
    const ids = items.map(i => i.id).sort((a, b) => a - b);
    const cutoff = new Date();
    const schedTime = new Date();

    await VanitiesDB.claimUnannouncedStoreItems('sticker', schedTime, cutoff, ids);

    const batch = await VanitiesDB.getStoreItemsForAnnouncementBatch('sticker', schedTime);
    expect(batch.map(i => i.id)).toEqual(ids);
  });

  test("a different schedTime key returns an empty batch", async () => {
    const batch = await VanitiesDB.getStoreItemsForAnnouncementBatch('sticker', new Date(0));
    expect(batch).toEqual([]);
  });
});
