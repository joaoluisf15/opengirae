import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { reply, deleteMsg } from '@girae/common/dbos/messaging'
import { UsersDB } from '@girae/database/users'
import { AuctionsDB } from '@girae/database/auctions'
import { resolveCardByIdOrName } from '../../services/commandArguments'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { EMOJI } from '../../constants'

const CONFIRM_EVENT = 'leiloar:confirm'
const INSURANCE_EVENT = 'leiloar:insurance'
const INSURANCE_REFUND_RATE = 0.65

// mirrors AuctionsDB.createAuction's reason union.
const CREATE_FAILURE_MESSAGES: Record<string, string> = {
  auctions_disabled: `${EMOJI.auction} Os leilões estão temporariamente desativados. Tenta mais tarde.`,
  daily_limit: `${EMOJI.auction} Você já criou o **máximo de 3** leilões hoje. Tenta amanhã!`,
  rarity_not_configured: '😅 Essa raridade ainda não está configurada pra leilão. Fala com a staff.',
  not_owned: '😂 Leiloa o quê? Você não tem esse card marcado como trocável (ou não tem ele).',
  // cooldown is handled dynamically below (needs the actual time remaining), not from this map.
  insufficient_coins: '💸 Moedas insuficientes! E vamos de `/daily`, `/del` ou `/pix`?',
  already_active: `${EMOJI.auction} **OPS!** Este card já está em um leilão ativo.`,
}

