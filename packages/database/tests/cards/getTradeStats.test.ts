import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { TestFixtures } from "@girae/tests";
import { db } from "../../index";
import { trades } from "../../schemas/cards";
import { CardsDB } from "../../cards";

describe("CardsDB.getTradeStats", () => {
  const fx = new TestFixtures();
  let mainUserId: number;
  let partnerIds: number[] = [];
  const insertedTradeIds: number[] = [];

  beforeAll(async () => {
    mainUserId = (await fx.user({ displayName: "Test Trade Stats Main" })).id;
    for (let i = 0; i < 6; i++) {
      partnerIds.push((await fx.user({ displayName: `Test Trade Stats Partner ${i}` })).id);
    }

    // 7 initiated trades across 6 partners (uneven counts) - only the top 5 should ever show
    const initiatedWith = [partnerIds[0]!, partnerIds[0]!, partnerIds[1]!, partnerIds[2]!, partnerIds[3]!, partnerIds[4]!, partnerIds[5]!];
    for (const partnerId of initiatedWith) {
      const [row] = await db.insert(trades).values({ user1Id: mainUserId, user2Id: partnerId, cardsUser1: [], cardsUser2: [] }).returning();
      insertedTradeIds.push(row!.id);
    }

    // mainUserId receives 1 trade from partner 0
    const [received] = await db.insert(trades).values({ user1Id: partnerIds[0]!, user2Id: mainUserId, cardsUser1: [], cardsUser2: [] }).returning();
    insertedTradeIds.push(received!.id);
  });

  afterAll(async () => {
    for (const id of insertedTradeIds) await db.delete(trades).where(eq(trades.id, id));
    await fx.cleanup();
  });

  test("counts initiated and received separately", async () => {
    const stats = await CardsDB.getTradeStats(mainUserId);
    expect(stats.initiated).toBe(7);
    expect(stats.received).toBe(1);
  });

  test("topGiven is capped at 5, ordered by count desc, partner 0 (2 trades) first", async () => {
    const stats = await CardsDB.getTradeStats(mainUserId);
    expect(stats.topGiven.length).toBe(5);
    expect(stats.topGiven[0]).toMatchObject({ partnerId: partnerIds[0], count: 2 });
  });

  test("a user with zero trades gets zeroed counts and empty top lists", async () => {
    const loneUserId = (await fx.user({ displayName: "Test Trade Stats Lone" })).id;
    const stats = await CardsDB.getTradeStats(loneUserId);
    expect(stats).toEqual({ initiated: 0, received: 0, topGiven: [], topReceived: [] });
  });
});
