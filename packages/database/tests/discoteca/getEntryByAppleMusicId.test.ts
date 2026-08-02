import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getEntryByAppleMusicId", () => {
  const fx = new TestFixtures();
  let appleMusicId: string;
  let entryId: number;

  beforeAll(async () => {
    appleMusicId = `test-apple-music-lookup-${Date.now()}`;
    entryId = (await fx.discotecaEntry({ appleMusicId })).id;
  });

  afterAll(() => fx.cleanup());

  test("finds the entry by its exact Apple Music id", async () => {
    const entry = await DiscotecaDB.getEntryByAppleMusicId(appleMusicId);
    expect(entry?.id).toBe(entryId);
  });

  test("returns undefined for an id that doesn't exist", async () => {
    const entry = await DiscotecaDB.getEntryByAppleMusicId(`nonexistent-${Date.now()}`);
    expect(entry).toBeUndefined();
  });
});
