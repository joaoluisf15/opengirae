import type { FilterDef } from '@girae/common/utilities/pageFilters'

export const ENTRY_FILTERS: FilterDef<never>[] = [
  { id: '1', emoji: '☀', description: 'que você possui', match: () => true },
  { id: '2', emoji: '🌙', description: 'que você não possui', match: () => true },
  { id: '3', emoji: '🥉', description: 'com raridade comum', match: () => true },
  { id: '4', emoji: '🥈', description: 'com raridade rara', match: () => true },
  { id: '5', emoji: '🥇', description: 'com raridade lendária', match: () => true },
]

const RARITY_FILTER_NAMES: Record<string, string> = { '3': 'Comum', '4': 'Raro', '5': 'Lendário' }

export function entryFilterConditions(active: string[]): { ownedFilter?: 'owned' | 'missing'; rarityNames?: string[] } {
  const rarityNames = active.map(id => RARITY_FILTER_NAMES[id]).filter((n): n is string => !!n)
  const ownedFilter = active.includes('1') ? 'owned' : active.includes('2') ? 'missing' : undefined
  return { ownedFilter, rarityNames: rarityNames.length > 0 ? rarityNames : undefined }
}
