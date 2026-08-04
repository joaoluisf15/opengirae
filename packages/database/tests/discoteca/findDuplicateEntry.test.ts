import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.findDuplicateEntry", () => {
  const fx = new TestFixtures();
  let artistId: number;
  let otherArtistId: number;

  beforeAll(async () => {
    artistId = (await fx.discotecaArtist({ name: `Test Dup Artist ${Date.now()}` })).id;
    otherArtistId = (await fx.discotecaArtist({ name: `Test Dup Other Artist ${Date.now()}` })).id;
    await fx.discotecaEntry({ type: 'album', name: 'Renaissance', artistId });
    await fx.discotecaEntry({ type: 'single', name: 'Cuff It', artistId });
  });

  afterAll(() => fx.cleanup());

  test("finds a case/accent-insensitive exact match, scoped to artist and type", async () => {
    const found = await DiscotecaDB.findDuplicateEntry('rEnAissáncé', artistId, 'album');
    expect(found?.name).toBe('Renaissance');
  });

  test("does not match a different type with the same name", async () => {
    const found = await DiscotecaDB.findDuplicateEntry('Renaissance', artistId, 'single');
    expect(found).toBeUndefined();
  });

  test("does not match the same name for a different artist", async () => {
    const found = await DiscotecaDB.findDuplicateEntry('Renaissance', otherArtistId, 'album');
    expect(found).toBeUndefined();
  });

  test("returns undefined when nothing matches", async () => {
    const found = await DiscotecaDB.findDuplicateEntry('Totally Unique Name', artistId, 'album');
    expect(found).toBeUndefined();
  });
});
