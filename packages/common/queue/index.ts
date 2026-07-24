import { createNodeRedisClient, Queue, QueueEvents } from 'bullmq'
import { COMMAND_QUEUE_NAME, RESPONSE_QUEUE_NAME, RESUME_QUEUE_NAME, QUICKVIEW_QUEUE_NAME, PAGE_QUEUE_NAME } from './constants'
import { rawClient, ensureRedisConnected } from '../redis'

export { rawClient }
await ensureRedisConnected()

export const connection = createNodeRedisClient(rawClient)

export const commandQueue = new Queue(COMMAND_QUEUE_NAME, { connection })
export const responseQueue = new Queue(RESPONSE_QUEUE_NAME, { connection })
export const resumeQueue = new Queue(RESUME_QUEUE_NAME, { connection })
export const quickViewQueue = new Queue(QUICKVIEW_QUEUE_NAME, { connection })
export const pageQueue = new Queue(PAGE_QUEUE_NAME, { connection })

export const responseQueueEvents = new QueueEvents(RESPONSE_QUEUE_NAME, { connection })
