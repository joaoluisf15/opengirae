import { Command, Page } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { generateWishlistImage } from '@girae/common/ditto'
import { cativeiroEmoji } from '../../constants'

const PAGE_SIZE = 10

export async function renderPage(viewerUserIdArg: string, page: number) {
  const viewerId = parseInt(viewerUserIdArg, 10)
  const viewer = await UsersDB.getUserById(viewerId)
  if (!viewer) return null

  const { rows, total } = await CardsDB.getCativeiroEligibleCards(viewer.id, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (total === 0) {
    return {
      content: '😊 Você não tem nenhuma carta elegível para cativeiro ainda. Use /girar ou troque cartas no @chatdagirae!',
      photoUrl: undefined,
      hasNext: false,
      totalPages: 1,
    }
  }

  const cardLines = rows.map(c => {
    const rarityOrCustom = c.customEmoji ?? c.rarityEmoji
    const subLabel = c.subcategoryName ? ` ${cativeiroEmoji(c.ownedCount)} — _${escapeMarkdown(c.subcategoryName)}_` : ''
    return `${rarityOrCustom} \`${c.id}\`. **${escapeMarkdown(c.name)}** \`${c.ownedCount}x\`${subLabel}`
  }).join('\n')
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''
  const cativeiroLabel = total === 1 ? 'cativeiro ativo' : 'cativeiros ativos'

  const content = `👤 \`${viewer.id}\`. Cativeiros de **${escapeMarkdown(viewer.displayName)}**
👑 \`${total}\` ${cativeiroLabel}.

${cardLines}

Use \`/upload id\`.${pageInfo}`

  const dittoCards = rows
    .map(c => ({ id: c.id, name: c.name, imageUrl: c.customMediaUrl ?? c.imageUrl }))
    .filter((c): c is { id: number; name: string; imageUrl: string } => !!c.imageUrl)
  const image = dittoCards.length > 0 ? await generateWishlistImage(dittoCards) : null

  return { content, photoUrl: image?.url, hasNext: page < totalPages - 1, totalPages }
}

export default class CativeirosCommand extends Command {
  static override info = {
    name: 'cativeiros',
    description: 'Mostra seus cards elegíveis para customização de cativeiro',
    usage: '/cativeiros',
  }

  static override async execute(ctx: IncomingCommand) {
    const viewer = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!viewer) return

    const page = await renderPage(String(viewer.id), 0)
    if (!page) return

    const navRow = pageNavRow('cativeiros', String(viewer.id), 0, page.hasNext, page.totalPages)
    await reply(ctx, { content: page.content, photoUrl: page.photoUrl, buttonRows: navRow.length ? [navRow] : undefined })
  }

  @Page({ name: 'cativeiros', restricted: true })
  static async cativeirosPage(arg: string, page: number) {
    return renderPage(arg, page)
  }
}