export default class LeiloarCommand extends Command {
  static override info = {
    name: 'leiloar',
    description: 'Cria um leilão pra um card, ou cancela um leilão seu',
    usage: '/leiloar <id ou nome do card> | /leiloar cancelar <ID>',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'rest', type: CommandArgumentType.STRING, description: 'card a leiloar, ou "cancelar" + ID do leilão' }])
  static override async execute(ctx: IncomingCommand, args: { rest: string }) {
    const tokens = args.rest.split(/\s+/).filter(Boolean)
    const first = tokens[0]?.toLowerCase()

    if (first === 'cancelar') { await LeiloarCommand.handleCancel(ctx, tokens[1]); return }
    await LeiloarCommand.handleCreate(ctx, tokens)
  }

  private static async handleCreate(ctx: IncomingCommand, tokens: string[]) {
    if (tokens.length === 0) { await reply(ctx, 'Uso: `/leiloar <cardid>`'); return }

    const outcome = await resolveCardByIdOrName(tokens.join(' '))
    if (!outcome.ok) {
      if (!outcome.handled) await reply(ctx, outcome.message ?? 'Uso: `/leiloar <cardid>`')
      return
    }
    const card = outcome.value as { id: number; name: string; rarityEmoji: string; imageUrl: string | null; subcategoryName: string | null }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const preview = await AuctionsDB.previewListingFee(card.id, false)
    if (!preview) { await reply(ctx, CREATE_FAILURE_MESSAGES.rarity_not_configured!); return }

    await reply(ctx, {
      content: [
        '📣 **ATENÇÃO!**',
        `Está prestes a iniciar o leilão de ${card.rarityEmoji}. **${escapeMarkdown(card.name)}**!`,
        '',
        '',
        `💵 **Lance inicial**: ${preview.startingBid} moedas`,
        `🚀 **Teto**: ${preview.capPrice} moedas`,
        `🏷️ **Taxa de publicação**: ${preview.listingFeePaid} moedas`,
        '',
        `💳 **Total a pagar**: ${preview.startingBid + preview.listingFeePaid} moedas`,
        '⚠️ _A sua carta ficará bloqueada até o leilão terminar._',
      ].join('\n'),
      photoUrl: card.imageUrl ?? undefined,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true, color: 'success' }, { title: '❌ Cancelar', data: false, color: 'danger' }],
    })

    const confirmSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (confirmSelection?.messageId) await deleteMsg(ctx, confirmSelection.messageId)
    if (!confirmSelection?.value) { await reply(ctx, '_Leilão cancelado_'); return }

    // re-preview rather than reuse `preview` - staff could've reconfigured the rarity while the user sat on the first confirm prompt.
    const insuredPreview = await AuctionsDB.previewListingFee(card.id, true)
    if (!insuredPreview) { await reply(ctx, CREATE_FAILURE_MESSAGES.rarity_not_configured!); return }
    const insuranceFee = insuredPreview.listingFeePaid - preview.listingFeePaid
    const insuranceRefund = Math.round((insuredPreview.listingFeePaid + preview.startingBid) * INSURANCE_REFUND_RATE)

    await reply(ctx, {
      content: `🛡️Quer pagar uma taxa de **${insuranceFee}** moedas para receber **${insuranceRefund}** moedas caso não haja licitantes?`,
      eventName: INSURANCE_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Sim', data: true, color: 'success' }, { title: '❌ Não', data: false }],
    })

    const insuranceSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(INSURANCE_EVENT)
    if (insuranceSelection?.messageId) await deleteMsg(ctx, insuranceSelection.messageId)
    const insured = insuranceSelection?.value ?? false

    const result = await AuctionsDB.createAuction(user.id, card.id, insured)
    if (!result.ok) {
      if (result.reason === 'cooldown') {
        const minutesLeft = Math.ceil((result.retryAfterMs ?? 0) / 60000)
        const waitPhrase = (result.retryAfterMs ?? 0) < 60000 ? '**menos de um minuto**' : `**${minutesLeft} minutos**`
        await reply(ctx, `⌛️ Aguarde um momento!\n\nVocê leiloou este card recentemente.\nTem de esperar ${waitPhrase} para voltar a leiloar`)
        return
      }
      await reply(ctx, CREATE_FAILURE_MESSAGES[result.reason] ?? '😅 Não deu pra criar o leilão.')
      return
    }

    await reply(ctx, {
      content: [
        `${EMOJI.auction} \`${result.auction.id}\`. **Leilão de ${escapeMarkdown(user.displayName)}**`,
        '',
        `🎉 Sucesso! O leilão de **${escapeMarkdown(card.name)}** foi criado.`,
        '',
        `🔍Para acompanhar o progresso, use \`/verleilao ${result.auction.id}\`.`,
      ].join('\n'),
      photoUrl: card.imageUrl ?? undefined,
    })
  }

  private static async handleCancel(ctx: IncomingCommand, idRaw?: string) {
    const id = parseInt(idRaw ?? '', 10)
    if (!idRaw || isNaN(id)) { await reply(ctx, 'Uso: `/leiloar cancelar <ID do leilão>`'); return }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const details = await AuctionsDB.getAuction(id)
    if (!details) { await reply(ctx, '❌ **Leilão não encontrado!**'); return }
    if (details.auction.sellerId !== user.id) { await reply(ctx, 'Cancelar o que? este card não é seu 😂'); return }
    if (details.auction.status !== 'active') { await reply(ctx, '⏳ Este leilão já não está ativo.'); return }

    const consequence = details.auction.insured
      ? `você perderá a taxa de **${details.auction.listingFeePaid} moedas** e receberá de reembolso **${Math.round((details.auction.listingFeePaid + details.auction.startingBid) * INSURANCE_REFUND_RATE)} moedas** visto que pagou seguro`
      : `você perderá a taxa de **${details.auction.listingFeePaid} moedas** paga pela publicação`

    await reply(ctx, {
      content: [
        '⚠️ **Confirmar Cancelamento**',
        '',
        `Deseja cancelar o **Leilão \`${id}\` (${details.rarityEmoji} ${escapeMarkdown(details.cardName)})**?`,
        '',
        `💸 **Atenção:** Ao cancelar, ${consequence}.`,
      ].join('\n'),
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '❌ Cancelar leilão', data: true, color: 'danger' }, { title: '↩️ Voltar', data: false }],
    })

    const confirmSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (confirmSelection?.messageId) await deleteMsg(ctx, confirmSelection.messageId)
    if (!confirmSelection?.value) return

    const result = await AuctionsDB.cancelAuction(id, user.id, { asAdmin: false })
    if (!result.ok) {
      const message = result.reason === 'not_owner' ? 'Cancelar o que? este card não é seu 😂' : '❌ **Leilão não encontrado!**'
      await reply(ctx, message)
      return
    }

    const refundLine = result.auction.insured
      ? `\n\n💳 **${Math.round((result.auction.listingFeePaid + result.auction.startingBid) * INSURANCE_REFUND_RATE)} moedas** creditadas na sua conta.`
      : ''
    await reply(ctx, `✅ **Leilão \`${id}\` cancelado.**\nCard devolvido à sua coleção!${refundLine}`)
  }
}
