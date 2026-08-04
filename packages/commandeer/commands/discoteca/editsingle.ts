import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { runEditFlow } from '../../services/discoteca/discotecaWizard'
import type { IncomingCommand } from '@girae/common/commands/types'
import type { EntryDetails } from './disco'

export default class EditSingleCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'editsingle',
    description: 'Edita um single existente da Discoteca (staff)',
    usage: '/editsingle <ID ou nome do single>',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'entry', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'single', description: 'ID ou nome do single' }])
  static override async execute(ctx: IncomingCommand, args: { entry: EntryDetails }) {
    await runEditFlow(ctx, args.entry.id, 'single')
  }
}
