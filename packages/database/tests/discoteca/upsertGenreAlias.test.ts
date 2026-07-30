import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaGenreAliases } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.upsertGenreAlias", () => {
  const fx = new TestFixtures();
  let genreAId: number;
  let genreBId: number;

  beforeAll(async () => {
    genreAId = (await fx.genre({ name: `Genre A ${Date.now()}` })).id;
    genreBId = (await fx.genre({ name: `Genre B ${Date.now()}` })).id;
  });

  afterAll(() => fx.cleanup());

  test("normalizes the alias to lowercase before storing it", async () => {
    const row = await DiscotecaDB.upsertGenreAlias("K-Pop", genreAId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, row!.id)); });

    expect(row?.alias).toBe("k-pop");
    expect(row?.genreId).toBe(genreAId);
  });

  test("re-mapping the same alias to a different genre updates it in place, not a duplicate row", async () => {
    const first = await DiscotecaDB.upsertGenreAlias("hip-hop/rap", genreAId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, first!.id)); });

    const second = await DiscotecaDB.upsertGenreAlias("Hip-Hop/Rap", genreBId);

    expect(second?.id).toBe(first?.id);
    expect(second?.genreId).toBe(genreBId);

    const rows = await db.select().from(discotecaGenreAliases).where(eq(discotecaGenreAliases.alias, "hip-hop/rap"));
    expect(rows.length).toBe(1);
  });
});
