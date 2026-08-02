import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { runAddFlow } from '../../services/discoteca/discotecaWizard'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class AddAlbumCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'addalbum',
    description: 'Busca um álbum no Apple Music e adiciona à Discoteca (staff)',
    usage: '/addalbum <busca>',
    aliases: ['addalb'],
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'query', type: CommandArgumentType.STRING }])
  static override async execute(ctx: IncomingCommand, args: { query: string }) {
    await runAddFlow(ctx, 'album', args.query)
  }
}
