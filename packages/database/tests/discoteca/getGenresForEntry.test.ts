import { test, expect, describe } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getGenresForEntry", () => {
  const fx = new TestFixtures();

  test("returns the canonical genre names, not the subcategory display names", async () => {
    const genreId = (await fx.discotecaGenre({ name: `Alternativo ${Date.now()}` })).id;
    const subcategoryId = (await fx.discotecaSubcategory({ genreId, isAlbum: true, name: `Álbuns de Alternativo ${Date.now()}` })).id;
    const entryId = (await fx.discotecaEntry({ type: 'album' })).id;
    await DiscotecaDB.setEntryGenres(entryId, [subcategoryId]);

    const genres = await DiscotecaDB.getGenresForEntry(entryId);
    expect(genres.length).toBe(1);
    expect(genres[0]!.id).toBe(genreId);
    expect(genres[0]!.name).toContain('Alternativo');
    expect(genres[0]!.name).not.toContain('Álbuns de');
  });
});
