import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply, deleteMsg } from '@girae/common/dbos/messaging'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const CONFIRM_EVENT = 'marksub:confirm'

export default class MarkSubcategoryCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'marksub',
    description: 'Adiciona um card a uma subcategoria extra, sem alterar a subcategoria principal (staff)',
    usage: '/marksub <ID do card> <ID ou nome da subcategoria>',
    useWorkflow: true
  }

  @DBOS.workflow()
  @CommandArgument([
    { name: 'card', type: CommandArgumentType.CARD },
    { name: 'subcategory', type: CommandArgumentType.SUBCATEGORY },
  ])
  static override async execute(ctx: IncomingCommand, args: { card: NonNullable<Awaited<ReturnType<typeof CardsDB.getCardWithDetails>>>; subcategory: NonNullable<Awaited<ReturnType<typeof CardsDB.getSubcategory>>> }) {
    const { card, subcategory } = args

    const existing = await CardsDB.getCardSubcategoryEntry(card.id, subcategory.id)
    if (existing?.isMain) {
      await reply(ctx, `😅 **${escapeMarkdown(subcategory.name)}** já é a subcategoria principal de **${escapeMarkdown(card.name)}** — não dá pra remover ela por aqui.`)
      return
    }
    const removing = !!existing

    await reply(ctx, {
      content: removing
        ? `Deseja remover **${escapeMarkdown(card.name)}** da subcategoria **${escapeMarkdown(subcategory.name)}**?`
        : `Deseja colocar **${escapeMarkdown(card.name)}** na subcategoria **${escapeMarkdown(subcategory.name)}**?`,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true }, { title: '❌ Cancelar', data: false }],
    })

    const confirmSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (confirmSelection?.messageId) await deleteMsg(ctx, confirmSelection.messageId)
    if (!confirmSelection?.value) return

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    if (removing) {
      await CardsDB.removeCardSubcategory(card.id, subcategory.id)
      await AuditDB.log(user.id, 'card.subcategoryRemove', { cardId: card.id, name: card.name, subcategoryId: subcategory.id, subcategoryName: subcategory.name })
      await reply(ctx, `🃏 **${escapeMarkdown(card.name)}** não pertence mais à subcategoria **${escapeMarkdown(subcategory.name)}**.`)
      return
    }

    await CardsDB.addCardSubcategory(card.id, subcategory.id)
    await AuditDB.log(user.id, 'card.subcategoryAdd', { cardId: card.id, name: card.name, subcategoryId: subcategory.id, subcategoryName: subcategory.name })

    await reply(ctx, `🃏 **${escapeMarkdown(card.name)}** agora também pertence à subcategoria **${escapeMarkdown(subcategory.name)}**.`)
  }
}
