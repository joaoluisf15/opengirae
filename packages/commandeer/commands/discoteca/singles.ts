import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { UsersDB } from '@girae/database/users'
import { showEntry, renderEntriesByTypePage, type EntryDetails } from './disco'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class SinglesCommand extends Command {
  static override info = {
    name: 'singles',
    description: 'Mostra os singles da discoteca, ou busca um single específico',
    usage: '/singles [busca]',
    aliases: ['single'],
  }

  @CommandArgument([{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'single', nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { query?: EntryDetails }) {
    if (args.query) {
      await showEntry(ctx, args.query)
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    const page = await renderEntriesByTypePage('single', user?.id ?? 0, 0)
    const navRow = pageNavRow('singles', '', 0, page.hasNext, page.totalPages)
    await reply(ctx, { content: page.content, buttonRows: navRow.length ? [navRow] : undefined })
  }

  @Page({ name: 'singles', restricted: true })
  static async singlesPage(_arg: string, page: number, authorId: string, platform: 'telegram' | 'discord') {
    const user = await UsersDB.getUserByPlatformAccount(platform, authorId)
    return renderEntriesByTypePage('single', user?.id ?? 0, page)
  }
}
