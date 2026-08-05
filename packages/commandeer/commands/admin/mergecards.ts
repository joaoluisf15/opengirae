import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

const CONFIRM_EVENT = 'mergecards:confirm'

type CardDetails = NonNullable<Awaited<ReturnType<typeof CardsDB.getCardWithDetails>>>

export default class MergeCardsCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'mergecards',
    description: 'Junta um card duplicado em outro, movendo todas as cópias/desejos/histórico (staff)',
    usage: '/mergecards <ID do card duplicado> <ID do card a manter>',
    aliases: ['mergecard'],
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([
    { name: 'source', type: CommandArgumentType.CARD, description: 'ID do card duplicado (será removido)' },
    { name: 'target', type: CommandArgumentType.CARD, description: 'ID do card a manter' },
  ])
  static override async execute(ctx: IncomingCommand, args: { source: CardDetails; target: CardDetails }) {
    if (args.source.id === args.target.id) {
      await reply(ctx, 'Os dois IDs são do mesmo card.')
      return
    }

    const messageId = await reply(ctx, {
      content: `⚠️ Juntar **${escapeMarkdown(args.source.name)}** (\`${args.source.id}\`) em **${escapeMarkdown(args.target.name)}** (\`${args.target.id}\`)?\n\nTodas as cópias, desejos e histórico serão movidos. \`${args.source.id}\` será apagado. Essa ação não pode ser desfeita.`,
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

    await CardsDB.mergeCards(args.source.id, args.target.id)
    await AuditDB.log(user.id, 'card.merge', {
      sourceCardId: args.source.id, sourceName: args.source.name,
      targetCardId: args.target.id, targetName: args.target.name,
    })

    await reply(ctx, {
      content: `✅ **${escapeMarkdown(args.source.name)}** (\`${args.source.id}\`) foi juntado a **${escapeMarkdown(args.target.name)}** (\`${args.target.id}\`).`,
      editMessageId: confirmedMessageId,
    })
  }
}
