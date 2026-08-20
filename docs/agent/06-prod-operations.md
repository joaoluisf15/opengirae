# Prod operations

Things that come up when asked to investigate or fix something against *live*
prod data, not local dev — connecting to the real Postgres/Dragonfly, undoing
an accidental card transfer, and detecting the recurring card-catalog
scraping attack. All of this is against real user data; read this whole file
before touching prod, not just the section that looks relevant.

## Connecting

Prod connection details aren't checked into this repo (correctly — get them
from whoever owns the deployment, not from here) and aren't the same as the
local docker Postgres/Redis `01-setup.md` describes. When given prod access:

- Confirm which environment a hostname actually points at before trusting its
  name — a host called "dev" has been repurposed as prod before here. Check
  row counts / recent activity, don't assume from the name.
- Prod's DBOS system database is a separate database on the same Postgres
  instance (not necessarily named `..._dbos_sys` the way local dev's is) —
  `\l` to find it, then `\dt dbos.*` for its tables. `workflow_status.name` is
  the command's registered workflow name (often just `"execute"`, not the
  command name), so match by `workflow_inputs`/`workflow_status.inputs`
  content (author/target platform IDs, command args), not by `name`.
- Treat every session as read-only until a specific write is confirmed. Query
  first, mutate only once you can point at the exact row(s) and have shown
  the plan to whoever asked.

## Reverting an accidental card transfer (`/doar`, `/trade`)

**Only `/doar` writes an audit log entry** (`audit_logs.action = 'card.doar'`,
`metadata: { recipientUserId, cardIds }` — donor is `actorUserId`). `/trade`
(two-sided) does not audit-log at all today; if asked to revert a `/trade`,
you'll need to reconstruct it from DBOS `workflow_inputs` (see below) since
there's no audit trail to start from — say so up front rather than assuming
one exists.

**Caveat on `card.doar`'s `cardIds`**: it's `offerA.map(o => o.cardId)` —
*distinct* card IDs only, with duplicates from a quantity >1 collapsed to one
entry. It also silently drops any card the donor didn't have enough of at
confirm time (`doar.ts`'s `skippedIds`) — those were never actually
transferred, don't revert them. Neither the count-per-card nor which
requested IDs got skipped is recoverable from the audit log alone.

**To get exact per-card quantities**, cross-reference DBOS
`dbos.workflow_status.inputs` for the matching `execute`/`doar` workflow
(match by donor/recipient Telegram IDs from `linked_accounts` and a
timestamp close to the audit log's `createdAt` — the confirm-button click
lands a few seconds after the workflow starts). The raw command args (e.g.
`/doar 528 4 4 30 ...`) is the actual token list the user typed, duplicates
and all — count occurrences yourself, then subtract any ID that's in the
typed list but missing from the audit log's `cardIds` (that's a skipped one).

**Before reverting, always check**:
1. Does the recipient still hold at least the transferred quantity of every
   card? If they've since spent/re-traded some, a full reversal isn't
   possible without either short-changing the original donor or going
   negative — stop and say so rather than partially reverting silently.
2. Does either side have `customEmoji`/`customMediaUrl` set on the affected
   `user_cards` rows? If the recipient's count would need to be preserved
   above the card's `rarities.cativeiroThreshold` for the reversal not to
   clear their own customization on an *unrelated* higher-count card, check
   first — this mirrors `CardsDB.executeTrade`'s `decrement()` clearing logic
   (`docs/agent/02-architecture.md` doesn't cover this, see `cards.ts`).
3. Would giving the cards back complete a subcategory for the original owner
   that they hadn't already completed? `subcategoryCompletionRewards` has a
   unique `(userId, subcategoryId)` constraint, so a duplicate claim can't
   double-pay — but a *new* completion should pay out, and a raw hand-written
   reversal query won't fire that reward on its own. Check first: is there a
   subcategory where the owner would now hold every card, and it isn't
   already in `subcategoryCompletionRewards` for them? If none, a plain
   `user_cards` count swap is safe and complete.

**Write the reversal as raw SQL in one transaction** (this codebase's
convention for any prod write — no throwaway TS/JS scripts), mirroring what
`executeTrade` would have done: decrement the recipient's `count`, delete the
row if it hits 0, upsert (`INSERT ... ON CONFLICT DO UPDATE SET count =
user_cards.count + EXCLUDED.count`) the original owner's row back up. Back up
the affected `user_cards` rows (`\copy ... TO 'backup.csv' WITH CSV HEADER`)
before running it. Log the reversal itself to `audit_logs` (a new action like
`card.doar.revert`, metadata pointing at the original audit log id/workflow
id) so there's a trail explaining why the counts moved without a matching
`/doar` in the bot's own command history.

## Traffic/abuse analysis: card-catalog scraping

A recurring attack: an account scrapes the full card catalog (name/art/
rarity per card) to recreate it on a rival bot. Not a one-off — worth
recognizing the pattern on sight.

**Pattern**: `/clc` or `/col <subcategory>` (lists every card ID in a
subcategory in one reply — the harvesting step) followed by sequential
`/card <id>` calls for each ID from that list, a few seconds apart, to pull
name/art/rarity individually. Observed only in the attacker's own DM with the
bot, never a group. The account is usually a same-day burner: blank/placeholder
`displayName`, 0 coins, no real `card_draw_history`/`user_cards`/`audit_logs`
activity.

**Investigating**: bounded Dragonfly `commandQueue` traffic analysis — scope
scans by a binary-searched timestamp/id range, never a full-keyspace `SCAN`
(see `05-debugging.md`'s general Dragonfly guidance). Pull `name`,
`timestamp`, `author.id`, `chat.id`, `args` per job (a server-side Lua
`string.match` per field keeps a 10k+ job dump parseable), group by
`author.id`, and look for: high `/card` volume from one author; strictly
ascending integer args with small, consistent gaps (a script, not a human
browsing); a `/clc`/`/col` call shortly before a run of sequential `/card`
ids drawn from that subcategory. Cross-check the suspect `users.id` in
Postgres for the burner tells above.

**Retention caveat**: `commandQueue` only retains ~24h/10k completed jobs
going forward. An account's full history back to creation may not be
recoverable if it's more than a day old — investigate promptly when a
suspicious account is first spotted.

**Response**: prefer `users.obscureMode` over an outright ban. When set,
`/card` (`packages/commandeer/commands/cards/card.ts`) returns a fresh random
name and a placeholder image instead of the real card, for that viewer only —
the command still "succeeds" outwardly, so the scraper keeps harvesting
garbage instead of noticing detection and burning a fresh account. Reserve
`isBanned` for when you want the account to know it's caught. Note
`isBanned` alone doesn't block general commands — only `strade.ts`/
`trade.ts`/`doar.ts` and the general command dispatcher
(`packages/commandeer/services/commands.ts`) check it.
