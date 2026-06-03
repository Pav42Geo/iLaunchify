// @ilaunchify/logger — structured logging for the four apps + server packages
// (P6, docs/builds/_platform-v1-finish-line.md).
//
// Zero-dependency, structured-JSON to stdout/stderr. One JSON object per line,
// machine-parseable by Vercel / Sentry / any log drain. Default tags (app,
// requestId, actorUserId, …) attach via `child()` so every line in a request
// carries its context.
//
// Why not pino: pino's worker-thread transports don't run cleanly across Next's
// edge + node + RSC runtimes, and at V1 volume we don't need its throughput.
// This keeps the SAME call shape (logger.info(msg, fields) + child(fields)), so
// swapping in pino later is a one-file change if a transport is ever needed.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  /** Pass an Error (or anything) as the 2nd arg's `err` to capture name+message+stack. */
  error(message: string, fields?: LogFields): void
  /** Derive a logger that carries additional default tags (merged, child wins). */
  child(fields: LogFields): Logger
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function minLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase()
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env
  // Quieter by default in production; chatty in dev.
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

/** Normalize an Error stashed in fields.err into a serializable shape. */
function normalizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined
  const err = fields.err
  if (err instanceof Error) {
    return { ...fields, err: { name: err.name, message: err.message, stack: err.stack } }
  }
  return fields
}

function emit(level: LogLevel, message: string, base: LogFields, fields?: LogFields): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return
  const record = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...base,
    ...normalizeFields(fields),
  }
  let line: string
  try {
    line = JSON.stringify(record)
  } catch {
    // Circular / non-serializable field — fall back to a safe line.
    line = JSON.stringify({ level, time: record.time, msg: message, ...base })
  }
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line)
  // eslint-disable-next-line no-console
  else if (level === 'warn') console.warn(line)
  // eslint-disable-next-line no-console
  else console.log(line)
}

export function createLogger(base: LogFields = {}): Logger {
  return {
    debug: (m, f) => emit('debug', m, base, f),
    info: (m, f) => emit('info', m, base, f),
    warn: (m, f) => emit('warn', m, base, f),
    error: (m, f) => emit('error', m, base, f),
    child: (f) => createLogger({ ...base, ...f }),
  }
}

/**
 * App-scoped root logger. Pass the app/package name; `.child({ requestId,
 * actorUserId })` to bind per-request context.
 *
 *   const log = appLogger('payments')
 *   log.child({ event: 'invoice.payment_succeeded' }).error('handler failed', { err })
 */
export function appLogger(app: string): Logger {
  return createLogger({ app })
}
