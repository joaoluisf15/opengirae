import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { TestFixtures, fakeCtx, mockTelegram, bootstrapCommandeerWorkers } from "@girae/tests";
import { CommandArgumentType, type CommandArgumentSpec } from "@girae/common/commands";
import { db } from "@girae/database/index";
import { discotecaGenreAliases } from "@girae/database/schemas/discoteca";
import { eq } from "drizzle-orm";
import { parseCommandArguments } from "../../services/commandArguments";
import GenreAliasCommand from "../../commands/discoteca/genrealias";

const { sentMessages } = mockTelegram();

const GENRE_SPEC: CommandArgumentSpec[] = [
  { name: 'genre', type: CommandArgumentType.DISCOTECA_GENRE },
  { name: 'alias', type: CommandArgumentType.STRING },
];

describe("/genrealias", () => {
  const fx = new TestFixtures();
  let staffPlatformId: string;
  let genreId: number;
  let genreName: string;

  beforeAll(async () => {
    process.env.PORT = '0';
    await bootstrapCommandeerWorkers();

    staffPlatformId = `test-genrealias-staff-${Date.now()}`;
    await fx.user({ displayName: "Test Genrealias Staff", platform: 'telegram', platformId: staffPlatformId });
    genreName = `TestGenre${Date.now()}`;
    genreId = (await fx.discotecaGenre({ name: genreName })).id;
  });

  afterAll(() => fx.cleanup());

  test("maps a raw alias (with spaces) onto the genre, normalized to lowercase", async () => {
    const alias = "K-Pop Raw String";
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: [genreName, alias], platform: 'telegram' });
    await GenreAliasCommand.execute(ctx, { genre: { id: genreId, name: genreName }, alias });

    const row = await db.select().from(discotecaGenreAliases).where(eq(discotecaGenreAliases.alias, alias.toLowerCase())).then(r => r[0]);
    expect(row?.genreId).toBe(genreId);
    fx.onCleanup(async () => { await db.delete(discotecaGenreAliases).where(eq(discotecaGenreAliases.id, row!.id)); });
  });

  test("resolves the genre argument by numeric ID", async () => {
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: [String(genreId), 'id-alias'], platform: 'telegram' });
    const result = await parseCommandArguments(GENRE_SPEC, ctx.args, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) expect((result.values.genre as { id: number }).id).toBe(genreId);
  });

  test("resolves the genre argument by exact name", async () => {
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: [genreName, 'name-alias'], platform: 'telegram' });
    const result = await parseCommandArguments(GENRE_SPEC, ctx.args, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) expect((result.values.genre as { id: number }).id).toBe(genreId);
  });

  test("a nonexistent genre ID gets a friendly not-found message, listing available genres", async () => {
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: ['999999999', 'some alias'], platform: 'telegram' });
    const result = await parseCommandArguments(GENRE_SPEC, ctx.args, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Gênero não encontrado');
  });

  test("a nonexistent genre name gets the same friendly not-found message, no row created", async () => {
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: ['Nonexistent Genre Xyz', 'some alias'], platform: 'telegram' });
    const result = await parseCommandArguments(GENRE_SPEC, ctx.args, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Gênero não encontrado');

    const rows = await db.select().from(discotecaGenreAliases).where(eq(discotecaGenreAliases.alias, 'some alias'));
    expect(rows.length).toBe(0);
  });

  test("no arguments: shows usage and the list of canonical genres, no row created", async () => {
    sentMessages.length = 0;
    const ctx = fakeCtx({ name: 'genrealias', authorId: staffPlatformId, args: [], platform: 'telegram' });
    await GenreAliasCommand.execute(ctx, { genre: undefined, alias: undefined });

    const last = sentMessages[sentMessages.length - 1]!;
    const text = last.text ?? last.caption ?? '';
    expect(text).toContain('Uso:');
    expect(text).toContain(genreName);
  });
});
