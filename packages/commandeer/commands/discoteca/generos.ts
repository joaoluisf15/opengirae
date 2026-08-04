import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow, toPageButton } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { renderEntryLine, renderCollectionMarker } from './disco'
import { buildFilterArg, parseFilterArg, filterAdviceText, filterButtonsRow } from '@girae/common/utilities/pageFilters'
import { entryFilterConditions, ENTRY_FILTERS } from '../../services/discoteca/entryFilters'
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

async function renderGenreEntriesPage(subcategoryId: number, userId: number, page: number, rawArg: string = '') {
  const subcategory = await DiscotecaDB.getSubcategory(subcategoryId)
  if (!subcategory) return null

  const { active, rest } = parseFilterArg(rawArg)
  const filters = entryFilterConditions(active)
  const offset = page * PAGE_SIZE
  const { rows, total, owned, filteredTotal } = await DiscotecaDB.getEntriesForGenre(subcategoryId, userId, PAGE_SIZE, offset, filters)
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))

  const lines = rows.length > 0
    ? rows.map(renderEntryLine).join('\n')
    : '_Nada para mostrar com esses filtros._'
  const advice = filterAdviceText(ENTRY_FILTERS, active, filteredTotal, subcategory.isAlbum ? 'álbuns' : 'singles')
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''
  const marker = renderCollectionMarker(total, owned, subcategory.isAlbum ? 'álbuns' : 'singles')

  return {
    content: `${subcategory.emoji} \`${subcategory.id}\`. **${escapeMarkdown(subcategory.name)}**\n${marker}\n${advice}\n${lines}${pageInfo}`,
    photoUrl: subcategory.imageUrl ?? undefined,
    hasNext: offset + rows.length < filteredTotal,
    totalPages,
    extraRows: [filterButtonsRow(ENTRY_FILTERS, active, rest)],
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
      const arg = buildFilterArg([], String(args.genre.id))
      const page = await renderGenreEntriesPage(args.genre.id, user?.id ?? 0, 0, arg)
      if (!page) return
      const navRow = pageNavRow('generosEntries', arg, 0, page.hasNext, page.totalPages)
      await reply(ctx, {
        content: page.content,
        photoUrl: page.photoUrl,
        buttonRows: [
          ...page.extraRows.map(row => row.map(b => toPageButton('generosEntries', b))),
          ...(navRow.length ? [navRow] : []),
        ],
      })
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
    const { rest } = parseFilterArg(arg)
    const user = await UsersDB.getUserByPlatformAccount(platform, authorId)
    return renderGenreEntriesPage(parseInt(rest, 10), user?.id ?? 0, page, arg)
  }
}
