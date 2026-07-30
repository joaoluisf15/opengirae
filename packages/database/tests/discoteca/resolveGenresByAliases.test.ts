import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaGenreAliases } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.resolveGenresByAliases", () => {
  const fx = new TestFixtures();
  let popId: number;
  let popName: string;

  beforeAll(async () => {
    popName = `Pop ${Date.now()}`;
    popId = (await fx.genre({ name: popName })).id;
    const alias = await DiscotecaDB.upsertGenreAlias(`K-Pop ${Date.now()}`, popId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, alias!.id)); });
  });

  afterAll(() => fx.cleanup());

  test("resolves a mapped alias and reports an unmapped one, case-insensitively", async () => {
    const aliasRow = await db.select().from(discotecaGenreAliases).where(eq(discotecaGenreAliases.genreId, popId)).limit(1).then(a => a[0]!);
    const upperCaseAlias = aliasRow.alias.toUpperCase();

    const result = await DiscotecaDB.resolveGenresByAliases([upperCaseAlias, "Totally Unmapped Genre"]);

    expect(result.resolved).toEqual([{ id: popId, name: popName }]);
    expect(result.unmapped).toEqual(["Totally Unmapped Genre"]);
  });
});
