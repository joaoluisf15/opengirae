import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type MediaRef =
  | { kind: "http"; url: string }
  | { kind: "file"; volume: "scratch" | "telegram"; key: string };

const FILE_REF_RE = /^file:\/\/(scratch|telegram)\/(.+)$/;

export function parseMediaRef(raw: string): MediaRef {
  if (raw.startsWith("https://") || raw.startsWith("http://")) return { kind: "http", url: raw };

  const match = raw.match(FILE_REF_RE);
  if (!match) throw new Error(`parseMediaRef: unrecognized media reference: ${raw}`);
  return { kind: "file", volume: match[1] as "scratch" | "telegram", key: match[2]! };
}

export function mediaRefToUri(ref: MediaRef): string {
  if (ref.kind === "http") return ref.url;
  return `file://${ref.volume}/${ref.key}`;
}

const VOLUME_ENV: Record<"scratch" | "telegram", string> = {
  scratch: "SCRATCH_DIR",
  telegram: "TELEGRAM_BOT_API_DIR",
};

export function resolveFilePath(ref: { volume: "scratch" | "telegram"; key: string }): string {
  const envVar = VOLUME_ENV[ref.volume];
  const dir = process.env[envVar];
  if (!dir) throw new Error(`resolveFilePath: ${envVar} is not set`);
  return join(dir, ref.key);
}

export async function writeScratchFile(key: string, bytes: Uint8Array): Promise<string> {
  const path = resolveFilePath({ volume: "scratch", key });
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, bytes);
  return mediaRefToUri({ kind: "file", volume: "scratch", key });
}
