import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaEntrySubcategories } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.setEntryGenres", () => {
  const fx = new TestFixtures();
  let entryId: number;
  let subcategoryAId: number;
  let subcategoryBId: number;

  beforeAll(async () => {
    entryId = (await fx.discotecaEntry()).id;
    subcategoryAId = (await fx.discotecaSubcategory({ name: `Subcategory A ${Date.now()}` })).id;
    subcategoryBId = (await fx.discotecaSubcategory({ name: `Subcategory B ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  test("links the given subcategories to the entry", async () => {
    await DiscotecaDB.setEntryGenres(entryId, [subcategoryAId, subcategoryBId]);

    const rows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entryId));
    expect(rows.map(r => r.subcategoryId).sort()).toEqual([subcategoryAId, subcategoryBId].sort());
  });

  test("replaces the previous set rather than accumulating", async () => {
    await DiscotecaDB.setEntryGenres(entryId, [subcategoryAId]);

    const rows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entryId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.subcategoryId).toBe(subcategoryAId);
  });

  test("clears every subcategory when given an empty list", async () => {
    await DiscotecaDB.setEntryGenres(entryId, []);

    const rows = await db.select().from(discotecaEntrySubcategories).where(eq(discotecaEntrySubcategories.entryId, entryId));
    expect(rows.length).toBe(0);
  });
});
