import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { userDiscoteca } from "../../schemas/discoteca";
import { and, eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.hasAnyUserDiscoteca", () => {
  const fx = new TestFixtures();
  let userId: number;
  let entryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test HasAny User" })).id;
    entryId = (await fx.discotecaEntry()).id;
  });

  afterAll(() => fx.cleanup());

  test("false before any draw, true after", async () => {
    expect(await DiscotecaDB.hasAnyUserDiscoteca(userId)).toBe(false);
    await DiscotecaDB.addUserDiscoteca(userId, entryId);
    fx.onCleanup(async () => { await db.delete(userDiscoteca).where(and(eq(userDiscoteca.userId, userId), eq(userDiscoteca.entryId, entryId))); });
    expect(await DiscotecaDB.hasAnyUserDiscoteca(userId)).toBe(true);
  });
});
