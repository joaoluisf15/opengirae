import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { runEditFlow } from '../../services/discoteca/discotecaWizard'
import type { IncomingCommand } from '@girae/common/commands/types'
import type { EntryDetails } from './disco'

export default class EditAlbumCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'editalbum',
    description: 'Edita um álbum existente da Discoteca (staff)',
    usage: '/editalbum <ID ou nome do álbum>',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'entry', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'album', description: 'ID ou nome do álbum' }])
  static override async execute(ctx: IncomingCommand, args: { entry: EntryDetails }) {
    await runEditFlow(ctx, args.entry.id, 'album')
  }
}
