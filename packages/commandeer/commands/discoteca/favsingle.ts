import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'
import type { EntryDetails } from './disco'

export default class FavSingleCommand extends Command {
  static override info = {
    name: 'favsingle',
    description: 'Define seu single favorito',
    usage: '/favsingle <nome ou ID do single>',
    aliases: ['favsgl'],
  }

  @CommandArgument([{ name: 'single', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'single', description: 'ID ou nome do single' }])
  static override async execute(ctx: IncomingCommand, args: { single: EntryDetails }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const owned = await DiscotecaDB.getUserDiscoteca(user.id, args.single.id)
    if (!owned || owned.count <= 0) {
      await reply(ctx, 'Oops... parece que você ainda não tem esse single. 😅\nEncontre-o usando `/girar` para favoritá-lo.')
      return
    }

    await DiscotecaDB.setFavoriteSingle(user.id, args.single.id)

    await reply(ctx, {
      content: `🌟 **${escapeMarkdown(args.single.name)}** é agora o seu single favorito!`,
      photoUrl: args.single.artworkUrl ?? undefined,
    })
  }
}
