import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userDiscoteca } from "../../schemas/discoteca";
import { eq, and } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.addUserDiscoteca", () => {
  const fx = new TestFixtures();
  let userId: number;
  let entryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Discoteca User" })).id;
    entryId = (await fx.discotecaEntry()).id;
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, entryId))); });
  });

  afterAll(() => fx.cleanup());

  test("creates a new ownership row with count 1 on first draw", async () => {
    const count = await DiscotecaDB.addUserDiscoteca(userId, entryId);
    expect(count).toBe(1);
  });

  test("increments the existing row's count on a second draw of the same entry", async () => {
    const count = await DiscotecaDB.addUserDiscoteca(userId, entryId);
    expect(count).toBe(2);

    const rows = await db.select().from(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, entryId)));
    expect(rows.length).toBe(1);
    expect(rows[0]!.count).toBe(2);
  });
});
