import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaGenreAliases } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.resolveGenresByAliases", () => {
  const fx = new TestFixtures();
  let genreId: number;
  let genreName: string;
  let albumSubcategoryId: number;
  let albumSubcategoryName: string;
  let singleSubcategoryId: number;
  let singleSubcategoryName: string;
  let popAlias: string;

  beforeAll(async () => {
    genreName = `Pop ${Date.now()}`;
    genreId = (await fx.discotecaGenre({ name: genreName })).id;

    albumSubcategoryName = `Álbuns de ${genreName}`;
    albumSubcategoryId = (await fx.discotecaSubcategory({ genreId, isAlbum: true, name: albumSubcategoryName, emoji: '💽' })).id;
    singleSubcategoryName = `Singles de ${genreName}`;
    singleSubcategoryId = (await fx.discotecaSubcategory({ genreId, isAlbum: false, name: singleSubcategoryName, emoji: '🎵' })).id;

    popAlias = `K-Pop ${Date.now()}`;
    const alias = await DiscotecaDB.upsertGenreAlias(popAlias, genreId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, alias!.id)); });
  });

  afterAll(() => fx.cleanup());

  test("resolves a mapped alias to the album subcategory and reports an unmapped one, case-insensitively", async () => {
    const result = await DiscotecaDB.resolveGenresByAliases([popAlias.toUpperCase(), "Totally Unmapped Genre"], true);

    expect(result.resolved).toEqual([{ id: albumSubcategoryId, name: albumSubcategoryName }]);
    expect(result.unmapped).toEqual(["Totally Unmapped Genre"]);
  });

  test("the same alias resolves to the single subcategory when isAlbum is false", async () => {
    const result = await DiscotecaDB.resolveGenresByAliases([popAlias], false);

    expect(result.resolved).toEqual([{ id: singleSubcategoryId, name: singleSubcategoryName }]);
    expect(result.unmapped).toEqual([]);
  });

  test("a raw string matching the canonical genre name resolves without needing an alias, case-insensitively", async () => {
    const result = await DiscotecaDB.resolveGenresByAliases([genreName.toUpperCase()], true);

    expect(result.resolved).toEqual([{ id: albumSubcategoryId, name: albumSubcategoryName }]);
    expect(result.unmapped).toEqual([]);
  });
});
