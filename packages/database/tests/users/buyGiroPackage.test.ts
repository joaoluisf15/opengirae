import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { users } from "../../schemas/users";
import { eq } from "drizzle-orm";
import { UsersDB, GIRO_PACKAGE_TIERS } from "../../users";
import { EconomyDB } from "../../economy";

describe("UsersDB.buyGiroPackage", () => {
  const fx = new TestFixtures();
  let userId: number;

  beforeAll(async () => {
    userId = (await fx.user({ displayName: "Test Buy Giro Package" })).id;
    await db.update(users).set({ coins: 15000, usedDraws: 5, giroPackagesBoughtToday: 0 }).where(eq(users.id, userId));
  });

  afterAll(() => fx.cleanup());

  test("a successful purchase spends coins, grants draws, advances the tier, and credits the treasury", async () => {
    const before = await EconomyDB.getState();
    const tier = GIRO_PACKAGE_TIERS[0]!;

    const result = await UsersDB.buyGiroPackage(userId, 0, tier.price, tier.giros);
    expect(result.ok).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.coins).toBe(15000 - tier.price);
    expect(user!.usedDraws).toBe(5 - tier.giros);
    expect(user!.giroPackagesBoughtToday).toBe(1);
    expect(user!.treasuryContributed).toBe(tier.price);

    const after = await EconomyDB.getState();
    expect(after.treasuryBalance - before.treasuryBalance).toBe(tier.price);
  });

  test("insufficient funds leaves every counter untouched", async () => {
    await db.update(users).set({ coins: 100, giroPackagesBoughtToday: 1 }).where(eq(users.id, userId));
    const before = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]!);
    const beforeEconomy = await EconomyDB.getState();
    const tier = GIRO_PACKAGE_TIERS[1]!; // price 20000, more than the 100 coins set above

    const result = await UsersDB.buyGiroPackage(userId, 1, tier.price, tier.giros);
    expect(result.ok).toBe(false);

    const after = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]!);
    expect(after.coins).toBe(before.coins);
    expect(after.usedDraws).toBe(before.usedDraws);
    expect(after.giroPackagesBoughtToday).toBe(before.giroPackagesBoughtToday);
    expect((await EconomyDB.getState()).treasuryBalance).toBe(beforeEconomy.treasuryBalance);
  });

  test("a stale tier index (someone already bought this slot) is rejected without touching coins", async () => {
    await db.update(users).set({ coins: 999999, giroPackagesBoughtToday: 2 }).where(eq(users.id, userId));
    const before = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]!);
    const tier = GIRO_PACKAGE_TIERS[1]!; // stale: actual tier is now 2, we pass expectedTierIndex 1

    const result = await UsersDB.buyGiroPackage(userId, 1, tier.price, tier.giros);
    expect(result.ok).toBe(false);

    const after = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]!);
    expect(after.coins).toBe(before.coins);
    expect(after.giroPackagesBoughtToday).toBe(before.giroPackagesBoughtToday);
  });

  test("concurrent purchases against the same tier slot: exactly one wins", async () => {
    await db.update(users).set({ coins: 999999, giroPackagesBoughtToday: 3 }).where(eq(users.id, userId));
    const tier = GIRO_PACKAGE_TIERS[3]!;

    const [a, b] = await Promise.all([
      UsersDB.buyGiroPackage(userId, 3, tier.price, tier.giros),
      UsersDB.buyGiroPackage(userId, 3, tier.price, tier.giros),
    ]);

    const wins = [a, b].filter(r => r.ok).length;
    expect(wins).toBe(1);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.giroPackagesBoughtToday).toBe(4); // only advanced once
  });
});
