import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.searchEntriesByName", () => {
  const fx = new TestFixtures();
  const suffix = Date.now();

  beforeAll(async () => {
    await fx.discotecaEntry({ name: `Café Amargo ${suffix}`, artistName: "Test Artist" });
    await fx.discotecaEntry({ name: `Unrelated Entry ${suffix}` });
  });

  afterAll(() => fx.cleanup());

  test("finds a match ignoring accents and case", async () => {
    const results = await DiscotecaDB.searchEntriesByName(`cafe amargo ${suffix}`);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe(`Café Amargo ${suffix}`);
  });

  test("returns no results for a query that matches nothing", async () => {
    const results = await DiscotecaDB.searchEntriesByName(`totally-nonexistent-${suffix}`);
    expect(results.length).toBe(0);
  });
});
