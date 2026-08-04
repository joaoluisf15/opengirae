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

describe("pickAvcVariantUrl", () => {
  const SAMPLE_MASTER_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=235142,CODECS="avc1.64001f",RESOLUTION=360x360
https://example.com/low_avc.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=7239085,CODECS="hvc1.2.20000000.H150.B0",RESOLUTION=1920x1920
https://example.com/high_hevc.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3808360,CODECS="avc1.640020",RESOLUTION=1080x1080
https://example.com/mid_avc.m3u8
`;

  test("picks the highest-bandwidth AVC variant, ignoring HEVC even if higher bandwidth", async () => {
    const { pickAvcVariantUrl } = await import("../../apple-music/resource");
    expect(pickAvcVariantUrl(SAMPLE_MASTER_PLAYLIST)).toBe("https://example.com/mid_avc.m3u8");
  });

  test("returns null when there's no AVC variant at all", async () => {
    const { pickAvcVariantUrl } = await import("../../apple-music/resource");
    const hevcOnly = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,CODECS="hvc1.2"\nhttps://example.com/only_hevc.m3u8\n`;
    expect(pickAvcVariantUrl(hevcOnly)).toBeNull();
  });

  test("returns null on an empty or malformed playlist", async () => {
    const { pickAvcVariantUrl } = await import("../../apple-music/resource");
    expect(pickAvcVariantUrl("")).toBeNull();
    expect(pickAvcVariantUrl("not an hls playlist")).toBeNull();
  });
});

describe("getOrProcessAnimatedCover", () => {
  test("returns null when the album has no motion cover, without fetching a playlist", async () => {
    const originalFetch = fetch;
    let fetchCallCount = 0;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ data: [{ id: "no-cover-album", attributes: {} }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { getOrProcessAnimatedCover } = await import("../../apple-music/resource");
      const result = await getOrProcessAnimatedCover("no-cover-album");
      expect(result).toBeNull();
      expect(fetchCallCount).toBe(1); // only the metadata call, never the (nonexistent) playlist
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
  });

  test("returns null instead of throwing when the metadata request fails", async () => {
    const originalFetch = fetch;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    try {
      const { getOrProcessAnimatedCover } = await import("../../apple-music/resource");
      await expect(getOrProcessAnimatedCover("123")).resolves.toBeNull();
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
  });
});
