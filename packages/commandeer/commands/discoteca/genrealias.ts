import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DiscotecaDB } from '@girae/database/discoteca'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class GenreAliasCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'genrealias',
    description: 'Mapeia uma string de gênero do Apple Music para um gênero cadastrado (staff)',
    usage: '/genrealias <ID ou nome do gênero> <alias>',
  }

  @CommandArgument([
    { name: 'genre', type: CommandArgumentType.DISCOTECA_GENRE, nullable: true },
    { name: 'alias', type: CommandArgumentType.STRING, nullable: true },
  ])
  static override async execute(ctx: IncomingCommand, args: { genre?: NonNullable<Awaited<ReturnType<typeof DiscotecaDB.getGenre>>>; alias?: string }) {
    if (!args.genre) {
      const genres = await DiscotecaDB.getGenres()
      const list = genres.map(g => `🎼 \`${g.id}\`. **${escapeMarkdown(g.name)}**`).join('\n')
      await reply(ctx, `Uso: \`${GenreAliasCommand.info.usage}\`\n\nGêneros cadastrados:\n\n${list}`)
      return
    }
    if (!args.alias) {
      await reply(ctx, `Uso: \`${GenreAliasCommand.info.usage}\``)
      return
    }

    await DiscotecaDB.upsertGenreAlias(args.alias, args.genre.id)
    await reply(ctx, `🎼 Toda vez que "${escapeMarkdown(args.alias)}" aparecer, será tratado como **${escapeMarkdown(args.genre.name)}**.`)
  }
}
