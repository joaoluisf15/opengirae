import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow, toPageButton } from '@girae/common/dbos/messaging'
import { UsersDB } from '@girae/database/users'
import { showEntry, renderEntriesByTypePage, type EntryDetails } from './disco'
import { buildFilterArg } from '@girae/common/utilities/pageFilters'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class AlbunsCommand extends Command {
  static override info = {
    name: 'albuns',
    description: 'Mostra os álbuns da discoteca, ou busca um álbum específico',
    usage: '/albuns [busca]',
    aliases: ['albums', 'album'],
  }

  @CommandArgument([{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'album', nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { query?: EntryDetails }) {
    if (args.query) {
      await showEntry(ctx, args.query)
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    const arg = buildFilterArg([], '')
    const page = await renderEntriesByTypePage('album', user?.id ?? 0, 0, arg)
    const navRow = pageNavRow('albuns', arg, 0, page.hasNext, page.totalPages)
    await reply(ctx, {
      content: page.content,
      buttonRows: [
        ...page.extraRows.map(row => row.map(b => toPageButton('albuns', b))),
        ...(navRow.length ? [navRow] : []),
      ],
    })
  }

  @Page({ name: 'albuns', restricted: true })
  static async albunsPage(arg: string, page: number, authorId: string, platform: 'telegram' | 'discord') {
    const user = await UsersDB.getUserByPlatformAccount(platform, authorId)
    return renderEntriesByTypePage('album', user?.id ?? 0, page, arg)
  }
}
