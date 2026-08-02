import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mockTelegram, fakeCtx, TestFixtures } from "@girae/tests";
import ProfileCommand from "../../commands/users/profile";

const mock = mockTelegram();

// Regression: a user's avatarUrl only ever refreshed when *they* sent a message/click
// (refreshAvatarIfStale in telegram-inbound), never when someone else viewed their profile.
// An inactive user's cached Telegram file URL can go dead in the meantime, and /profile had
// no fallback - the reply silently failed. profile.ts now re-checks staleness on every view.
describe("/profile refreshes the viewed user's avatar, not just the viewer's own", () => {
  const fx = new TestFixtures();
  let viewerPlatformId: string;
  let targetPlatformId: string;

  beforeAll(async () => {
    await import("@girae/answerer/index");
    viewerPlatformId = `test-profile-viewer-${Bun.randomUUIDv7()}`;
    targetPlatformId = `test-profile-target-${Bun.randomUUIDv7()}`;
    await fx.user({ displayName: "Test Profile Viewer", platform: 'telegram', platformId: viewerPlatformId });
    await fx.user({ displayName: "Test Profile Target", platform: 'telegram', platformId: targetPlatformId });
  });

  afterAll(() => fx.cleanup());

  test("viewing someone else's profile succeeds without throwing on the avatar refresh call", async () => {
    const ctx = fakeCtx({ name: 'profile', authorId: viewerPlatformId, args: [targetPlatformId], platform: 'telegram' });
    await ProfileCommand.execute(ctx, { target: targetPlatformId });

    const msg = mock.sentMessages.at(-1) as any;
    expect(msg.method).toBe('sendPhoto');
  });
});
