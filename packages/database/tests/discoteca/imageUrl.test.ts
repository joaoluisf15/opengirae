import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB image URLs", () => {
  const fx = new TestFixtures();
  afterAll(() => fx.cleanup());

  test("setArtistImage, setGenreImage, setSubcategoryImage persist imageUrl", async () => {
    const artistId = (await fx.discotecaArtist({ name: "Test Banner Artist" })).id;
    const genreId = (await fx.discotecaGenre({ name: "Test Banner Genre" })).id;
    const subcategoryId = (await fx.discotecaSubcategory({ genreId })).id;

    await DiscotecaDB.setArtistImage(artistId, "https://example.com/artist.jpg");
    await DiscotecaDB.setGenreImage(genreId, "https://example.com/genre.jpg");
    await DiscotecaDB.setSubcategoryImage(subcategoryId, "https://example.com/subcategory.jpg");

    const artist = await DiscotecaDB.getArtist(artistId);
    const genre = await DiscotecaDB.getGenre(genreId);
    const subcategory = await DiscotecaDB.getSubcategory(subcategoryId);

    expect(artist?.imageUrl).toBe("https://example.com/artist.jpg");
    expect(genre?.imageUrl).toBe("https://example.com/genre.jpg");
    expect(subcategory?.imageUrl).toBe("https://example.com/subcategory.jpg");
  });
});
