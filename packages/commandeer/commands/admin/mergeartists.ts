import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class MergeArtistsCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'mergeartists',
    description: 'Funde um artista duplicado em outro, movendo todos os álbuns/singles (staff)',
    usage: '/mergeartists <ID do artista duplicado> <ID do artista a manter>',
    aliases: ['mergeartist', 'mergeart'],
  }

  @CommandArgument([
    { name: 'source', type: CommandArgumentType.DISCOTECA_ARTIST, description: 'ID do artista duplicado (será removido)' },
    { name: 'target', type: CommandArgumentType.DISCOTECA_ARTIST, description: 'ID do artista a manter' },
  ])
  static override async execute(ctx: IncomingCommand, args: { source: { id: number; name: string }; target: { id: number; name: string } }) {
    if (args.source.id === args.target.id) {
      await reply(ctx, 'Os dois IDs são do mesmo artista.')
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    await DiscotecaDB.mergeArtists(args.source.id, args.target.id)
    await AuditDB.log(user.id, 'discoteca.artist.merge', {
      sourceArtistId: args.source.id, sourceName: args.source.name,
      targetArtistId: args.target.id, targetName: args.target.name,
    })

    await reply(ctx, `✅ **${escapeMarkdown(args.source.name)}** (\`${args.source.id}\`) foi fundido em **${escapeMarkdown(args.target.name)}** (\`${args.target.id}\`).`)
  }
}
