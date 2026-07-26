import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Loadable } from "../../loaders/base";

class TestLoadable extends Loadable {
  protected readonly label = "test modules";
  load(dirPath: string) {
    return this.importAll(dirPath);
  }
}

describe("Loadable.importAll", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "loadable-test-"));
    mkdirSync(join(dir, "nested", "deep"), { recursive: true });
    writeFileSync(join(dir, "top.ts"), "export default { marker: 'top' }\n");
    writeFileSync(join(dir, "nested", "mid.ts"), "export default { marker: 'mid' }\n");
    writeFileSync(join(dir, "nested", "deep", "leaf.ts"), "export default { marker: 'deep' }\n");
    writeFileSync(join(dir, "nested", ".gitkeep"), "");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("finds .ts files at every nesting depth, returning paths relative to the scanned root, and skips non-.ts files", async () => {
    const entries = await new TestLoadable().load(dir);

    expect(entries.map(e => e.file).sort()).toEqual([
      "top.ts",
      join("nested", "mid.ts"),
      join("nested", "deep", "leaf.ts"),
    ].sort());
  });

  test("imports each file's default export regardless of depth", async () => {
    const entries = await new TestLoadable().load(dir);
    const markers = entries.map(e => e.module.marker).sort();
    expect(markers).toEqual(["deep", "mid", "top"]);
  });
});
