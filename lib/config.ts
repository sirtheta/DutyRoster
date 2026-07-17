export const config = {
  session: {
    maxAgeSec: parseInt(process.env.SESSION_MAX_AGE_SEC ?? "") || 7 * 24 * 60 * 60,
    updateAgeSec: parseInt(process.env.SESSION_UPDATE_AGE_SEC ?? "") || 24 * 60 * 60,
  },
  rateLimit: {
    maxAttempts: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS ?? "") || 5,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "") || 15 * 60 * 1000,
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS ?? "") || 10,
  },
  notifications: {
    cronSchedule: process.env.NOTIFY_CRON_SCHEDULE || "0 * * * *",
  },
  rotation: {
    defaultBlockSize: parseInt(process.env.ROTATION_BLOCK_SIZE ?? "") || 5,
  },
  holidays: {
    defaultCanton: process.env.DEFAULT_CANTON || "BE",
  },
} as const;
