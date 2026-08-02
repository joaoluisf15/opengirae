import { test, expect, describe } from "bun:test";
import { mockAppleMusic } from "@girae/tests";

const state = mockAppleMusic();

const { resolveArtworkUrl, searchAlbums, searchSongs } = await import("../../apple-music/search");
const { getAlbum, getSong } = await import("../../apple-music/resource");

describe("resolveArtworkUrl", () => {
  test("substitutes width, height, and format placeholders", () => {
    const url = resolveArtworkUrl({ url: "https://example.com/{w}x{h}bb.{f}" }, 300);
    expect(url).toBe("https://example.com/300x300bb.jpg");
  });

  test("returns undefined when there's no artwork URL", () => {
    expect(resolveArtworkUrl(undefined, 300)).toBeUndefined();
    expect(resolveArtworkUrl({}, 300)).toBeUndefined();
  });
});

describe("fail-safe on a throwing Apple Music client", () => {
  test("searchAlbums returns [] instead of throwing", async () => {
    state.shouldThrow = true;
    await expect(searchAlbums("test")).resolves.toEqual([]);
  });

  test("searchSongs returns [] instead of throwing", async () => {
    state.shouldThrow = true;
    await expect(searchSongs("test")).resolves.toEqual([]);
  });

  test("getAlbum returns null instead of throwing", async () => {
    state.shouldThrow = true;
    await expect(getAlbum("123")).resolves.toBeNull();
  });

  test("getSong returns null instead of throwing", async () => {
    state.shouldThrow = true;
    await expect(getSong("123")).resolves.toBeNull();
  });
});

describe("search results map through the resource shape", () => {
  test("searchAlbums returns [] when the client resolves with no results (not a throw)", async () => {
    state.shouldThrow = false;
    state.searchResult = { results: {} };
    await expect(searchAlbums("test")).resolves.toEqual([]);
  });
});

describe("getSong requests the albums relationship", () => {
  test("include contains 'albums'", async () => {
    state.shouldThrow = false;
    state.lastSongParams = null;
    await getSong("123");
    expect(state.lastSongParams?.include).toEqual(['albums', 'artists']);
  });
});

describe("searchAlbums dedupes clean/explicit duplicates", () => {
  test("collapses same name+artist+releaseDate to one candidate, keeps genuinely different ones", async () => {
    state.shouldThrow = false;
    state.searchResult = {
      results: {
        albums: {
          data: [
            { id: "explicit-id", attributes: { name: "GUTS", artistName: "Olivia Rodrigo", releaseDate: "2023-09-08" } },
            { id: "clean-id", attributes: { name: "GUTS", artistName: "Olivia Rodrigo", releaseDate: "2023-09-08" } },
            { id: "spilled-id", attributes: { name: "GUTS (spilled)", artistName: "Olivia Rodrigo", releaseDate: "2023-09-08" } },
          ],
        },
      },
    };

    const results = await searchAlbums("GUTS");
    expect(results.map(r => r.id)).toEqual(["explicit-id", "spilled-id"]);
  });
});
