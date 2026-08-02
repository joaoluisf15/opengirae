import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { mention } from '@girae/common/utilities/mention'
import type { IncomingCommand } from '@girae/common/commands/types'

const PAGE_SIZE = 20
type EntryDetails = NonNullable<Awaited<ReturnType<typeof DiscotecaDB.getEntryWithDetails>>>

async function renderArtistsPage(userId: number, page: number) {
  const offset = page * PAGE_SIZE
  const { rows, total } = await DiscotecaDB.getArtistsPage(userId, PAGE_SIZE, offset)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const lines = rows.map(a => {
    const emoji = a.rarityEmoji ?? '🎧'
    const pct = a.totalWorks > 0 ? Math.round((a.ownedWorks / a.totalWorks) * 100) : 0
    return `${emoji} \`${a.id}\`. **${escapeMarkdown(a.name)}** (${a.ownedWorks}/${a.totalWorks}) _${pct}%_`
  }).join('\n')
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''

  return { content: `💿 Sua discoteca:\n\n${lines}${pageInfo}`, hasNext: offset + rows.length < total, totalPages }
}

async function artistCardLine(artistId: number, artistName: string, userId: number | undefined): Promise<string> {
  const artist = await DiscotecaDB.getArtist(artistId)
  if (!artist?.cardId) return `🎧 **${escapeMarkdown(artistName)}**`

  const card = await CardsDB.getCardWithDetails(artist.cardId)
  if (!card) return `🎧 **${escapeMarkdown(artistName)}**`

  const owned = userId ? await CardsDB.getUserCard(userId, card.id) : undefined
  const countSuffix = owned?.count ? ` \`x${owned.count}\`` : ''
  return `${card.categoryEmoji ?? '🎧'} \`${card.id}\`. **${escapeMarkdown(card.name)}**${countSuffix}`
}

async function showEntry(ctx: IncomingCommand, entry: EntryDetails) {
  const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
  const [owned, genres, linkedSingles, cardLine] = await Promise.all([
    user ? DiscotecaDB.getUserDiscoteca(user.id, entry.id) : null,
    DiscotecaDB.getGenresForEntry(entry.id),
    entry.type === 'album' ? DiscotecaDB.getLinkedSingles(entry.id, user?.id ?? 0) : Promise.resolve([]),
    artistCardLine(entry.artistId, entry.artistName, user?.id),
  ])
  const count = owned?.count ?? 0
  const typeEmoji = entry.type === 'album' ? '💽' : '🎵'
  const countSuffix = entry.type === 'single' && count > 0 ? ` \`x${count}\`` : ''
  const genresLines = genres.length > 0
    ? genres.map(g => `🎼 \`${g.id}\`. ${escapeMarkdown(g.name)}`).join('\n')
    : '🎼 _nenhum gênero mapeado_'

  const linkedSinglesBlock = entry.type === 'album' && linkedSingles.length > 0
    ? '\n\n' + linkedSingles.map(s => `${s.rarityEmoji} \`${s.id}\`. _${escapeMarkdown(s.name)}_ 🎵`).join('\n')
    : ''

  const text = `${entry.rarityEmoji} \`${entry.id}\`. **${escapeMarkdown(entry.name)}** ${typeEmoji}${countSuffix}
${cardLine}

${genresLines}${linkedSinglesBlock}

👾 \`${user?.id ?? '?'}\`. ${mention(ctx.message.platform, ctx.message.author.id, ctx.message.author.name)}`

  const buttons = entry.appleMusicUrl ? [[{ text: '🎧 Escute no Apple Music', url: entry.appleMusicUrl }]] : undefined

  if (entry.type === 'single' && entry.previewUrl) {
    await reply(ctx, { content: text, audioUrl: entry.previewUrl, audioPerformer: entry.artistName, audioTitle: entry.name, buttonRows: buttons })
    return
  }

  await reply(ctx, { content: text, photoUrl: entry.artworkUrl ?? undefined, buttonRows: buttons })
}

export default class DiscoCommand extends Command {
  static override info = {
    name: 'disco',
    description: 'Mostra sua discoteca, ou busca um álbum/single específico',
    usage: '/disco [busca]',
    aliases: ['mydisco', 'minhadisco', 'minhadiscografia', 'discoteca'],
  }

  @CommandArgument([{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { query?: EntryDetails }) {
    if (args.query) {
      await showEntry(ctx, args.query)
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const hasAny = await DiscotecaDB.hasAnyUserDiscoteca(user.id)
    if (!hasAny) {
      await reply(ctx, 'Você ainda não girou nada da discoteca! 😔')
      return
    }

    const page = await renderArtistsPage(user.id, 0)
    const navRow = pageNavRow('disco', String(user.id), 0, page.hasNext, page.totalPages)
    await reply(ctx, { content: page.content, buttonRows: navRow.length ? [navRow] : undefined })
  }

  @Page({ name: 'disco', restricted: true })
  static async discoPage(arg: string, page: number) {
    return renderArtistsPage(parseInt(arg, 10), page)
  }
}
