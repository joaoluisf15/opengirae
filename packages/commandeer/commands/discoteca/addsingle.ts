import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { runAddFlow } from '../../services/discoteca/discotecaWizard'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class AddSingleCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'addsingle',
    description: 'Busca uma música no Apple Music e adiciona à Discoteca (staff)',
    usage: '/addsingle <busca>',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'query', type: CommandArgumentType.STRING }])
  static override async execute(ctx: IncomingCommand, args: { query: string }) {
    await runAddFlow(ctx, 'single', args.query)
  }
}
