import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import type { IncomingCommand } from '@girae/common/commands/types'

const PAGE_SIZE = 20
type Subcategory = NonNullable<Awaited<ReturnType<typeof DiscotecaDB.getSubcategory>>>

async function renderGenresPage(page: number) {
  const subcategories = await DiscotecaDB.getSubcategories()
  const totalPages = Math.max(1, Math.ceil(subcategories.length / PAGE_SIZE))
  const slice = subcategories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const lines = slice.map(s => `${s.emoji} \`${s.id}\`. **${escapeMarkdown(s.name)}**`).join('\n')
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''

  return {
    content: `🎼 Gêneros da discoteca:\n\n${lines}${pageInfo}\n\n🔍 Para ver os álbuns/singles de um gênero, use \`/generos id ou nome\`.`,
    hasNext: (page + 1) * PAGE_SIZE < subcategories.length,
    totalPages,
  }
}

async function renderGenreEntriesPage(subcategoryId: number, userId: number, page: number) {
  const subcategory = await DiscotecaDB.getSubcategory(subcategoryId)
  if (!subcategory) return null

  const offset = page * PAGE_SIZE
  const { rows, total } = await DiscotecaDB.getEntriesForGenre(subcategoryId, userId, PAGE_SIZE, offset)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const lines = rows.length > 0
    ? rows.map(e => {
      const typeEmoji = e.type === 'album' ? '💽' : '🎵'
      const countSuffix = e.ownedCount > 0 ? ` \`${e.ownedCount}x\`` : ''
      return `${e.rarityEmoji} \`${e.id}\`. **${escapeMarkdown(e.name)}** ${typeEmoji}${countSuffix}`
    }).join('\n')
    : '_Nenhum álbum ou single neste gênero ainda._'
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''

  return {
    content: `${subcategory.emoji} \`${subcategory.id}\`. **${escapeMarkdown(subcategory.name)}**\n\n${lines}${pageInfo}`,
    hasNext: offset + rows.length < total,
    totalPages,
  }
}

export default class GenerosCommand extends Command {
  static override info = {
    name: 'generos',
    description: 'Mostra os gêneros da discoteca, ou os álbuns/singles de um gênero',
    usage: '/generos [gênero]',
    aliases: ['genero', 'genres', 'genre'],
  }

  @CommandArgument([{ name: 'genre', type: CommandArgumentType.DISCOTECA_SUBCATEGORY, nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { genre?: Subcategory }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)

    if (args.genre) {
      const page = await renderGenreEntriesPage(args.genre.id, user?.id ?? 0, 0)
      if (!page) return
      const navRow = pageNavRow('generosEntries', String(args.genre.id), 0, page.hasNext, page.totalPages)
      await reply(ctx, { content: page.content, buttonRows: navRow.length ? [navRow] : undefined })
      return
    }

    const page = await renderGenresPage(0)
    const navRow = pageNavRow('generos', '', 0, page.hasNext, page.totalPages)
    await reply(ctx, { content: page.content, buttonRows: navRow.length ? [navRow] : undefined })
  }

  @Page({ name: 'generos', restricted: true })
  static async generosPage(_arg: string, page: number) {
    return renderGenresPage(page)
  }

  @Page({ name: 'generosEntries', restricted: true })
  static async generosEntriesPage(arg: string, page: number, authorId: string, platform: 'telegram' | 'discord') {
    const user = await UsersDB.getUserByPlatformAccount(platform, authorId)
    return renderGenreEntriesPage(parseInt(arg, 10), user?.id ?? 0, page)
  }
}
