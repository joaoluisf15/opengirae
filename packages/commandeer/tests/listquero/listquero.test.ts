import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures, fakeCtx, mockTelegram } from "@girae/tests";
import { db } from "@girae/database/index";
import { subcategoryGoals } from "@girae/database/schemas/cards";
import { eq } from "drizzle-orm";
import { CardsDB } from "@girae/database/cards";
import ListQueroCommand, { renderPage } from "../../commands/cards/listquero";

mockTelegram();

describe("/listquero with no favorites", () => {
  const fx = new TestFixtures();
  const authorId = `test-listquero-empty-${Date.now()}`;

  beforeAll(async () => {
    await fx.user({ displayName: "Test Listquero Empty", platform: 'telegram', platformId: authorId });
  });

  afterAll(() => fx.cleanup());

  test("shows the empty-state message, no photo, no pagination", async () => {
    const page = await renderPage(0, authorId, 'telegram');
    expect(page?.content).toContain('_Nenhuma coleção encontrada._');
    expect(page?.photoUrl).toBeUndefined();
    expect(page?.hasNext).toBe(false);
    expect(page?.totalPages).toBe(1);
  });

  test("execute() doesn't throw", async () => {
    await import("@girae/answerer/index");
    const ctx = fakeCtx({ name: 'listquero', authorId, platform: 'telegram' });
    await expect(ListQueroCommand.execute(ctx)).resolves.toBeUndefined();
  });
});

describe("/listquero pagination and banner", () => {
  const fx = new TestFixtures();
  const authorId = `test-listquero-many-${Date.now()}`;
  let userId: number;
  let categoryId: number;
  let firstSubcategoryId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Listquero Many", platform: 'telegram', platformId: authorId })).id;
    categoryId = (await fx.category({ name: `Test Listquero Category ${Date.now()}` })).id;

    for (let i = 0; i < 12; i++) {
      const sub = await fx.subcategory({ categoryId, name: `Test Listquero Sub ${i}` });
      if (i === 0) {
        firstSubcategoryId = sub.id;
        await CardsDB.updateSubcategory(sub.id, { imageUrl: 'https://example.com/first-banner.png' });
      }
      await CardsDB.addToGoals(userId, sub.id);
      // keep insertion order stable (getGoals orders by createdAt)
      await new Promise(r => setTimeout(r, 5));
    }

    fx.onCleanup(async () => { await db.delete(subcategoryGoals).where(eq(subcategoryGoals.userId, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("page 0 lists the first 10, has a next page, and shows the first-ever favorite's banner", async () => {
    const page = await renderPage(0, authorId, 'telegram');
    expect(page?.content.match(/`\d+`\. \*\*/g)).toHaveLength(10);
    expect(page?.content).toContain(`\`${firstSubcategoryId}\`. **Test Listquero Sub 0**`);
    expect(page?.hasNext).toBe(true);
    expect(page?.totalPages).toBe(2);
    expect(page?.photoUrl).toBe('https://example.com/first-banner.png');
  });

  test("page 1 lists the remaining 2 and keeps the same banner as page 0", async () => {
    const page = await renderPage(1, authorId, 'telegram');
    expect(page?.content.match(/`\d+`\. \*\*/g)).toHaveLength(2);
    expect(page?.hasNext).toBe(false);
    expect(page?.photoUrl).toBe('https://example.com/first-banner.png');
  });
});

describe("/listquero without a banner", () => {
  const fx = new TestFixtures();
  const authorId = `test-listquero-nobanner-${Date.now()}`;
  let userId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Listquero No Banner", platform: 'telegram', platformId: authorId })).id;
    const categoryId = (await fx.category({ name: `Test Listquero No Banner Category ${Date.now()}` })).id;
    const sub = await fx.subcategory({ categoryId, name: "Nome*Estranho" });
    await CardsDB.addToGoals(userId, sub.id);

    fx.onCleanup(async () => { await db.delete(subcategoryGoals).where(eq(subcategoryGoals.userId, userId)); });
  });

  afterAll(() => fx.cleanup());

  test("omits the photo when the collection has no banner, and escapes markdown in the name", async () => {
    const page = await renderPage(0, authorId, 'telegram');
    expect(page?.photoUrl).toBeUndefined();
    expect(page?.content).toContain('Nome\\*Estranho');
  });
});
