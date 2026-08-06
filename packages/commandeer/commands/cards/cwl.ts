import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { reply } from '@girae/common/dbos/messaging'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { resolveCardByIdOrName } from '../../services/commandArguments'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const CONFIRM_EVENT = 'cwl:confirm'
const MAX_CARDS = 50

export default class ClearWishlistCommand extends Command {
  static override info = {
    name: 'cwl',
    description: 'Limpa a lista de desejos inteira, ou remove cards específicos dela',
    usage: '/cwl [id ou nome do card]',
    aliases: ['cleanwl'],
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'cardsRaw', type: CommandArgumentType.STRING, nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { cardsRaw?: string }) {
    const viewer = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!viewer) return

    if (!args.cardsRaw) {
      const { total } = await CardsDB.getWishlist(viewer.id, {})
      if (total === 0) {
        await reply(ctx, 'Sua lista de desejos já está vazia.')
        return
      }

      const messageId = await reply(ctx, {
        content: `Limpar sua lista de desejos inteira (**${total}** card${total === 1 ? '' : 's'})? Essa ação não pode ser desfeita.`,
        eventName: CONFIRM_EVENT,
        restricted: 'author',
        options: [{ title: '✅ Confirmar', data: true }, { title: '❌ Cancelar', data: false }],
      })

      const selection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
      const confirmedMessageId = selection?.messageId ?? messageId

      if (!selection?.value) {
        if (confirmedMessageId) await reply(ctx, { content: '❌ Cancelado.', editMessageId: confirmedMessageId })
        return
      }

      await CardsDB.clearWishlist(viewer.id)
      await reply(ctx, { content: `💔 Sua lista de desejos foi limpa (**${total}** card${total === 1 ? '' : 's'} removidos).`, editMessageId: confirmedMessageId })
      return
    }

    const tokens = args.cardsRaw.split(/\s+/).filter(Boolean)

    if (tokens.length === 1 || !tokens.every(t => /^\d+$/.test(t))) {
      const outcome = await resolveCardByIdOrName(args.cardsRaw)
      if (!outcome.ok) {
        await reply(ctx, outcome.message ?? `Uso: \`${this.info.usage}\``)
        return
      }
      const card = outcome.value as { id: number; name: string }
      await CardsDB.removeFromWishlist(viewer.id, card.id)
      await reply(ctx, `💔 **${escapeMarkdown(card.name)}** removido da sua lista de desejos.`)
      return
    }

    if (tokens.length > MAX_CARDS) {
      await reply(ctx, `Você só pode remover até ${MAX_CARDS} cards de uma vez.`)
      return
    }

    const requestedIds = [...new Set(tokens.map(t => parseInt(t, 10)))]
    const removedIds = await CardsDB.removeManyFromWishlist(viewer.id, requestedIds)
    const notOnListIds = requestedIds.filter(id => !removedIds.includes(id))

    if (removedIds.length === 0) {
      await reply(ctx, 'Nenhum desses cards estava na sua lista de desejos.')
      return
    }

    const cards = await CardsDB.getCardsByIds(removedIds)
    const cardsById = new Map(cards.map(c => [c.id, c]))
    const list = removedIds.map(id => {
      const c = cardsById.get(id)
      return c ? `${c.rarityEmoji} \`${c.id}\`. **${escapeMarkdown(c.name)}**` : `\`${id}\``
    }).join('\n')
    const notOnListNote = notOnListIds.length > 0 ? `\n\n⚠️ Não estavam na lista: ${notOnListIds.map(id => `\`${id}\``).join(', ')}` : ''

    await reply(ctx, `💔 **Removidos:**\n${list}${notOnListNote}`)
  }
}
