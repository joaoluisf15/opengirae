// on dragonflydb, queue names must be between {}
const name = (name: string) => `{${name}${process.env.BULLMQ_QUEUE_SUFFIX ? '-' + process.env.BULLMQ_QUEUE_SUFFIX : ''}}`

export const COMMAND_QUEUE_NAME = name('commands')
export const RESPONSE_QUEUE_NAME = name('responses')
export const RESUME_QUEUE_NAME = name('resume')
export const QUICKVIEW_QUEUE_NAME = name('quickviews')
export const PAGE_QUEUE_NAME = name('pages')
export const UPLOAD_QUEUE_NAME = name('uploads')

export const DEFAULT_JOB_RETENTION = {
  removeOnComplete: { age: 60 * 60 * 24, count: 10_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7, count: 5_000 },
} as const
