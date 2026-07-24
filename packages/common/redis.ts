import { createClient } from 'redis'

export const rawClient = createClient({ url: process.env.REDIS_URL, RESP: 2 })

let connectPromise: ReturnType<typeof rawClient.connect> | null = null
export function ensureRedisConnected() {
  if (!connectPromise) connectPromise = rawClient.connect()
  return connectPromise
}
