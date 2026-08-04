import { AlbumsEndpointTypes, SongsEndpointTypes } from "@syncfm/applemusic-api";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getClient, rawGet } from "./client";
import { uploadBytes } from "@girae/common/utilities/storage";
import { error, warn } from "@girae/common/logger";

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

async function getAlbumEditorialVideoUrl(id: string): Promise<string | null> {
  const data = await rawGet(`/v1/catalog/us/albums/${id}?extend=editorialVideo`);
  const url = data?.data?.[0]?.attributes?.editorialVideo?.motionSquareVideo1x1?.video;
  return typeof url === 'string' ? url : null;
}

// highest-bandwidth avc1 (H.264) variant - avoids HEVC for broader compatibility
export function pickAvcVariantUrl(masterPlaylistText: string): string | null {
  const lines = masterPlaylistText.split('\n');
  let best: { bandwidth: number; url: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    if (!line.includes('CODECS="avc1')) continue;

    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    const url = lines[i + 1]?.trim();
    if (!bandwidthMatch || !url || !url.startsWith('http')) continue;

    const bandwidth = parseInt(bandwidthMatch[1]!, 10);
    if (!best || bandwidth > best.bandwidth) best = { bandwidth, url };
  }

  return best?.url ?? null;
}

// downscale + re-encode instead of a plain stream copy - the source variant is way bigger than needed
async function compressToMp4(variantUrl: string): Promise<Uint8Array> {
  const workDir = join(tmpdir(), `discoteca-animated-cover-${Bun.randomUUIDv7()}`);
  const outputPath = join(workDir, 'output.mp4');

  try {
    await mkdir(workDir, { recursive: true });
    const proc = Bun.spawn([
      'ffmpeg', '-y', '-i', variantUrl,
      '-vf', 'scale=1000:-2:flags=lanczos',
      '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-an',
      '-movflags', '+faststart',
      outputPath,
    ], { stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`ffmpeg exited ${exitCode}: ${await new Response(proc.stderr).text()}`);
    return new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function getOrProcessAnimatedCover(albumAppleMusicId: string): Promise<string | null> {
  try {
    const editorialUrl = await getAlbumEditorialVideoUrl(albumAppleMusicId);
    if (!editorialUrl) return null;

    const playlistRes = await fetch(editorialUrl);
    if (!playlistRes.ok) throw new Error(`master playlist fetch failed: ${playlistRes.status}`);
    const variantUrl = pickAvcVariantUrl(await playlistRes.text());
    if (!variantUrl) return null;

    const bytes = await compressToMp4(variantUrl);
    return await uploadBytes(bytes, 'apple-music', 'mp4', 'video/mp4');
  } catch (e) {
    warn('apple-music', `getOrProcessAnimatedCover(${albumAppleMusicId}) failed: ${e}`);
    return null;
  }
}
