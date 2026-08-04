import { test, expect, describe } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMediaRef, mediaRefToUri, resolveFilePath, writeScratchFile } from "../../media/mediaRef";

describe("parseMediaRef", () => {
  test("parses an https URL as kind 'http'", () => {
    expect(parseMediaRef("https://cdn.example.com/a.m4a")).toEqual({ kind: "http", url: "https://cdn.example.com/a.m4a" });
  });

  test("parses a file://scratch/<key> URI", () => {
    expect(parseMediaRef("file://scratch/abc123.m4a")).toEqual({ kind: "file", volume: "scratch", key: "abc123.m4a" });
  });

  test("parses a file://telegram/<key> URI", () => {
    expect(parseMediaRef("file://telegram/xyz.m4a")).toEqual({ kind: "file", volume: "telegram", key: "xyz.m4a" });
  });

  test("throws on an unrecognized volume", () => {
    expect(() => parseMediaRef("file://bogus/key")).toThrow();
  });

  test("throws on a malformed reference", () => {
    expect(() => parseMediaRef("not-a-ref")).toThrow();
  });
});

describe("mediaRefToUri", () => {
  test("serializes a file ref back to its URI form", () => {
    expect(mediaRefToUri({ kind: "file", volume: "scratch", key: "abc123.m4a" })).toBe("file://scratch/abc123.m4a");
  });
});

describe("resolveFilePath", () => {
  test("joins SCRATCH_DIR with the key for the scratch volume", () => {
    const prev = process.env.SCRATCH_DIR;
    process.env.SCRATCH_DIR = "/tmp/girae-scratch";
    expect(resolveFilePath({ volume: "scratch", key: "abc.m4a" })).toBe("/tmp/girae-scratch/abc.m4a");
    process.env.SCRATCH_DIR = prev;
  });

  test("joins TELEGRAM_BOT_API_DIR with the key for the telegram volume", () => {
    const prev = process.env.TELEGRAM_BOT_API_DIR;
    process.env.TELEGRAM_BOT_API_DIR = "/tmp/girae-telegram";
    expect(resolveFilePath({ volume: "telegram", key: "xyz.m4a" })).toBe("/tmp/girae-telegram/xyz.m4a");
    process.env.TELEGRAM_BOT_API_DIR = prev;
  });

  test("throws if the relevant env var is unset", () => {
    const prev = process.env.SCRATCH_DIR;
    delete process.env.SCRATCH_DIR;
    expect(() => resolveFilePath({ volume: "scratch", key: "abc.m4a" })).toThrow();
    process.env.SCRATCH_DIR = prev;
  });
});

describe("writeScratchFile", () => {
  test("writes bytes under SCRATCH_DIR and returns the file:// URI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "girae-scratch-test-"));
    const prev = process.env.SCRATCH_DIR;
    process.env.SCRATCH_DIR = dir;
    try {
      const uri = await writeScratchFile("hello.txt", new TextEncoder().encode("hi"));
      expect(uri).toBe("file://scratch/hello.txt");
      const written = await readFile(join(dir, "hello.txt"), "utf8");
      expect(written).toBe("hi");
    } finally {
      process.env.SCRATCH_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
