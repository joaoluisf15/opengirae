import { Command } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { UsersDB } from '@girae/database/users'
import { PromoDB } from '@girae/database/promo'
import { getCached, setCached } from '@girae/common/cache/kv'
import { tg } from '../../services/botInfo'
import { error } from '@girae/common/logger'
import type { IncomingCommand } from '@girae/common/commands/types'

const GROUP_ID = -1003711715950
const CODE = 'JV36J1'
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted'])
const CHECK_TTL_SECONDS = 60 * 60

export default class BonusDaPatroaCommand extends Command {
  static override info = {
    name: 'bonusdapatroa',
    description: 'Resgata o bônus especial para membros do grupo da patroa',
    usage: '/bonusdapatroa',
  }

  static override async execute(ctx: IncomingCommand) {
    if (ctx.message.platform !== 'telegram') {
      await reply(ctx, '😅 Esse bônus só funciona no Telegram. Entre em https://t.me/chatdagirae')
      return
    }

    const user = await UsersDB.getUserByPlatformAccount('telegram', ctx.message.author.id)
    if (!user) return

    const cacheKey = `bonusdapatroa:member:${ctx.message.author.id}`
    let isMember = (await getCached(cacheKey)) === '1'

    if (!isMember) {
      try {
        const member = await tg.getChatMember(GROUP_ID, ctx.message.author.id)
        isMember = MEMBER_STATUSES.has(member.status)
      } catch (e) {
        error('commandeer', `Failed to check bonusdapatroa group membership for ${ctx.message.author.id}: ${e}`)
        isMember = false
      }
      if (isMember) await setCached(cacheKey, '1', CHECK_TTL_SECONDS)
    }

    if (!isMember) {
      await reply(ctx, '😔 Esse bônus é exclusivo pra quem tá no @chatdagirae. Entra lá e tenta de novo!')
      return
    }

    const result = await PromoDB.consumeCode(CODE, user.id)
    if (!result.ok) {
      const messages = {
        not_found: '😅 Código não encontrado.',
        expired: '⏳ Esse código já expirou.',
        already_redeemed: '❌ Você já resgatou o bônus.',
        max_uses: '❌ Esse código já atingiu o limite de usos.',
      }
      await reply(ctx, messages[result.reason])
      return
    }

    await reply(ctx, `✅ Bônus resgatado! Você ganhou **${result.appliedRewards.coins ?? 0}** moedas e **${result.appliedRewards.usedDraws ?? 0}** giros extras.`)
  }
}
