import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { reply } from '@girae/common/dbos/messaging'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

type PartnerRow = { partnerId: number; partnerName: string; count: number }

function topList(rows: PartnerRow[]): string {
  if (rows.length === 0) return '_nenhuma_'
  return rows.map((r, i) => `${i + 1}. ${escapeMarkdown(r.partnerName)} (\`${r.partnerId}\`) — ${r.count} troca(s)`).join('\n')
}

export default class HtrocaCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'htroca',
    description: 'Mostra o histórico de trocas de um usuário (staff)',
    usage: '/htroca @usuário (ou em resposta ao usuário)',
  }

  @CommandArgument([{ name: 'target', type: CommandArgumentType.USER_MENTION }])
  static override async execute(ctx: IncomingCommand, args: { target: string }) {
    const target = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', args.target)
    if (!target) {
      await reply(ctx, 'Não encontrei esse usuário. Ele já usou a bot?')
      return
    }

    const stats = await CardsDB.getTradeStats(target.id)
    const total = stats.initiated + stats.received
    if (total === 0) {
      await reply(ctx, `🔄 **${escapeMarkdown(target.displayName)}** não tem nenhuma troca registrada.`)
      return
    }

    const text = `🔄 Trocas de **${escapeMarkdown(target.displayName)}**

🔁 Realizadas no total: **${total}**
➡️ Iniciadas: **${stats.initiated}**
⬅️ Recebidas: **${stats.received}**

**Top 5 — quem mais recebeu cartas de ${escapeMarkdown(target.displayName)}**:
${topList(stats.topGiven)}

**Top 5 — quem mais deu cartas para ${escapeMarkdown(target.displayName)}**:
${topList(stats.topReceived)}`

    await reply(ctx, text)
  }
}
