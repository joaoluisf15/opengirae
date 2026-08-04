import { test, expect, describe, beforeEach } from "bun:test";
import { mockTelegram } from "@girae/tests";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { sentMessages } = mockTelegram();

const { isRetriableAsVideo, sendTelegramAnswer } = await import("../platforms/telegram");

describe("isRetriableAsVideo", () => {
  test("matches Telegram's 'failed to get HTTP URL content' (seen on the first sendAnimation attempt against a just-uploaded file)", () => {
    expect(isRetriableAsVideo(new Error("Bad Request: failed to get HTTP URL content"))).toBe(true);
  });

  test("matches Telegram's 'wrong type of the web page content' (a real video with sound rejected by sendAnimation)", () => {
    expect(isRetriableAsVideo(new Error("Bad Request: wrong type of the web page content"))).toBe(true);
  });

  test("does not match an unrelated error", () => {
    expect(isRetriableAsVideo(new Error("Bad Request: chat not found"))).toBe(false);
  });

  test("does not throw on a missing/malformed error", () => {
    expect(isRetriableAsVideo(undefined)).toBe(false);
    expect(isRetriableAsVideo({})).toBe(false);
  });
});

describe("sendTelegramAnswer sendAudio branches", () => {
  beforeEach(() => { sentMessages.length = 0; });

  test("audioFileId present: sends the file_id directly, no fetch", async () => {
    const originalFetch = fetch;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => { throw new Error("must not fetch when a file_id is cached"); }) as unknown as typeof fetch;
    try {
      await sendTelegramAnswer({
        method: 'sendAudio', chatId: '1', platform: 'telegram',
        audioFileId: 'CACHED_FILE_ID', audio: { entryId: 1, performer: 'Artist', title: 'Track' },
      } as any);
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendAudio');
    expect(last.audio).toBe('CACHED_FILE_ID');
  });

  test("audio.thumbnailUrl present: forwarded as thumbnail", async () => {
    await sendTelegramAnswer({
      method: 'sendAudio', chatId: '1', platform: 'telegram',
      audioFileId: 'CACHED_FILE_ID',
      audio: { entryId: 1, performer: 'Artist', title: 'Track', thumbnailUrl: 'https://cdn.example.com/cover.jpg' },
    } as any);
    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.thumbnail).toBe('https://cdn.example.com/cover.jpg');
  });

  test("file://scratch ref: reads the local file and uploads it, no network fetch", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'answerer-scratch-test-'));
    const prevScratch = process.env.SCRATCH_DIR;
    process.env.SCRATCH_DIR = dir;
    try {
      await Bun.write(join(dir, 'preview.m4a'), new Uint8Array([1, 2, 3]));
      await sendTelegramAnswer({
        method: 'sendAudio', chatId: '1', platform: 'telegram',
        audioUrl: 'file://scratch/preview.m4a', audio: { entryId: 1, performer: 'Artist', title: 'Track' },
      } as any);
      const last = sentMessages[sentMessages.length - 1]!;
      expect(last.method).toBe('sendAudio');
      expect(Buffer.isBuffer(last.audio) || last.audio instanceof Uint8Array).toBe(true);
    } finally {
      process.env.SCRATCH_DIR = prevScratch;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("https url (legacy fallback): fetches bytes as before", async () => {
    const originalFetch = fetch;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => new Response(new Uint8Array([9]))) as unknown as typeof fetch;
    try {
      await sendTelegramAnswer({
        method: 'sendAudio', chatId: '1', platform: 'telegram',
        audioUrl: 'https://cdn.example.com/a.m4a', audio: { entryId: 1, performer: 'Artist', title: 'Track' },
      } as any);
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
    const last = sentMessages[sentMessages.length - 1]!;
    expect(last.method).toBe('sendAudio');
  });
});
