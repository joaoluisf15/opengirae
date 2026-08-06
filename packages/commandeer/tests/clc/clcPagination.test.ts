import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { userCards } from "@girae/database/schemas/cards";
import { buildFilterArg } from "@girae/common/utilities/pageFilters";
import { eq } from "drizzle-orm";
import CollectionCommand from "../../commands/cards/clc";

mockTelegram();

describe("/clc pagination and filtering (server-side, not a full-subcategory fetch)", () => {
  const fx = new TestFixtures();
  let userId: number;
  let platformId: string;
  let subcategoryId: number;

  beforeAll(async () => {
    platformId = `test-clc-page-${Date.now()}`;
    userId = (await fx.user({ displayName: "Test Clc Page", platform: 'telegram', platformId })).id;
    const categoryId = (await fx.category({ name: `Test Clc Page Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test Clc Page Subcategory" })).id;

    const ownedIds: number[] = [];
    for (let i = 0; i < 25; i++) ownedIds.push((await fx.card({ name: `Clc Page Owned ${i}`, subcategoryId })).id);
    for (let i = 0; i < 5; i++) await fx.card({ name: `Clc Page Missing ${i}`, subcategoryId });

    await db.insert(userCards).values(ownedIds.map(cardId => ({ userId, cardId, count: 1 })));
    fx.onCleanup(async () => { await db.delete(userCards).where(eq(userCards.userId, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("page 0 shows the first 20 of 30 cards and reports hasNext/totalPages correctly", async () => {
    const arg = buildFilterArg([], String(subcategoryId));
    const page = await CollectionCommand.clcPage(arg, 0, platformId, 'telegram');
    expect(page).not.toBeNull();
    expect(page!.totalPages).toBe(2);
    expect(page!.hasNext).toBe(true);
    expect(page!.content).toContain('30');
  });

  test("page 1 shows the remaining 10 cards and reports hasNext: false", async () => {
    const arg = buildFilterArg([], String(subcategoryId));
    const page = await CollectionCommand.clcPage(arg, 1, platformId, 'telegram');
    expect(page).not.toBeNull();
    expect(page!.totalPages).toBe(2);
    expect(page!.hasNext).toBe(false);
  });

  test("the owned-only filter (id 1) narrows totalPages to just the 25 owned cards, without affecting the overall total shown", async () => {
    const arg = buildFilterArg(['1'], String(subcategoryId));
    const page = await CollectionCommand.clcPage(arg, 0, platformId, 'telegram');
    expect(page).not.toBeNull();
    expect(page!.totalPages).toBe(2); // ceil(25/20)
    expect(page!.content).toContain('30'); // total in subcategory is still 30, unaffected by the filter
    expect(page!.content).toContain('`25` resultados');
  });

  test("combining owned+missing (contradictory) short-circuits to an empty page instead of erroring", async () => {
    const arg = buildFilterArg(['1', '2'], String(subcategoryId));
    const page = await CollectionCommand.clcPage(arg, 0, platformId, 'telegram');
    expect(page).not.toBeNull();
    expect(page!.totalPages).toBe(1);
    expect(page!.content).toContain('Nenhum card para mostrar');
  });
});
