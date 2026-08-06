import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { cards } from "@girae/database/schemas/cards";
import { CardsDB } from "@girae/database/cards";
import { eq } from "drizzle-orm";
import CardCommand, { FALLBACK_IMAGE } from "../../commands/cards/card";

const { sentMessages } = mockTelegram();

async function waitForSentMessage(minLength: number, timeoutMs = 5000): Promise<void> {
  const startTime = Date.now();
  while (sentMessages.length < minLength) {
    if (Date.now() - startTime > timeoutMs) throw new Error(`Timeout waiting for sentMessages.length >= ${minLength}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

describe("/card obscureMode", () => {
  const fx = new TestFixtures();
  const prefix = `Test Obscure Card ${Date.now()}`;
  let cardId: number;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();

    const categoryId = (await fx.category({ name: `${prefix} Category` })).id;
    const subcategoryId = (await fx.subcategory({ categoryId, name: `${prefix} Subcategory` })).id;
    cardId = (await fx.card({ name: `${prefix} Real Name`, subcategoryId })).id;
    await db.update(cards).set({ imageUrl: 'https://cdn.example.com/real-card-art.webp' }).where(eq(cards.id, cardId));
  });

  afterAll(() => fx.cleanup());

  test("obscureMode=true: returns a 64-char alphanumeric name and the placeholder image, never the real card", async () => {
    sentMessages.length = 0;
    const platformId = `test-obscure-${Date.now()}`;
    const userId = (await fx.user({ displayName: "Test Obscure User", platform: 'telegram', platformId })).id;
    await db.update(users).set({ obscureMode: true }).where(eq(users.id, userId));

    const card = (await CardsDB.getCardWithDetails(cardId))!;
    const ctx = fakeCtx({ name: 'card', authorId: platformId, platform: 'telegram', chatId: 'chat-1' });
    await CardCommand.execute(ctx, { card });

    await waitForSentMessage(1);
    const last = sentMessages[sentMessages.length - 1]!;
    const contentStr = last.text || last.content || last.caption || '';

    expect(contentStr).not.toInclude('Real Name');
    const nameMatch = contentStr.match(/<strong>([A-Za-z0-9]+)<\/strong>/);
    expect(nameMatch).not.toBeNull();
    expect(nameMatch![1]!.length).toBe(64);
    expect(last.photo ?? last.photoUrl).toBe(FALLBACK_IMAGE);
  });

  test("obscureMode=false (control): returns the real name and real art", async () => {
    sentMessages.length = 0;
    const platformId = `test-not-obscure-${Date.now()}`;
    await fx.user({ displayName: "Test Normal User", platform: 'telegram', platformId });

    const card = (await CardsDB.getCardWithDetails(cardId))!;
    const ctx = fakeCtx({ name: 'card', authorId: platformId, platform: 'telegram', chatId: 'chat-1' });
    await CardCommand.execute(ctx, { card });

    await waitForSentMessage(1);
    const last = sentMessages[sentMessages.length - 1]!;
    const contentStr = last.text || last.content || last.caption || '';

    expect(contentStr).toInclude('Real Name');
    expect(last.photo ?? last.photoUrl).toBe('https://cdn.example.com/real-card-art.webp');
  });
});
