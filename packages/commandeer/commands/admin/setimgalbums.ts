import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply } from '@girae/common/dbos/messaging'
import { uploadFromUrl } from '@girae/common/utilities/storage'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

export default class SetImgAlbumsCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'setimgalbums',
    description: 'Define a imagem de banner da variante de álbuns de um gênero (staff)',
    usage: '/setimgalbums <ID ou nome do gênero>',
  }

  @CommandArgument([{ name: 'subcategory', type: CommandArgumentType.DISCOTECA_SUBCATEGORY, subcategoryType: 'album', description: 'ID ou nome da subcategoria de álbuns' }])
  static override async execute(ctx: IncomingCommand, args: { subcategory: { id: number; name: string } }) {
    const photoUrl = ctx.message.photoUrl ?? ctx.message.replyTo?.photoUrl
    if (!photoUrl) {
      await reply(ctx, 'Não encontrei nenhuma foto na mensagem ou na resposta.')
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const cdnUrl = await uploadFromUrl(photoUrl, 'discoteca-subcategories')
    await DiscotecaDB.setSubcategoryImage(args.subcategory.id, cdnUrl)
    await AuditDB.log(user.id, 'discoteca.subcategory.imageUpdate', { subcategoryId: args.subcategory.id, name: args.subcategory.name })

    await reply(ctx, { content: `Banner de **${escapeMarkdown(args.subcategory.name)}** atualizado.`, photoUrl: cdnUrl })
  }
}
