import { test, expect, describe } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tagPreviewAudio, getOrProcessPreview } from "../../apple-music/preview";
import { DiscotecaDB } from "@girae/database/discoteca";

const hasFfmpeg = !!Bun.which('ffmpeg') && !!Bun.which('ffprobe');

async function synthAudio(dir: string): Promise<Uint8Array> {
  const path = join(dir, 'synth.m4a');
  const proc = Bun.spawn(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1', '-c:a', 'aac', path], { stderr: 'ignore' });
  await proc.exited;
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

async function synthArtwork(dir: string): Promise<Uint8Array> {
  const path = join(dir, 'synth.jpg');
  const proc = Bun.spawn(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=150x150', '-frames:v', '1', '-update', '1', path], { stderr: 'ignore' });
  await proc.exited;
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

describe.skipIf(!hasFfmpeg)("tagPreviewAudio (real ffmpeg)", () => {
  test("embeds tags and artwork without re-encoding the audio stream", async () => {
    const fixturesDir = await mkdtemp(join(tmpdir(), 'discoteca-fixtures-'));
    try {
      const [audio, artwork] = await Promise.all([synthAudio(fixturesDir), synthArtwork(fixturesDir)]);

      const tagged = await tagPreviewAudio(audio, artwork, {
        title: "Test Track",
        artistName: "Test Artist",
        albumName: "Test Album",
        releaseDate: "2024-01-01",
        genre: "Pop",
      });

      const outPath = join(fixturesDir, 'tagged.m4a');
      await Bun.write(outPath, tagged);
      const probe = Bun.spawn(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', outPath], { stdout: 'pipe' });
      const probeJson = JSON.parse(await new Response(probe.stdout).text());

      expect(probeJson.format.tags.title).toBe("Test Track");
      expect(probeJson.format.tags.artist).toBe("Test Artist");
      expect(probeJson.format.tags.album).toBe("Test Album");
      expect(probeJson.format.tags.genre).toBe("Pop");

      const audioStream = probeJson.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
      const videoStream = probeJson.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
      expect(audioStream.codec_name).toBe('aac');
      expect(videoStream.codec_name).toBe('mjpeg');
      expect(videoStream.disposition.attached_pic).toBe(1);
    } finally {
      await rm(fixturesDir, { recursive: true, force: true });
    }
  });

  test("without artwork, still tags successfully (audio-only output)", async () => {
    const fixturesDir = await mkdtemp(join(tmpdir(), 'discoteca-fixtures-'));
    try {
      const audio = await synthAudio(fixturesDir);
      const tagged = await tagPreviewAudio(audio, undefined, { title: "No Art", artistName: "Test Artist" });
      expect(tagged.byteLength).toBeGreaterThan(0);
    } finally {
      await rm(fixturesDir, { recursive: true, force: true });
    }
  });
});

describe("getOrProcessPreview cache hit", () => {
  test("returns the cached URL immediately without fetching or invoking ffmpeg", async () => {
    const trackId = `test-preview-cache-${Date.now()}`;
    await DiscotecaDB.setPreviewCacheEntry(trackId, "https://cdn.example.com/cached.m4a");

    // previewUrl deliberately unreachable - a cache hit must never attempt to fetch it
    const result = await getOrProcessPreview({
      appleMusicTrackId: trackId,
      previewUrl: "https://nonexistent.invalid/preview.m4a",
      title: "Cached Track",
      artistName: "Test Artist",
    });

    expect(result).toBe("https://cdn.example.com/cached.m4a");
  });
});
