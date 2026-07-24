import { rawClient, ensureRedisConnected } from "../redis"

export async function getCached(key: string): Promise<string | undefined> {
  await ensureRedisConnected()
  return (await rawClient.get(key)) ?? undefined
}

export async function setCached(key: string, value: string, ttlSeconds: number): Promise<void> {
  await ensureRedisConnected()
  await rawClient.set(key, value, { EX: ttlSeconds })
}

export async function deleteCached(key: string): Promise<void> {
  await ensureRedisConnected()
  await rawClient.del(key)
}
