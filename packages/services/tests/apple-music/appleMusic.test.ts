import { test, expect, describe, mock } from "bun:test";

// must run at module scope before importing the code under test - mock.module only affects later imports
let shouldThrow = false;
mock.module("@syncfm/applemusic-api", () => ({
  AuthType: { Scraped: 0 },
  Region: { US: 'us' },
  ResourceType: { Albums: 'albums', Songs: 'songs' },
  AlbumsEndpointTypes: { IncludeOption: { Tracks: 'tracks' } },
  SongsEndpointTypes: {},
  AppleMusic: class {
    Search = { search: async () => { if (shouldThrow) throw new Error('boom'); return { results: {} }; } };
    Albums = { get: async () => { if (shouldThrow) throw new Error('boom'); return { data: [] }; } };
    Songs = { get: async () => { if (shouldThrow) throw new Error('boom'); return { data: [] }; } };
    async init() {}
  },
}));

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
    shouldThrow = true;
    await expect(searchAlbums("test")).resolves.toEqual([]);
  });

  test("searchSongs returns [] instead of throwing", async () => {
    shouldThrow = true;
    await expect(searchSongs("test")).resolves.toEqual([]);
  });

  test("getAlbum returns null instead of throwing", async () => {
    shouldThrow = true;
    await expect(getAlbum("123")).resolves.toBeNull();
  });

  test("getSong returns null instead of throwing", async () => {
    shouldThrow = true;
    await expect(getSong("123")).resolves.toBeNull();
  });
});

describe("search results map through the resource shape", () => {
  test("searchAlbums returns [] when the client resolves with no results (not a throw)", async () => {
    shouldThrow = false;
    await expect(searchAlbums("test")).resolves.toEqual([]);
  });
});
