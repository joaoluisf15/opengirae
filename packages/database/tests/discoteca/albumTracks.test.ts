import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures, anyRarityId } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB album tracks", () => {
  const fx = new TestFixtures();
  afterAll(() => fx.cleanup());

  test("cacheAlbumTracks stores rows, findAlbumTrackMatch finds by track name scoped to the artist", async () => {
    const artistId = (await fx.discotecaArtist({ name: "Test Tracklist Artist" })).id;
    const album = await fx.discotecaEntry({ name: "Test Tracklist Album", artistId, type: 'album', rarityId: await anyRarityId() });

    await DiscotecaDB.cacheAlbumTracks(album.id, [
      { trackAppleMusicId: "t1", name: "Opening Track" },
      { trackAppleMusicId: "t2", name: "  Closing Track  " },
    ]);

    const match = await DiscotecaDB.findAlbumTrackMatch(artistId, "closing track");
    expect(match?.id).toBe(album.id);
    expect(match?.name).toBe("Test Tracklist Album");

    const noMatch = await DiscotecaDB.findAlbumTrackMatch(artistId, "Not On The Album");
    expect(noMatch).toBeUndefined();
  });

  test("findAlbumTrackMatch does not match tracks belonging to a different artist", async () => {
    const artistAId = (await fx.discotecaArtist({ name: "Test Scope Artist A" })).id;
    const artistBId = (await fx.discotecaArtist({ name: "Test Scope Artist B" })).id;
    const albumA = await fx.discotecaEntry({ name: "Test Scope Album A", artistId: artistAId, type: 'album', rarityId: await anyRarityId() });

    await DiscotecaDB.cacheAlbumTracks(albumA.id, [{ trackAppleMusicId: "t3", name: "Shared Track Name" }]);

    const match = await DiscotecaDB.findAlbumTrackMatch(artistBId, "Shared Track Name");
    expect(match).toBeUndefined();
  });
});
