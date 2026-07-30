import { test, expect, describe, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { discotecaGenres } from "../../schemas/discoteca";
import { eq } from "drizzle-orm";
import { DiscotecaDB } from "../../discoteca";

describe("DiscotecaDB.createGenre", () => {
  const fx = new TestFixtures();

  afterAll(() => fx.cleanup());

  test("creates a genre with the given name and emoji", async () => {
    const name = `Test Genre Create ${Date.now()}`;
    const created = await DiscotecaDB.createGenre(name, "🎸");
    const id = created!.id;
    fx.onCleanup(async () => { await db.delete(discotecaGenres).where(eq(discotecaGenres.id, id)); });

    expect(created?.name).toBe(name);
    expect(created?.emoji).toBe("🎸");

    const fetched = await DiscotecaDB.getGenreByName(name);
    expect(fetched?.id).toBe(id);
  });

  test("getGenreByName returns undefined for a name that doesn't exist", async () => {
    const fetched = await DiscotecaDB.getGenreByName(`Nonexistent Genre ${Date.now()}`);
    expect(fetched).toBeUndefined();
  });
});
