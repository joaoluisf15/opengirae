import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures } from "@girae/tests";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { userCards, auctions, auctionBids, subcategoryCompletionRewards } from "@girae/database/schemas/cards";
import { eq, sql } from "drizzle-orm";
import { CardsDB } from "@girae/database/cards";
import { AuctionsDB, type Auction } from "@girae/database/auctions";
import LanceCommand from "../../commands/cards/lance";

mockTelegram();

async function setCoins(userId: number, amount: number) {
  await db.update(users).set({ coins: amount }).where(eq(users.id, userId));
}

async function getCoins(userId: number): Promise<number> {
  return await db.select({ coins: users.coins }).from(users).where(eq(users.id, userId)).then(r => r[0]!.coins);
}

describe("/lance", () => {
  const fx = new TestFixtures();
  let rarityId: number;
  let subcategoryId: number;
  let sellerId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();

    const categoryId = (await fx.category({ name: `Test Lance Cmd Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test Lance Cmd Subcategory" })).id;
    rarityId = (await fx.rarity({ name: `Test Lance Cmd Rarity ${Date.now()}`, auctionBaseValue: 10000 })).id;
    sellerId = (await fx.user({ displayName: "Test Lance Cmd Seller" })).id;
    await setCoins(sellerId, 1_000_000);
  });

  afterAll(async () => {
    await db.delete(auctionBids).where(sql`"auctionId" IN (SELECT id FROM ${auctions} WHERE "sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Lance Cmd%'))`);
    await db.delete(auctions).where(sql`"sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Lance Cmd%')`);
    await db.delete(subcategoryCompletionRewards).where(eq(subcategoryCompletionRewards.subcategoryId, subcategoryId));
    await db.delete(userCards).where(sql`"userId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Lance Cmd%')`);
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

  async function run(workflowID: string, ctx: ReturnType<typeof fakeCtx>, args: { auctionId: number; amountRaw?: string }) {
    return DBOS.startWorkflow(LanceCommand, { workflowID }).execute(ctx, args);
  }

  test("a valid bid debits the bidder and registers as the current bid", async () => {
    const auction = await freshAuction("Test Lance Cmd Card Happy");
    const platformId = 'test-lance-cmd-happy';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder Happy", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const workflowID = `test-lance-happy-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid)], platform: 'telegram', workflowID });
    await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(auction.startingBid) }).then(h => h.getResult());

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(auction.startingBid);
    expect(row?.currentBidderId).toBe(bidderId);
    expect(await getCoins(bidderId)).toBe(1_000_000 - auction.startingBid);
  });

  test("omitting the amount defaults to the current minimum bid, no confirmation needed", async () => {
    const auction = await freshAuction("Test Lance Cmd Card Default");
    const platformId = 'test-lance-cmd-default';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder Default", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const workflowID = `test-lance-default-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id)], platform: 'telegram', workflowID });
    await run(workflowID, ctx, { auctionId: auction.id }).then(h => h.getResult());

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(auction.startingBid);
  });

  test("a below-minimum amount offers the minimum bid; declining leaves the auction untouched", async () => {
    const auction = await freshAuction("Test Lance Cmd Card Low");
    const platformId = 'test-lance-cmd-low';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder Low", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const workflowID = `test-lance-low-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid - 500)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(auction.startingBid - 500) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: false }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBeNull();
    expect(await getCoins(bidderId)).toBe(1_000_000);
  });

  test("accepting the minimum-bid offer places the bid at the minimum", async () => {
    const auction = await freshAuction("Test Lance Cmd Card LowAccept");
    const platformId = 'test-lance-cmd-lowaccept';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder LowAccept", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const workflowID = `test-lance-lowaccept-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid - 500)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(auction.startingBid - 500) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(auction.startingBid);
  });

  test("a decimal amount offers the minimum bid; declining leaves the auction untouched", async () => {
    const auction = await freshAuction("Test Lance Cmd Card Decimal");
    const platformId = 'test-lance-cmd-decimal';
    await fx.user({ displayName: "Test Lance Cmd Bidder Decimal", platform: 'telegram', platformId });

    const workflowID = `test-lance-decimal-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), `${auction.startingBid}.5`], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: `${auction.startingBid}.5` });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: false }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBeNull();
  });

  test("the seller bidding on their own auction is rejected outright, no confirmation shown", async () => {
    const platformId = 'test-lance-cmd-selfbid-seller';
    const ownSellerId = (await fx.user({ displayName: "Test Lance Cmd SelfBid Seller", platform: 'telegram', platformId })).id;
    const cardId = (await fx.card({ name: "Test Lance Cmd Card SelfBid", rarityId, subcategoryId })).id;
    await fx.ownCard(ownSellerId, cardId, 1);
    await CardsDB.setCardTradable(ownSellerId, cardId, true);
    await setCoins(ownSellerId, 1_000_000);
    const created = await AuctionsDB.createAuction(ownSellerId, cardId);
    if (!created.ok) throw new Error('fixture setup failed');

    const workflowID = `test-lance-selfbid-${Bun.randomUUIDv7()}`;
    const selfCtx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(created.auction.id), String(created.auction.startingBid)], platform: 'telegram', workflowID });
    await run(workflowID, selfCtx, { auctionId: created.auction.id, amountRaw: String(created.auction.startingBid) }).then(h => h.getResult());

    const row = await db.select().from(auctions).where(eq(auctions.id, created.auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBeNull();
  });

  test("rebidding as the current top bidder asks for confirmation; accepting raises the bid", async () => {
    const auction = await freshAuction("Test Lance Cmd Card SelfRebid");
    const platformId = 'test-lance-cmd-selfrebid';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder SelfRebid", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const firstWorkflowID = `test-lance-selfrebid-first-${Bun.randomUUIDv7()}`;
    const firstCtx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid)], platform: 'telegram', workflowID: firstWorkflowID });
    await run(firstWorkflowID, firstCtx, { auctionId: auction.id, amountRaw: String(auction.startingBid) }).then(h => h.getResult());

    const higher = auction.startingBid + auction.bidIncrement;
    const workflowID = `test-lance-selfrebid-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(higher)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(higher) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(higher);
    expect(await getCoins(bidderId)).toBe(1_000_000 - higher);
  });

  test("rebidding as the current top bidder, declining the confirmation leaves the bid unchanged", async () => {
    const auction = await freshAuction("Test Lance Cmd Card SelfRebidDecline");
    const platformId = 'test-lance-cmd-selfrebid-decline';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder SelfRebidDecline", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const firstWorkflowID = `test-lance-selfrebid-decline-first-${Bun.randomUUIDv7()}`;
    const firstCtx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid)], platform: 'telegram', workflowID: firstWorkflowID });
    await run(firstWorkflowID, firstCtx, { auctionId: auction.id, amountRaw: String(auction.startingBid) }).then(h => h.getResult());

    const higher = auction.startingBid + auction.bidIncrement;
    const workflowID = `test-lance-selfrebid-decline-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(higher)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(higher) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: false }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(auction.startingBid);
    expect(await getCoins(bidderId)).toBe(1_000_000 - auction.startingBid);
  });

  test("as the current top bidder, an invalid amount asks to fix the value first, then confirms the self-rebid - not the other way round", async () => {
    const auction = await freshAuction("Test Lance Cmd Card SelfRebidInvalid");
    const platformId = 'test-lance-cmd-selfrebid-invalid';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder SelfRebidInvalid", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const firstWorkflowID = `test-lance-selfrebid-invalid-first-${Bun.randomUUIDv7()}`;
    const firstCtx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(auction.startingBid)], platform: 'telegram', workflowID: firstWorkflowID });
    await run(firstWorkflowID, firstCtx, { auctionId: auction.id, amountRaw: String(auction.startingBid) }).then(h => h.getResult());

    // below the new minimum (startingBid + bidIncrement) - invalid, not just "not higher"
    const tooLow = auction.startingBid - 500;
    const workflowID = `test-lance-selfrebid-invalid-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(tooLow)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(tooLow) });

    // first prompt must be "invalid value, use the minimum?" - confirm it
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'lance:confirm');
    // second prompt is now "you're already winning, still want to pay more (the corrected minimum)?"
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'lance:confirm');
    await handle.getResult();

    const minimum = auction.startingBid + auction.bidIncrement;
    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(minimum);
    expect(await getCoins(bidderId)).toBe(1_000_000 - minimum);
  });

  test("a bid above the cap offers to adjust to it; accepting settles the auction at the cap", async () => {
    const auction = await freshAuction("Test Lance Cmd Card AboveCap");
    const platformId = 'test-lance-cmd-abovecap';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder AboveCap", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const tooHigh = auction.capPrice + 500;
    const workflowID = `test-lance-abovecap-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(tooHigh)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(tooHigh) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBe(auction.capPrice);
    expect(row?.status).toBe('sold');
    expect(await getCoins(bidderId)).toBe(1_000_000 - auction.capPrice);
  });

  test("a bid above the cap, declining the adjustment leaves the auction untouched", async () => {
    const auction = await freshAuction("Test Lance Cmd Card AboveCapDecline");
    const platformId = 'test-lance-cmd-abovecap-decline';
    const bidderId = (await fx.user({ displayName: "Test Lance Cmd Bidder AboveCapDecline", platform: 'telegram', platformId })).id;
    await setCoins(bidderId, 1_000_000);

    const tooHigh = auction.capPrice + 500;
    const workflowID = `test-lance-abovecap-decline-${Bun.randomUUIDv7()}`;
    const ctx = fakeCtx({ name: 'lance', authorId: platformId, args: [String(auction.id), String(tooHigh)], platform: 'telegram', workflowID });
    const handle = await run(workflowID, ctx, { auctionId: auction.id, amountRaw: String(tooHigh) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: false }, 'lance:confirm');
    await handle.getResult();

    const row = await db.select().from(auctions).where(eq(auctions.id, auction.id)).then(r => r[0]);
    expect(row?.currentBid).toBeNull();
    expect(await getCoins(bidderId)).toBe(1_000_000);
  });
});
