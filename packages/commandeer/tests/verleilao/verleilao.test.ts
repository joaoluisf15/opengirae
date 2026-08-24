import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { userCards, auctions, auctionBids, subcategoryCompletionRewards } from "@girae/database/schemas/cards";
import { eq, sql } from "drizzle-orm";
import { CardsDB } from "@girae/database/cards";
import { AuctionsDB, type Auction } from "@girae/database/auctions";
import VerLeilaoCommand from "../../commands/cards/verleilao";

mockTelegram();

async function setCoins(userId: number, amount: number) {
  await db.update(users).set({ coins: amount }).where(eq(users.id, userId));
}

describe("/verleilao", () => {
  const fx = new TestFixtures();
  let rarityId: number;
  let subcategoryId: number;
  let sellerId: number;

  beforeAll(async () => {
    await import("@girae/answerer/index");

    const categoryId = (await fx.category({ name: `Test VerLeilao Cmd Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test VerLeilao Cmd Subcategory" })).id;
    rarityId = (await fx.rarity({ name: `Test VerLeilao Cmd Rarity ${Date.now()}`, auctionBaseValue: 10000 })).id;
    sellerId = (await fx.user({ displayName: "Test VerLeilao Cmd Seller" })).id;
    await setCoins(sellerId, 1_000_000);
  });

  afterAll(async () => {
    await db.delete(auctionBids).where(sql`"auctionId" IN (SELECT id FROM ${auctions} WHERE "sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test VerLeilao Cmd%'))`);
    await db.delete(auctions).where(sql`"sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test VerLeilao Cmd%')`);
    await db.delete(subcategoryCompletionRewards).where(eq(subcategoryCompletionRewards.subcategoryId, subcategoryId));
    await db.delete(userCards).where(sql`"userId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test VerLeilao Cmd%')`);
    await fx.cleanup();
  });

  async function freshAuction(cardName: string): Promise<Auction> {
    const cardId = (await fx.card({ name: cardName, rarityId, subcategoryId })).id;
    await fx.ownCard(sellerId, cardId, 1);
    await CardsDB.setCardTradable(sellerId, cardId, true);
    const result = await AuctionsDB.createAuction(sellerId, cardId);
    if (!result.ok) throw new Error(`fixture setup failed: ${result.reason}`);
    return result.auction;
  }

  test("replies without throwing for an auction with no bids yet", async () => {
    const auction = await freshAuction("Test VerLeilao Cmd Card NoBids");
    const ctx = fakeCtx({ name: 'verleilao', authorId: 'test-verleilao-nobids', args: [String(auction.id)], platform: 'telegram' });
    await VerLeilaoCommand.execute(ctx, { auctionId: auction.id });
  });

  test("replies without throwing for an auction with a current bidder", async () => {
    const auction = await freshAuction("Test VerLeilao Cmd Card WithBid");
    const bidderId = (await fx.user({ displayName: "Test VerLeilao Cmd Bidder", platform: 'telegram', platformId: 'test-verleilao-bidder' })).id;
    await setCoins(bidderId, 1_000_000);
    const bid = await AuctionsDB.placeBid(auction.id, bidderId, auction.startingBid);
    expect(bid.ok).toBe(true);

    const ctx = fakeCtx({ name: 'verleilao', authorId: 'test-verleilao-withbid', args: [String(auction.id)], platform: 'telegram' });
    await VerLeilaoCommand.execute(ctx, { auctionId: auction.id });
  });

  test("replies without throwing for a resolved (non-active) auction", async () => {
    const auction = await freshAuction("Test VerLeilao Cmd Card Resolved");
    const closed = await AuctionsDB.forceCloseAuction(auction.id);
    expect(closed.ok).toBe(true);

    const ctx = fakeCtx({ name: 'verleilao', authorId: 'test-verleilao-resolved', args: [String(auction.id)], platform: 'telegram' });
    await VerLeilaoCommand.execute(ctx, { auctionId: auction.id });
  });

  test("replies without throwing for a nonexistent auction id", async () => {
    const ctx = fakeCtx({ name: 'verleilao', authorId: 'test-verleilao-missing', args: ['999999999'], platform: 'telegram' });
    await VerLeilaoCommand.execute(ctx, { auctionId: 999999999 });
  });
});
