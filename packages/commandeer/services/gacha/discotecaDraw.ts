import { DBOS } from '@dbos-inc/dbos-sdk'
import { GachaLogic } from '@girae/database/gacha'
import { DiscotecaDB } from '@girae/database/discoteca'
import { UsersDB } from '@girae/database/users'
import { reply, buildInteractiveButtons } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { mention } from '@girae/common/utilities/mention'
import { TYPE_EMOJI } from '../../commands/discoteca/disco'
import { updateGirarStep } from './girarClaim'
import type { IncomingCommand } from '@girae/common/commands/types'

const GENRE_SELECTED_EVENT = 'discotecaGenreSelected'
const SELECTION_TIMEOUT_SECONDS = 15 * 60
const SELECTION_EXPIRED_MESSAGE = '⏱ Sua seleção expirou. Use /girar novamente.'
const GENRES_PER_TYPE = 3

interface DiscotecaGenreOption {
  id: number
  name: string
  emoji: string
}

export async function runDiscotecaDraw(
  ctx: IncomingCommand,
  user: { id: number; luckModifier: number },
  authorId: string,
  chatId: string,
  messageId: string | undefined,
): Promise<void> {
  const [albumPool, singlePool] = await Promise.all([
    GachaLogic.getDiscotecaSubcategoriesForDraw(true),
    GachaLogic.getDiscotecaSubcategoriesForDraw(false),
  ])

  const albumGenres = GachaLogic.selectSubcategories(albumPool, GENRES_PER_TYPE, user.luckModifier)
  const singleGenres = GachaLogic.selectSubcategories(singlePool, GENRES_PER_TYPE, user.luckModifier)

  if (albumGenres.length === 0 && singleGenres.length === 0) {
    await reply(ctx, { content: 'Não há álbuns ou singles catalogados para girar ainda.', editMessageId: messageId })
    return
  }

  const albumOptions: DiscotecaGenreOption[] = albumGenres.map(g => ({ id: g.id, name: g.name, emoji: '💽' }))
  const singleOptions: DiscotecaGenreOption[] = singleGenres.map(g => ({ id: g.id, name: g.name, emoji: '🎵' }))

  const options: { title: string; data: number }[] = []
  const rows: number[] = []
  const rowCount = Math.max(albumOptions.length, singleOptions.length)
  for (let i = 0; i < rowCount; i++) {
    let cols = 0
    if (albumOptions[i]) { options.push({ title: `${albumOptions[i]!.emoji} ${albumOptions[i]!.name}`, data: albumOptions[i]!.id }); cols++ }
    if (singleOptions[i]) { options.push({ title: `${singleOptions[i]!.emoji} ${singleOptions[i]!.name}`, data: singleOptions[i]!.id }); cols++ }
    rows.push(cols)
  }

  const genreContent = `💽 Escolha um gênero da Discoteca:`

  await reply(ctx, {
    content: genreContent,
    eventName: GENRE_SELECTED_EVENT,
    restricted: 'author',
    options,
    rows,
    editMessageId: messageId,
  })
  await updateGirarStep(authorId, chatId, ctx.workflowIDToBeAssigned, {
    content: genreContent,
    buttons: buildInteractiveButtons(ctx.workflowIDToBeAssigned, GENRE_SELECTED_EVENT, options, rows),
  })

  await UsersDB.incrementUsedDraws(user.id)

  const genreSelection = await DBOS.recv<{ value: number, messageId?: string }>(GENRE_SELECTED_EVENT, SELECTION_TIMEOUT_SECONDS)
  if (!genreSelection?.value) {
    await reply(ctx, SELECTION_EXPIRED_MESSAGE)
    return
  }
  const subcategoryId = genreSelection.value
  const resultMessageId = genreSelection.messageId ?? messageId

  const chosenGenre = [...albumOptions, ...singleOptions].find(g => g.id === subcategoryId)

  const entryPool = await GachaLogic.getDiscotecaEntriesForDraw(subcategoryId)
  const drawnEntry = GachaLogic.selectCard(entryPool, user.luckModifier)

  if (!drawnEntry) {
    await reply(ctx, { content: 'Não tinha nenhum álbum ou single nesse gênero... menos um giro pra você...', editMessageId: resultMessageId })
    return
  }

  const [count, details] = await Promise.all([
    DiscotecaDB.addUserDiscoteca(user.id, drawnEntry.id),
    DiscotecaDB.getEntryWithDetails(drawnEntry.id),
  ])
  if (!details) return

  const typeEmoji = TYPE_EMOJI[details.type]
  const photoUrl = details.type === 'album' ? (details.animatedArtworkUrl ?? details.artworkUrl) : details.artworkUrl

  const text = `🎰 Parabéns, você ganhou e vai levar:

${details.rarityEmoji} \`${details.id}\`. **${escapeMarkdown(details.name)}**
${typeEmoji} _${escapeMarkdown(details.artistName)}_ — ${escapeMarkdown(chosenGenre?.name ?? '')}

👾 \`${user.id}\`. ${mention(ctx.message.platform, ctx.message.author.id, ctx.message.author.name)} (\`${count}x\`)`

  await reply(ctx, {
    content: text,
    photoUrl: photoUrl ?? undefined,
    editMessageId: resultMessageId,
  })
}
