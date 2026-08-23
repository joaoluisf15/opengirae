import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { reply, deleteMsg } from '@girae/common/dbos/messaging'
import { UsersDB } from '@girae/database/users'
import { AuctionsDB, computeMinimumBid } from '@girae/database/auctions'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const CONFIRM_EVENT = 'lance:confirm'

// fallback if placeBid still fails after the interactive corrections below (e.g. someone else bid higher while a confirm dialog was open).
function bidFailureMessage(reason: string, capPrice: number, minimum: number): string {
  switch (reason) {
    case 'not_found': return '❌ **Leilão não encontrado!**'
    case 'not_active': return '⏳ Este leilão já não está ativo.'
    case 'expired': return '_Lance cancelado_'
    case 'self_bid': return 'Você não pode dar lance no seu próprio leilão... Está tentando dar o golpe? 😂'
    case 'self_rebid': return '❌ **Lance extra cancelado!**'
    case 'insufficient_coins': return '💸 Moedas insuficientes! E vamos de `/daily`, `/del` ou `/pix`?'
    case 'not_a_valid_step':
    case 'below_minimum':
      return `⚠️ **Valor invalido!** O lance mínimo agora é de **${minimum} moedas**.`
    case 'above_cap':
      return `⚠️ **Valor Acima do Teto!** O valor máximo é de **${capPrice} moedas**.`
    case 'auctions_disabled': return '🔨 Os leilões estão temporariamente desativados.'
    default: return '😅 Não deu pra registrar seu lance.'
  }
}

export default class LanceCommand extends Command {
  static override info = {
    name: 'lance',
    description: 'Dá um lance num leilão de card',
    usage: '/lance <ID do leilão> [valor]',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([
    { name: 'auctionId', type: CommandArgumentType.NUMBER, description: 'ID do leilão' },
    { name: 'amountRaw', type: CommandArgumentType.STRING, description: 'Valor do lance, em moedas (opcional - usa o lance mínimo se omitido)', nullable: true },
  ])
  static override async execute(ctx: IncomingCommand, args: { auctionId: number; amountRaw?: string }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const details = await AuctionsDB.getAuction(args.auctionId)
    if (!details) { await reply(ctx, '❌ **Leilão não encontrado!**'); return }
    if (details.auction.status !== 'active') { await reply(ctx, '⏳ Este leilão já não está ativo.'); return }
    if (details.auction.sellerId === user.id) { await reply(ctx, 'Você não pode dar lance no seu próprio leilão... Está tentando dar o golpe? 😂'); return }

    const minimum = computeMinimumBid(details.auction)

    // no amount given -> use the current minimum directly, no confirmation needed
    let amount: number
    if (args.amountRaw === undefined || args.amountRaw === null) {
      amount = minimum
    } else if (!/^\d+$/.test(args.amountRaw.trim())) {
      if (!await LanceCommand.confirm(ctx, `⚠️ **Valor invalido!** Quer que eu coloque o menor lance possível? (**${minimum} moedas**)`)) {
        await reply(ctx, '❌ **Lance cancelado!**')
        return
      }
      amount = minimum
    } else {
      amount = parseInt(args.amountRaw, 10)
    }

    // validate/correct the amount before the self-rebid confirm, so an invalid amount doesn't get quoted as a legitimate raise and then immediately re-flagged.
    if (amount % details.auction.bidIncrement !== 0 || amount < minimum) {
      if (!await LanceCommand.confirm(ctx, `⚠️ **Valor invalido!** Quer que eu coloque o menor lance possível? (**${minimum} moedas**)`)) {
        await reply(ctx, '❌ **Lance cancelado!**')
        return
      }
      amount = minimum
    }

    if (amount > details.auction.capPrice) {
      if (!await LanceCommand.confirm(ctx, `⚠️ **Valor Acima do Teto!** O valor máximo é de **${details.auction.capPrice} moedas**. Deseja ajustar o seu lance para o teto?`)) {
        await reply(ctx, '❌ **Lance cancelado!**')
        return
      }
      amount = details.auction.capPrice
    }

    let allowSelfRebid = false
    if (details.auction.currentBidderId === user.id) {
      if (!await LanceCommand.confirm(ctx, `💸 **Confirmar Lance Maior**\n\nVocê já é o maior licitante! Tem certeza de que quer pagar mais **${amount} moedas** neste leilão?`)) {
        await reply(ctx, '❌ **Lance extra cancelado!**')
        return
      }
      allowSelfRebid = true
    }

    const result = await AuctionsDB.placeBid(args.auctionId, user.id, amount, { allowSelfRebid })
    if (!result.ok) {
      await reply(ctx, bidFailureMessage(result.reason, details.auction.capPrice, minimum))
      return
    }

    if (result.settled) {
      await reply(ctx, [
        '🚀 **Teto Atingido!**',
        '',
        `🔨 Com o lance de **${amount} moedas**, você alcançou o valor máximo e arrematou o leilão \`${args.auctionId}\`!`,
        '',
        `🎉 **Parabéns!** ${details.rarityEmoji} **${escapeMarkdown(details.cardName)}** **agora é sua**!`,
      ].join('\n'))
      return
    }

    await reply(ctx, [
      '🔨 **Lance Registrado!**',
      '',
      `Você deu um lance de **${amount} moedas** no leilão \`${args.auctionId}\` (${details.rarityEmoji} **${escapeMarkdown(details.cardName)}**)!`,
      '',
      '🏆 **Você é o maior licitante agora.**',
    ].join('\n'))
  }

  private static async confirm(ctx: IncomingCommand, content: string): Promise<boolean> {
    await reply(ctx, {
      content,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true, color: 'success' }, { title: '❌ Cancelar', data: false, color: 'danger' }],
    })
    const selection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (selection?.messageId) await deleteMsg(ctx, selection.messageId)
    return selection?.value ?? false
  }
}
