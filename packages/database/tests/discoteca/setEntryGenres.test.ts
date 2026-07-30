import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaEntryGenres } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.setEntryGenres", () => {
  const fx = new TestFixtures();
  let entryId: number;
  let genreAId: number;
  let genreBId: number;

  beforeAll(async () => {
    entryId = (await fx.discotecaEntry()).id;
    genreAId = (await fx.genre({ name: `Genre A ${Date.now()}` })).id;
    genreBId = (await fx.genre({ name: `Genre B ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  test("links the given genres to the entry", async () => {
    await DiscotecaDB.setEntryGenres(entryId, [genreAId, genreBId]);

    const rows = await db.select().from(discotecaEntryGenres).where(eq(discotecaEntryGenres.entryId, entryId));
    expect(rows.map(r => r.genreId).sort()).toEqual([genreAId, genreBId].sort());
  });

  test("replaces the previous set rather than accumulating", async () => {
    await DiscotecaDB.setEntryGenres(entryId, [genreAId]);

    const rows = await db.select().from(discotecaEntryGenres).where(eq(discotecaEntryGenres.entryId, entryId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.genreId).toBe(genreAId);
  });

  test("clears every genre when given an empty list", async () => {
    await DiscotecaDB.setEntryGenres(entryId, []);

    const rows = await db.select().from(discotecaEntryGenres).where(eq(discotecaEntryGenres.entryId, entryId));
    expect(rows.length).toBe(0);
  });
});
