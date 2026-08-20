import { Command, Page } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const PAGE_SIZE = 10
// caption cap is 1024 chars - same overflow guard as cts.ts
const MAX_CONTENT_LENGTH_FOR_PHOTO = 950

export async function renderPage(page: number, viewerTelegramId: string, platform: 'telegram' | 'discord') {
  const viewer = await UsersDB.getUserByPlatformAccount(platform, viewerTelegramId)
  if (!viewer) return null

  const { rows, total } = await CardsDB.getGoals(viewer.id, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const rowsText = rows.length > 0
    ? rows.map(r => `${r.categoryEmoji} \`${r.subcategoryId}\`. **${escapeMarkdown(r.subcategoryName)}**`).join('\n')
    : '_Nenhuma coleção encontrada._'
  const pageInfo = totalPages > 1 ? `${EMOJI.page} Página \`${page + 1}\` de **${totalPages}**\n` : ''

  const content = `${EMOJI.goal} Lista de coleções favoritas\n\n${rowsText}\n\n${pageInfo}${EMOJI.browse} Para adicionar ou remover, use \`/quero id\`.`

  let photoUrl: string | undefined
  if (content.length <= MAX_CONTENT_LENGTH_FOR_PHOTO) {
    // first-ever favorite's banner, stable across page clicks
    photoUrl = page === 0
      ? (rows[0]?.imageUrl ?? undefined)
      : ((await CardsDB.getGoals(viewer.id, { limit: 1, offset: 0 })).rows[0]?.imageUrl ?? undefined)
  }

  return { content, photoUrl, hasNext: page < totalPages - 1, totalPages }
}

export default class ListQueroCommand extends Command {
  static override info = {
    name: 'listquero',
    description: 'Lista suas coleções favoritas (marcadas com /quero)',
    usage: '/listquero',
  }

  static override async execute(ctx: IncomingCommand) {
    const page = await renderPage(0, ctx.message.author.id, ctx.message.platform as 'telegram' | 'discord')
    if (!page) return

    const navRow = pageNavRow('listquero', '', 0, page.hasNext, page.totalPages)
    await reply(ctx, {
      content: page.content,
      photoUrl: page.photoUrl,
      buttonRows: navRow.length ? [navRow] : undefined,
    })
  }

  @Page({ name: 'listquero', restricted: true })
  static async listQueroPage(arg: string, page: number, authorId: string, platform: 'telegram' | 'discord') {
    return renderPage(page, authorId, platform)
  }
}
