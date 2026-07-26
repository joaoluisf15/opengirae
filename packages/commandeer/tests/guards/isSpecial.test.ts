import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { fakeCtx, TestFixtures } from "@girae/tests";
import { db } from "@girae/database/index";
import { users } from "@girae/database/schemas/users";
import { eq } from "drizzle-orm";
import { guards } from "../../services/guards";

describe("guards.isSpecial", () => {
  const fx = new TestFixtures();
  let specialPlatformId: string, specialUserId: number;
  let plainPlatformId: string;

  beforeAll(async () => {
    specialPlatformId = `test-isSpecial-special-${Bun.randomUUIDv7()}`;
    specialUserId = (await fx.user({ displayName: "Test Special", platform: 'telegram', platformId: specialPlatformId })).id;
    await db.update(users).set({ specialUser: true }).where(eq(users.id, specialUserId));

    plainPlatformId = `test-isSpecial-plain-${Bun.randomUUIDv7()}`;
    await fx.user({ displayName: "Test Plain", platform: 'telegram', platformId: plainPlatformId });
  });

  afterAll(() => fx.cleanup());

  function ctx(authorId: string) {
    return fakeCtx({ name: 'doar', authorId, platform: 'telegram' });
  }

  test("passes for a user with specialUser: true", async () => {
    expect(await guards.isSpecial!(ctx(specialPlatformId))).toBe(true);
  });

  test("fails for a user with specialUser: false", async () => {
    expect(await guards.isSpecial!(ctx(plainPlatformId))).toBe(false);
  });

  test("fails for a user who's never used the bot", async () => {
    expect(await guards.isSpecial!(ctx(`test-isSpecial-nonexistent-${Bun.randomUUIDv7()}`))).toBe(false);
  });
});
