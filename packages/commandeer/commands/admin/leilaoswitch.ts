import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { EconomyDB } from '@girae/database/economy'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'

export default class LeilaoSwitchCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'leilaoswitch',
    description: 'Liga/desliga os leilões inteiros - interruptor de emergência, sem precisar de deploy (staff)',
    usage: '/leilaoswitch <on|off>',
  }

  @CommandArgument([{ name: 'state', type: CommandArgumentType.BOOLEAN, description: 'on/off' }])
  static override async execute(ctx: IncomingCommand, args: { state: boolean }) {
    await EconomyDB.setAuctionsEnabled(args.state)
    await reply(ctx, `${EMOJI.auction} Leilões agora estão **${args.state ? 'ativados' : 'desativados'}**.`)
  }
}
