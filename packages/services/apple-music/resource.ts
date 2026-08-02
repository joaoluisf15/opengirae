import { AlbumsEndpointTypes, SongsEndpointTypes } from "@syncfm/applemusic-api";
import { getClient } from "./client";
import { error } from "@girae/common/logger";

export async function getAlbum(id: string): Promise<AlbumsEndpointTypes.AlbumResource | null> {
  try {
    const client = await getClient();
    const response = await client.Albums.get({ id, include: [AlbumsEndpointTypes.IncludeOption.Tracks, AlbumsEndpointTypes.IncludeOption.Artists] });
    return response.data[0] ?? null;
  } catch (e) {
    error('apple-music', `getAlbum(${id}) failed: ${e}`);
    return null;
  }
}

export async function getSong(id: string): Promise<SongsEndpointTypes.SongResource | null> {
  try {
    const client = await getClient();
    const response = await client.Songs.get({ id, include: [SongsEndpointTypes.IncludeOption.Albums, SongsEndpointTypes.IncludeOption.Artists] });
    return response.data[0] ?? null;
  } catch (e) {
    error('apple-music', `getSong(${id}) failed: ${e}`);
    return null;
  }
}
