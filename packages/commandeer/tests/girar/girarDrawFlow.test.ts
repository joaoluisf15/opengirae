import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { userCards, cardDrawHistory, categories } from "@girae/database/schemas/cards";
import { eq, and } from "drizzle-orm";
import { rawClient, commandQueue } from "@girae/common/queue";
import { processCallback } from "@girae/common/inbound/callback";

// Must run at module scope, not inside beforeAll - mock.module only affects imports that happen afterward.
const { sentMessages } = mockTelegram();

describe("girar full draw flow (real workers)", () => {
  const fx = new TestFixtures();
  let userId: number;
  let cardId: number;
  let telegramId: string;

  beforeAll(async () => {
    await bootstrapCommandeerWorkers();

    telegramId = `test-girar-drawflow-${Date.now()}`;
    userId = (await fx.user({ displayName: "Test Girar Drawflow", platform: 'telegram', platformId: telegramId })).id;

    const categoryId = (await fx.category({ name: "Test Drawflow Category", emoji: "🧪" })).id;
    await db.update(categories).set({ subcategoriesOnDraw: 1 }).where(eq(categories.id, categoryId));

    const subcategoryId = (await fx.subcategory({ categoryId, name: "Test Drawflow Sub" })).id;
    cardId = (await fx.card({ name: "Test Drawflow Card", subcategoryId })).id;
  });

  afterAll(async () => {
    await rawClient.del(`girar:active:${telegramId}`);
    // the draw itself creates these rows - fx never tracked them, so clean up before fx.cleanup() deletes the user/card.
    await db.delete(cardDrawHistory).where(eq(cardDrawHistory.userId, userId));
    await db.delete(userCards).where(eq(userCards.userId, userId));
    await fx.cleanup();
  });

  const chatId = () => `chat-${telegramId}`;

  test("draws a card, grants it, and records the draw", async () => {
    const startIndex = sentMessages.length;

    await commandQueue.add('executeCommand', fakeCtx({
      name: 'girar',
      authorId: telegramId,
      platform: 'telegram',
      chatId: chatId(),
      workflowID: `wf-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    }));
    await new Promise(resolve => setTimeout(resolve, 1500));

    const categoryPrompt = sentMessages.slice(startIndex).find(m =>
      typeof m.text === 'string' && m.text.includes('Escolha uma categoria'));
    expect(categoryPrompt).toBeDefined();
    const categoryButton = categoryPrompt!.replyMarkup?.inline_keyboard?.flat()
      .find((b: any) => b.text?.includes('Test Drawflow Category'));
    expect(categoryButton).toBeDefined();

    await processCallback(categoryButton!.callback_data, telegramId, `test-click-cat-${Date.now()}`, 'telegram', chatId(), 'cat-msg-id');
    await new Promise(resolve => setTimeout(resolve, 1500));

    const subcategoryPrompt = sentMessages.slice(startIndex).find(m =>
      m.method === 'editMessageText' && typeof m.text === 'string' && m.text.includes('Escolha uma coleção de'));
    expect(subcategoryPrompt).toBeDefined();
    const subcategoryButton = subcategoryPrompt!.replyMarkup?.inline_keyboard?.flat()[0];
    expect(subcategoryButton).toBeDefined();

    await processCallback(subcategoryButton!.callback_data, telegramId, `test-click-sub-${Date.now()}`, 'telegram', chatId(), 'sub-msg-id');
    await new Promise(resolve => setTimeout(resolve, 1500));

    // editMessageMedia bypasses the telegramsjs mock via a raw fetch(), so assert on DB state instead.
    const [ownedCard] = await db.select({ count: userCards.count })
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId)));
    expect(ownedCard?.count).toBe(1);

    const drawHistory = await db.select()
      .from(cardDrawHistory)
      .where(and(eq(cardDrawHistory.userId, userId), eq(cardDrawHistory.cardId, cardId)));
    expect(drawHistory.length).toBe(1);

    const [user] = await db.select({ usedDraws: users.usedDraws }).from(users).where(eq(users.id, userId));
    expect(user?.usedDraws).toBe(1);
  }, 15000);
});
