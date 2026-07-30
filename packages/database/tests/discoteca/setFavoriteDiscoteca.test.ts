import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userProfiles } from "../../schemas/users";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.setFavoriteDiscoteca", () => {
  const fx = new TestFixtures();
  let userId: number;
  let entryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Favorite Discoteca User" })).id;
    entryId = (await fx.discotecaEntry()).id;
  });

  afterAll(() => fx.cleanup());

  test("sets favoriteDiscotecaId on the user's profile", async () => {
    await DiscotecaDB.setFavoriteDiscoteca(userId, entryId);
    // clears the FK before the entry's own cleanup runs (LIFO, registered after this one)
    fx.onCleanup(async () => { await db.update(userProfiles).set({ favoriteDiscotecaId: null }).where(eq(userProfiles.userId, userId)); });

    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1).then(a => a[0]!);
    expect(profile.favoriteDiscotecaId).toBe(entryId);
  });
});
