import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, bootstrapCommandeerWorkers, fakeCtx, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { eq } from "drizzle-orm";
import { executeCommand } from "../../services/commands";

const { sentMessages } = mockTelegram();

async function waitForSentMessage(minLength: number, timeoutMs = 5000): Promise<void> {
  const startTime = Date.now();
  while (sentMessages.length < minLength) {
    if (Date.now() - startTime > timeoutMs) throw new Error(`Timeout waiting for sentMessages.length >= ${minLength}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

describe("banned users are blocked from every command, not just trade/doar", () => {
  const fx = new TestFixtures();

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();
  });

  afterAll(() => fx.cleanup());

  test("a banned user running an unrelated command (/card) gets the ban message instead of the command running", async () => {
    sentMessages.length = 0;
    const platformId = `test-banned-${Date.now()}`;
    const userId = (await fx.user({ displayName: "Test Banned User", platform: 'telegram', platformId })).id;
    await db.update(users).set({ isBanned: true, banMessage: 'Você foi banido por extração de dados.' }).where(eq(users.id, userId));

    const ctx = fakeCtx({ name: 'card', authorId: platformId, platform: 'telegram', chatId: 'chat-1', args: ['1'] });
    await executeCommand(ctx);

    await waitForSentMessage(1);
    const last = sentMessages[sentMessages.length - 1]!;
    const contentStr = last.text || last.content || last.caption || '';
    expect(contentStr).toInclude('Você foi banido por extração de dados.');
  });

  test("a banned user without a custom banMessage gets the default ban text", async () => {
    sentMessages.length = 0;
    const platformId = `test-banned-default-${Date.now()}`;
    const userId = (await fx.user({ displayName: "Test Banned User Default", platform: 'telegram', platformId })).id;
    await db.update(users).set({ isBanned: true }).where(eq(users.id, userId));

    const ctx = fakeCtx({ name: 'card', authorId: platformId, platform: 'telegram', chatId: 'chat-1', args: ['1'] });
    await executeCommand(ctx);

    await waitForSentMessage(1);
    const last = sentMessages[sentMessages.length - 1]!;
    const contentStr = last.text || last.content || last.caption || '';
    expect(contentStr).toInclude('banido');
  });

  test("/start still works for a banned user (so they can at least see the bot respond)", async () => {
    sentMessages.length = 0;
    const platformId = `test-banned-start-${Date.now()}`;
    const userId = (await fx.user({ displayName: "Test Banned Start User", platform: 'telegram', platformId })).id;
    await db.update(users).set({ isBanned: true, banMessage: 'banido!' }).where(eq(users.id, userId));

    const ctx = fakeCtx({ name: 'start', authorId: platformId, platform: 'telegram', chatId: 'chat-1' });
    await executeCommand(ctx);

    await waitForSentMessage(1);
    const last = sentMessages[sentMessages.length - 1]!;
    const contentStr = last.text || last.content || last.caption || '';
    expect(contentStr).not.toInclude('banido!');
  });
});
