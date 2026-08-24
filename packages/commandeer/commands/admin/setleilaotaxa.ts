import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { EconomyDB } from '@girae/database/economy'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'

export default class SetLeilaoTaxaCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'setleilaotaxa',
    description: 'Muda a taxa de venda do /leiloar, cobrada do vendedor quando o leilão vende (staff)',
    usage: '/setleilaotaxa <percentagem>',
  }

  @CommandArgument([
    { name: 'percentagem', type: CommandArgumentType.NUMBER, description: 'Percentagem cobrada sobre o valor da venda (ex: 10 pra 10%)' },
  ])
  static override async execute(ctx: IncomingCommand, args: { percentagem: number }) {
    const updated = await EconomyDB.setAuctionSaleFeeRate(args.percentagem / 100)
    if (!updated) { await reply(ctx, '😅 Não deu pra atualizar a taxa.'); return }

    await reply(ctx, `${EMOJI.auction} Taxa de venda do leilão agora é **${args.percentagem}%** (cobrada do vendedor quando o leilão vende).`)
  }
}
