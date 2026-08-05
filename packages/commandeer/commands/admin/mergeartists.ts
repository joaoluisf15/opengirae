import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

const CONFIRM_EVENT = 'mergeartists:confirm'

export default class MergeArtistsCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'mergeartists',
    description: 'Junta um artista duplicado em outro, movendo todos os álbuns/singles (staff)',
    usage: '/mergeartists <ID do artista duplicado> <ID do artista a manter>',
    aliases: ['mergeartist', 'mergeart'],
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([
    { name: 'source', type: CommandArgumentType.DISCOTECA_ARTIST, description: 'ID do artista duplicado (será removido)' },
    { name: 'target', type: CommandArgumentType.DISCOTECA_ARTIST, description: 'ID do artista a manter' },
  ])
  static override async execute(ctx: IncomingCommand, args: { source: { id: number; name: string }; target: { id: number; name: string } }) {
    if (args.source.id === args.target.id) {
      await reply(ctx, 'Os dois IDs são do mesmo artista.')
      return
    }

    const sourceEntries = await DiscotecaDB.getEntriesForArtist(args.source.id, 0)

    const messageId = await reply(ctx, {
      content: `⚠️ Juntar **${escapeMarkdown(args.source.name)}** (\`${args.source.id}\`) em **${escapeMarkdown(args.target.name)}** (\`${args.target.id}\`)?\n\n${sourceEntries.length} álbum(ns)/single(s) serão movidos. \`${args.source.id}\` será apagado. Essa ação não pode ser desfeita.`,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true }, { title: '❌ Cancelar', data: false }],
    })

    const selection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    const confirmedMessageId = selection?.messageId ?? messageId

    if (!selection?.value) {
      if (confirmedMessageId) await reply(ctx, { content: '❌ Junção cancelada.', editMessageId: confirmedMessageId })
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    await DiscotecaDB.mergeArtists(args.source.id, args.target.id)
    await AuditDB.log(user.id, 'discoteca.artist.merge', {
      sourceArtistId: args.source.id, sourceName: args.source.name,
      targetArtistId: args.target.id, targetName: args.target.name,
    })

    await reply(ctx, {
      content: `✅ **${escapeMarkdown(args.source.name)}** (\`${args.source.id}\`) foi juntado a **${escapeMarkdown(args.target.name)}** (\`${args.target.id}\`).`,
      editMessageId: confirmedMessageId,
    })
  }
}
