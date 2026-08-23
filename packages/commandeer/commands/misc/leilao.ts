import { Command } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { getBotUsername } from '../../services/botInfo'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'

export default class LeilaoLinkCommand extends Command {
  static override info = {
    name: 'leilao',
    description: 'Envia o link para ver os leilões no mini app',
    usage: '/leilao',
  }

  static override async execute(ctx: IncomingCommand) {
    const botUsername = await getBotUsername()
    await reply(ctx, `${EMOJI.auction} [Veja os leilões aqui](https://t.me/${botUsername}/leilao)`)
  }
}
