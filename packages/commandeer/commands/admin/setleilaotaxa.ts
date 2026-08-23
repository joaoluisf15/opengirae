import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { EconomyDB } from '@girae/database/economy'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'

export default class SetLeilaoTaxaCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'setleilaotaxa',
    description: 'Muda a taxa de publicação ou de seguro do /leiloar (staff)',
    usage: '/setleilaotaxa <publicacao|seguro> <percentagem>',
  }

  @CommandArgument([
    {
      name: 'taxa', type: CommandArgumentType.STRING, description: 'publicacao ou seguro',
      guard: (value) => (value === 'publicacao' || value === 'seguro') ? true : 'Use `publicacao` ou `seguro`.',
    },
    { name: 'percentagem', type: CommandArgumentType.NUMBER, description: 'Percentagem a mais (ex: 25 pra +25%)' },
  ])
  static override async execute(ctx: IncomingCommand, args: { taxa: 'publicacao' | 'seguro'; percentagem: number }) {
    const multiplier = 1 + args.percentagem / 100
    const updated = args.taxa === 'publicacao'
      ? await EconomyDB.setAuctionFees(multiplier, undefined)
      : await EconomyDB.setAuctionFees(undefined, multiplier)
    if (!updated) { await reply(ctx, '😅 Não deu pra atualizar a taxa.'); return }

    const label = args.taxa === 'publicacao' ? 'de publicação' : 'de seguro'
    await reply(ctx, `${EMOJI.auction} Taxa ${label} do leilão agora é **+${args.percentagem}%** (publicação: ${updated.auctionListingFeeMultiplier}x, seguro: ${updated.auctionInsuranceFeeMultiplier}x).`)
  }
}
