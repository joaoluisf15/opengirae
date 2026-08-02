import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.getGenre / getGenres", () => {
  const fx = new TestFixtures();
  let genreId: number;
  let genreName: string;

  beforeAll(async () => {
    genreName = `Test GetGenre ${Date.now()}`;
    genreId = (await fx.discotecaGenre({ name: genreName })).id;
  });

  afterAll(() => fx.cleanup());

  test("getGenre finds the genre by ID", async () => {
    const genre = await DiscotecaDB.getGenre(genreId);
    expect(genre?.name).toBe(genreName);
  });

  test("getGenre returns undefined for an ID that doesn't exist", async () => {
    const genre = await DiscotecaDB.getGenre(999999999);
    expect(genre).toBeUndefined();
  });

  test("getGenres includes the created genre", async () => {
    const genres = await DiscotecaDB.getGenres();
    expect(genres.map(g => g.id)).toContain(genreId);
  });
});
