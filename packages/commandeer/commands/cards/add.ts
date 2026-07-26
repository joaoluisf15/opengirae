import { Command } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { CardsDB } from '@girae/database/cards'
import { modifyTradeOffer, getActiveTradeSide } from './trade'
import type { IncomingCommand } from '@girae/common/commands/types'
import { resolveCardByIdOrName } from '../../services/commandArguments'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const MAX_CARDS = 50

export default class AddCommand extends Command {
  static override info = {
    name: 'add',
    description: 'Adiciona rapidamente uma ou várias cartas à troca em andamento',
    usage: '/add <nome ou ID do personagem> [ID2 ID3 ...]',
    aliases: ['adicionar'],
  }

  static override async execute(ctx: IncomingCommand) {
    const rawArgs = ctx.args.join(' ').trim()
    if (!rawArgs) {
      await reply(ctx, `Uso: \`${this.info.usage}\``)
      return
    }

    const tokens = rawArgs.split(/\s+/).filter(Boolean)

    if (tokens.length === 1 || !tokens.every(t => /^\d+$/.test(t))) {
      const outcome = await resolveCardByIdOrName(rawArgs)
      if (!outcome.ok) {
        await reply(ctx, outcome.message ?? `Uso: \`${this.info.usage}\``)
        return
      }
      const card = outcome.value as { id: number; name: string; imageUrl: string | null }
      const message = await modifyTradeOffer(ctx.message.author.id, ctx.message.platform as 'telegram' | 'discord', card.id, 'add')
      await reply(ctx, { content: message, photoUrl: card.imageUrl ?? undefined })
      return
    }

    if (tokens.length > MAX_CARDS) {
      await reply(ctx, `Você só pode adicionar até ${MAX_CARDS} cartas de uma vez.`)
      return
    }

    const active = await getActiveTradeSide(ctx.message.author.id)
    if (!active) {
      await reply(ctx, 'Você não está em uma troca de cartas...')
      return
    }

    const ids = [...new Set(tokens.map(t => parseInt(t, 10)))]
    const cards = await CardsDB.getCardsByIds(ids)
    const cardsById = new Map(cards.map(c => [c.id, c]))

    const added: string[] = []
    const failed: string[] = []

    for (const id of ids) {
      const card = cardsById.get(id)
      if (!card) {
        failed.push(`\`${id}\`: não encontrei esse card.`)
        continue
      }
      const message = await modifyTradeOffer(ctx.message.author.id, ctx.message.platform as 'telegram' | 'discord', id, 'add')
      if (message === 'Carta adicionada.') added.push(`${card.rarityEmoji} \`${card.id}\`. **${escapeMarkdown(card.name)}**`)
      else failed.push(`${card.rarityEmoji} \`${card.id}\`. **${escapeMarkdown(card.name)}**: ${message}`)
    }

    const parts: string[] = []
    if (added.length > 0) parts.push(`✅ **Adicionadas:**\n${added.join('\n')}`)
    if (failed.length > 0) parts.push(`❌ **Não foi possível adicionar:**\n${failed.join('\n')}`)
    await reply(ctx, parts.join('\n\n'))
  }
}
