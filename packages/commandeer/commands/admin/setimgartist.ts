import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { uploadFromUrl } from '@girae/common/utilities/storage'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class SetImgArtistCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'setimgartist',
    description: 'Define a imagem de banner de um artista da Discoteca (staff)',
    usage: '/setimgartist <ID ou nome do artista>',
  }

  @CommandArgument([{ name: 'artist', type: CommandArgumentType.DISCOTECA_ARTIST, description: 'ID ou nome do artista' }])
  static override async execute(ctx: IncomingCommand, args: { artist: { id: number; name: string } }) {
    const photoUrl = ctx.message.photoUrl ?? ctx.message.replyTo?.photoUrl
    if (!photoUrl) {
      await reply(ctx, 'Não encontrei nenhuma foto na mensagem ou na resposta.')
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const cdnUrl = await uploadFromUrl(photoUrl, 'discoteca-artists')
    await DiscotecaDB.setArtistImage(args.artist.id, cdnUrl)
    await AuditDB.log(user.id, 'discoteca.artist.imageUpdate', { artistId: args.artist.id, name: args.artist.name })

    await reply(ctx, { content: `Banner do artista **${escapeMarkdown(args.artist.name)}** atualizado.`, photoUrl: cdnUrl })
  }
}
