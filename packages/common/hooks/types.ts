import type { Platform } from '../commands/types'

export interface CompletedSubcategory {
  subcategoryId: number
  subcategoryName: string
  coinsAwarded: number
}

// fired when a user's owned count for a card goes up; completedSubcategories is already resolved by the *DB call that granted the card.
export interface CardsNewEvent {
  userId: number
  cardId: number
  previousCount: number
  newCount: number
  telegramId: string
  displayName: string
  platform: Platform
  completedSubcategories?: CompletedSubcategory[]
}

export interface HookEventMap {
  'cards:new': CardsNewEvent
}

export type HookEventName = keyof HookEventMap
