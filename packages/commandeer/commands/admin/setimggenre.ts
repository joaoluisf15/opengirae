import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { uploadFromUrl } from '@girae/common/utilities/storage'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class SetImgGenreCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'setimggenre',
    description: 'Define a imagem de banner de um gênero da Discoteca (staff)',
    usage: '/setimggenre <ID ou nome do gênero>',
    aliases: ['setimggenero'],
  }

  @CommandArgument([{ name: 'genre', type: CommandArgumentType.DISCOTECA_GENRE, description: 'ID ou nome do gênero' }])
  static override async execute(ctx: IncomingCommand, args: { genre: { id: number; name: string } }) {
    const photoUrl = ctx.message.photoUrl ?? ctx.message.replyTo?.photoUrl
    if (!photoUrl) {
      await reply(ctx, 'Não encontrei nenhuma foto na mensagem ou na resposta.')
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const cdnUrl = await uploadFromUrl(photoUrl, 'discoteca-genres')
    await DiscotecaDB.setGenreImage(args.genre.id, cdnUrl)
    await AuditDB.log(user.id, 'discoteca.genre.imageUpdate', { genreId: args.genre.id, name: args.genre.name })

    await reply(ctx, { content: `Banner do gênero **${escapeMarkdown(args.genre.name)}** atualizado.`, photoUrl: cdnUrl })
  }
}
