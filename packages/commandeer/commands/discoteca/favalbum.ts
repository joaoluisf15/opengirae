import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'
import type { EntryDetails } from './disco'

export default class FavAlbumCommand extends Command {
  static override info = {
    name: 'favalbum',
    description: 'Define seu álbum favorito',
    usage: '/favalbum <nome ou ID do álbum>',
    aliases: ['favalb'],
  }

  @CommandArgument([{ name: 'album', type: CommandArgumentType.DISCOTECA_ENTRY, entryType: 'album', description: 'ID ou nome do álbum' }])
  static override async execute(ctx: IncomingCommand, args: { album: EntryDetails }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const owned = await DiscotecaDB.getUserDiscoteca(user.id, args.album.id)
    if (!owned || owned.count <= 0) {
      await reply(ctx, 'Oops... parece que você ainda não tem esse álbum. 😅\nEncontre-o usando `/girar` para favoritá-lo.')
      return
    }

    await DiscotecaDB.setFavoriteAlbum(user.id, args.album.id)

    await reply(ctx, {
      content: `🌟 **${escapeMarkdown(args.album.name)}** é agora o seu álbum favorito!`,
      photoUrl: args.album.animatedArtworkUrl ?? args.album.artworkUrl ?? undefined,
    })
  }
}
