import { test, expect, describe } from "bun:test";
import { StorefrontDB } from "../../storefront";

describe("StorefrontDB.getState", () => {
  test("reads the singleton row seeded by the storefront migration", async () => {
    const state = await StorefrontDB.getState();
    expect(state.cardIds.length).toBeGreaterThan(0);
    expect(state.cardIds.length).toBeLessThanOrEqual(6);
  });
});
