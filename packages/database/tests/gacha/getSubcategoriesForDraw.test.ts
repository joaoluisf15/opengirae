import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { GachaLogic } from "../../gacha";
import { CardsDB } from "../../cards";

describe("GachaLogic.getSubcategoriesForDraw", () => {
  const fx = new TestFixtures();
  let categoryId: number;
  let primarySubId: number;
  let secondarySubId: number;

  beforeAll(async () => {
    categoryId = (await fx.category({ name: `Test Draw Subs Category ${Date.now()}` })).id;
    primarySubId = (await fx.subcategory({ categoryId, name: "Test Draw Subs Primary" })).id;
    secondarySubId = (await fx.subcategory({ categoryId, name: "Test Draw Subs Secondary" })).id;
    // isSecondary can't be set at creation (CardsDB.createSubcategory has no such param) - it's an
    // admin-panel-only toggle (website/src/routes/admin/subcategories), so flip it via updateSubcategory.
    await CardsDB.updateSubcategory(secondarySubId, { isSecondary: true });
  });

  afterAll(() => fx.cleanup());

  test("excludes secondary subcategories - they're tags for card lookup, not real drawable collections", async () => {
    const subs = await GachaLogic.getSubcategoriesForDraw(categoryId);
    expect(subs.map(s => s.id)).toContain(primarySubId);
    expect(subs.map(s => s.id)).not.toContain(secondarySubId);
  });
});
