import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures } from "@girae/tests";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { userCards, auctions, auctionBids, subcategoryCompletionRewards } from "@girae/database/schemas/cards";
import { eq, and, sql } from "drizzle-orm";
import { CardsDB } from "@girae/database/cards";
import { AuctionsDB } from "@girae/database/auctions";
import LeiloarCommand from "../../commands/cards/leiloar";

mockTelegram();

async function setCoins(userId: number, amount: number) {
  await db.update(users).set({ coins: amount }).where(eq(users.id, userId));
}

async function ownedCount(userId: number, cardId: number): Promise<number> {
  const row = await db.select({ count: userCards.count }).from(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))).then(r => r[0]);
  return row?.count ?? 0;
}

describe("/leiloar", () => {
  const fx = new TestFixtures();
  let rarityId: number;
  let subcategoryId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();

    const categoryId = (await fx.category({ name: `Test Leilao Cmd Category ${Date.now()}` })).id;
    subcategoryId = (await fx.subcategory({ categoryId, name: "Test Leilao Cmd Subcategory" })).id;
    rarityId = (await fx.rarity({ name: `Test Leilao Cmd Rarity ${Date.now()}`, auctionBaseValue: 10000 })).id;
  });

  afterAll(async () => {
    await db.delete(auctionBids).where(sql`"auctionId" IN (SELECT id FROM ${auctions} WHERE "sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Leilao Cmd%'))`);
    await db.delete(auctions).where(sql`"sellerId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Leilao Cmd%')`);
    await db.delete(subcategoryCompletionRewards).where(eq(subcategoryCompletionRewards.subcategoryId, subcategoryId));
    await db.delete(userCards).where(sql`"userId" IN (SELECT id FROM ${users} WHERE "displayName" LIKE 'Test Leilao Cmd%')`);
    await fx.cleanup();
  });

  test("creating: confirming publishes the auction for free and takes the card out of the seller's collection", async () => {
    const platformId = 'test-leilao-cmd-create';
    const sellerId = (await fx.user({ displayName: "Test Leilao Cmd Create Seller", platform: 'telegram', platformId })).id;
    const cardId = (await fx.card({ name: "Test Leilao Cmd Create Card", rarityId, subcategoryId })).id;
    await fx.ownCard(sellerId, cardId, 1);
    await CardsDB.setCardTradable(sellerId, cardId, true);
    await setCoins(sellerId, 1_000_000);

    const workflowID = `test-leilao-create-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'leiloar', authorId: platformId, args: [String(cardId)], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(LeiloarCommand, { workflowID }).execute(runCtx, { rest: String(cardId) });

    await new Promise(r => setTimeout(r, 500)); // let it reach DBOS.recv and register the listener
    await DBOS.send(workflowID, { value: true }, 'leiloar:confirm');
    await handle.getResult();

    expect(await ownedCount(sellerId, cardId)).toBe(0);
    expect(await db.select({ coins: users.coins }).from(users).where(eq(users.id, sellerId)).then(r => r[0]!.coins)).toBe(1_000_000);
    const [auction] = await db.select().from(auctions).where(eq(auctions.sellerId, sellerId));
    expect(auction?.cardId).toBe(cardId);
    expect(auction?.status).toBe('active');
  });

  test("creating: confirming a card that's not actually owned/tradable creates no auction", async () => {
    const platformId = 'test-leilao-cmd-notowned';
    const sellerId = (await fx.user({ displayName: "Test Leilao Cmd NotOwned Seller", platform: 'telegram', platformId })).id;
    const cardId = (await fx.card({ name: "Test Leilao Cmd NotOwned Card", rarityId, subcategoryId })).id;
    await setCoins(sellerId, 1_000_000);
    // deliberately never gives the seller this card

    const workflowID = `test-leilao-notowned-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'leiloar', authorId: platformId, args: [String(cardId)], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(LeiloarCommand, { workflowID }).execute(runCtx, { rest: String(cardId) });

    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'leiloar:confirm');
    await handle.getResult();

    const created = await db.select().from(auctions).where(eq(auctions.sellerId, sellerId));
    expect(created).toHaveLength(0);
  });

  test("cancelar: confirming voids the auction and returns the card, only for its own seller", async () => {
    const platformId = 'test-leilao-cmd-cancel';
    const sellerId = (await fx.user({ displayName: "Test Leilao Cmd Cancel Seller", platform: 'telegram', platformId })).id;
    const cardId = (await fx.card({ name: "Test Leilao Cmd Cancel Card", rarityId, subcategoryId })).id;
    await fx.ownCard(sellerId, cardId, 1);
    await CardsDB.setCardTradable(sellerId, cardId, true);
    await setCoins(sellerId, 1_000_000);
    const created = await AuctionsDB.createAuction(sellerId, cardId);
    if (!created.ok) throw new Error('fixture setup failed');

    const otherPlatformId = 'test-leilao-cmd-cancel-stranger';
    await fx.user({ displayName: "Test Leilao Cmd Cancel Stranger", platform: 'telegram', platformId: otherPlatformId });

    const strangerWorkflowID = `test-leilao-cancel-stranger-${Bun.randomUUIDv7()}`;
    const strangerCtx = fakeCtx({ name: 'leiloar', authorId: otherPlatformId, args: ['cancelar', String(created.auction.id)], platform: 'telegram', workflowID: strangerWorkflowID });
    await DBOS.startWorkflow(LeiloarCommand, { workflowID: strangerWorkflowID }).execute(strangerCtx, { rest: `cancelar ${created.auction.id}` }).then(h => h.getResult());
    expect((await db.select().from(auctions).where(eq(auctions.id, created.auction.id)))[0]?.status).toBe('active'); // untouched - not the owner, never reaches the confirm step

    const workflowID = `test-leilao-cancel-${Bun.randomUUIDv7()}`;
    const runCtx = fakeCtx({ name: 'leiloar', authorId: platformId, args: ['cancelar', String(created.auction.id)], platform: 'telegram', workflowID });
    const handle = await DBOS.startWorkflow(LeiloarCommand, { workflowID }).execute(runCtx, { rest: `cancelar ${created.auction.id}` });
    await new Promise(r => setTimeout(r, 500));
    await DBOS.send(workflowID, { value: true }, 'leiloar:confirm');
    await handle.getResult();

    expect((await db.select().from(auctions).where(eq(auctions.id, created.auction.id)))[0]?.status).toBe('cancelled');
    expect(await ownedCount(sellerId, cardId)).toBe(1);
  });
});
