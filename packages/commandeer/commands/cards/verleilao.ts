import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { AuctionsDB } from '@girae/database/auctions'
import { UsersDB } from '@girae/database/users'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { mention } from '@girae/common/utilities/mention'
import { EMOJI } from '../../constants'

const STATUS_LABEL: Record<string, string> = {
  sold: 'Vendido',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

export default class VerLeilaoCommand extends Command {
  static override info = {
    name: 'verleilao',
    description: 'Mostra os detalhes de um leilão',
    usage: '/verleilao <ID do leilão>',
  }

  @CommandArgument([{ name: 'auctionId', type: CommandArgumentType.NUMBER, description: 'ID do leilão' }])
  static override async execute(ctx: IncomingCommand, args: { auctionId: number }) {
    const details = await AuctionsDB.getAuction(args.auctionId)
    if (!details) { await reply(ctx, '🔍 Não encontrei um leilão com esse ID.'); return }
    const { auction, cardName, cardImageUrl, rarityEmoji, sellerName, categoryEmoji, subcategoryName } = details

    const bidLabel = auction.currentBid !== null ? 'Lance atual' : 'Lance inicial'
    const bidAmount = auction.currentBid ?? auction.startingBid

    let topBidderLine = '🏆 **Maior licitante**: _Nenhum lance ainda_'
    if (auction.currentBidderId !== null) {
      const bidder = await UsersDB.getUserById(auction.currentBidderId)
      const bidderName = bidder?.displayName ?? 'alguém'
      const platformId = await UsersDB.getPlatformIdForUser(auction.currentBidderId, ctx.message.platform as 'telegram' | 'discord')
      const bidderDisplay = platformId ? mention(ctx.message.platform as 'telegram' | 'discord', platformId, bidderName) : `**${escapeMarkdown(bidderName)}**`
      topBidderLine = `🏆 **Maior licitante**: \`${auction.currentBidderId}\`. ${bidderDisplay}`
    }

    const timeLine = auction.status === 'active'
      ? `⏳ **__Tempo restante__**: _**${Math.max(0, Math.round((auction.expiresAt.getTime() - Date.now()) / 60000))}min**_`
      : `⏳ **__Estado__**: _**${STATUS_LABEL[auction.status] ?? auction.status}**_`

    const content = [
      `${EMOJI.auction} **Leilão** \`${auction.id}\``,
      '',
      `${rarityEmoji} \`${auction.cardId}\`. **${escapeMarkdown(cardName)}**`,
      `${categoryEmoji} _${escapeMarkdown(subcategoryName)}_`,
      '',
      `👤 **__Vendedor__**: ${escapeMarkdown(sellerName)}`,
      `💰 **__${bidLabel}__**: ${bidAmount} moedas`,
      `🚀 **__Teto__**: ${auction.capPrice} moedas`,
      '',
      topBidderLine,
      timeLine,
    ].join('\n')

    await reply(ctx, { content, photoUrl: cardImageUrl ?? undefined })
  }
}
