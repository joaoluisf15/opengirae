import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscotecaDB } from "@girae/database/discoteca";
import { writeScratchFile } from "@girae/common/media/mediaRef";
import { warn } from "@girae/common/logger";

interface ArtworkLike {
  url?: string;
}

export interface PreviewTags {
  title: string;
  artistName: string;
  albumName?: string;
  releaseDate?: string;
  genre?: string;
}

// embeds artwork as an attached_pic stream and the given tags, without re-encoding audio
export async function tagPreviewAudio(audioBytes: Uint8Array, artworkBytes: Uint8Array | undefined, tags: PreviewTags): Promise<Uint8Array> {
  const workDir = join(tmpdir(), `discoteca-preview-${Bun.randomUUIDv7()}`);
  const inputPath = join(workDir, 'input.m4a');
  const artworkPath = join(workDir, 'cover.jpg');
  const outputPath = join(workDir, 'output.m4a');

  try {
    await mkdir(workDir, { recursive: true });
    await Bun.write(inputPath, audioBytes);
    if (artworkBytes) await Bun.write(artworkPath, artworkBytes);

    const args = artworkBytes
      ? ['ffmpeg', '-y', '-i', inputPath, '-i', artworkPath, '-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic']
      : ['ffmpeg', '-y', '-i', inputPath, '-map', '0:a', '-c:a', 'copy'];
    args.push(
      '-metadata', `title=${tags.title}`,
      '-metadata', `artist=${tags.artistName}`,
      ...(tags.albumName ? ['-metadata', `album=${tags.albumName}`] : []),
      ...(tags.releaseDate ? ['-metadata', `date=${tags.releaseDate}`] : []),
      ...(tags.genre ? ['-metadata', `genre=${tags.genre}`] : []),
      '-movflags', '+faststart',
      outputPath,
    );

    const proc = Bun.spawn(args, { stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`ffmpeg exited ${exitCode}: ${await new Response(proc.stderr).text()}`);

    return new Uint8Array(await Bun.file(outputPath).arrayBuffer());
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function resolveArtwork150(artwork: ArtworkLike | undefined): string | undefined {
  if (!artwork?.url) return undefined;
  return artwork.url.replace('{w}', '150').replace('{h}', '150').replace('{f}', 'jpg');
}

export interface PreviewTagData extends PreviewTags {
  appleMusicTrackId: string;
  previewUrl: string;
  artwork?: ArtworkLike;
}

export async function getOrProcessPreview(track: PreviewTagData): Promise<string | null> {
  const cached = await DiscotecaDB.getPreviewCacheEntry(track.appleMusicTrackId);
  if (cached) return cached.mediaRef;

  try {
    const artworkUrl = resolveArtwork150(track.artwork);
    const [audioRes, artworkRes] = await Promise.all([
      fetch(track.previewUrl),
      artworkUrl ? fetch(artworkUrl) : Promise.resolve(null),
    ]);
    if (!audioRes.ok) throw new Error(`preview audio fetch failed: ${audioRes.status}`);

    const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
    const artworkFailed = !!artworkUrl && !artworkRes?.ok;
    const artworkBytes = artworkRes?.ok ? new Uint8Array(await artworkRes.arrayBuffer()) : undefined;
    if (artworkFailed) warn('apple-music', `getOrProcessPreview(${track.appleMusicTrackId}): artwork fetch failed (${artworkRes?.status}), tagging without cover and skipping the permanent cache`);

    const taggedBytes = await tagPreviewAudio(audioBytes, artworkBytes, track);

    const mediaRef = await writeScratchFile(`discoteca-previews/${Bun.randomUUIDv7()}.m4a`, taggedBytes);
    if (!artworkFailed) await DiscotecaDB.setPreviewCacheEntry(track.appleMusicTrackId, mediaRef);
    return mediaRef;
  } catch (e) {
    warn('apple-music', `getOrProcessPreview(${track.appleMusicTrackId}) failed: ${e}`);
    return null;
  }
}
