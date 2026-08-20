type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error' | 'fatal'
type LogData = Record<string, unknown>
type LoggerFn = ((message: string, data?: LogData) => void) & {
  bold: (message: string, data?: LogData) => void
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  blue: '\x1b[34m',
  cyan: '\x1b[96m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[31m',
  brightRed: '\x1b[91m',
  magenta: '\x1b[35m'
} as const

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.cyan,
  success: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
  fatal: COLORS.brightRed
}

const TYPE_COLORS = {
  string: COLORS.white,
  number: COLORS.blue,
  boolean: COLORS.yellow,
  null: COLORS.magenta,
  key: COLORS.gray
} as const

const INDENT = 11

function time(): string {
  return new Date().toLocaleTimeString('es-ES', { hour12: false })
}

function wrap(text: string, max: number): string[] {
  if (text.length <= max) return [text]

  const lines: string[] = []
  let start = 0

  while (start < text.length) {
    lines.push(text.slice(start, start + max))
    start += max
  }

  return lines
}

function printKeyValue(key: string, value: unknown, indent: number): void {
  const width = process.stdout.columns ?? 80
  const keyText = TYPE_COLORS.key + key + ':' + COLORS.reset + ' '
  const keyWidth = key.length + 2
  const max = width - indent - keyWidth

  if (typeof value === 'string') {
    console.log(' '.repeat(indent) + keyText + TYPE_COLORS.string + value + COLORS.reset)
    return
  }

  if (typeof value === 'number') {
    console.log(' '.repeat(indent) + keyText + TYPE_COLORS.number + value + COLORS.reset)
    return
  }

  if (typeof value === 'boolean') {
    console.log(' '.repeat(indent) + keyText + TYPE_COLORS.boolean + value + COLORS.reset)
    return
  }

  if (value === null) {
    console.log(' '.repeat(indent) + keyText + TYPE_COLORS.null + 'null' + COLORS.reset)
    return
  }

  if (typeof value === 'object') {
    console.log(' '.repeat(indent) + keyText)
    for (const [k, v] of Object.entries(value as LogData)) {
      printKeyValue(k, v, indent + INDENT)
    }
    return
  }

  const text = String(value)
  const lines = wrap(text, max)

  console.log(' '.repeat(indent) + keyText + TYPE_COLORS.string + lines[0] + COLORS.reset)

  for (let i = 1; i < lines.length; i++) {
    console.log(
      ' '.repeat(indent + keyWidth) + TYPE_COLORS.string + lines[i] + COLORS.reset
    )
  }
}

function printData(data: LogData): void {
  for (const [key, value] of Object.entries(data)) {
    printKeyValue(key, value, INDENT)
  }
}

function createLogger(level: LogLevel): LoggerFn {
  const color = LEVEL_COLORS[level]

  const base = (message: string, data?: LogData, bold = false): void => {
    if (!message) return

    const ts = COLORS.gray + '[' + time() + ']' + COLORS.reset + ' '
    const title = color + (bold ? COLORS.bold : '') + message + COLORS.reset

    console.log(ts + title)

    if (data && Object.keys(data).length) {
      printData(data)
    }
  }

  const fn = ((message: string, data?: LogData) => base(message, data, false)) as LoggerFn
  fn.bold = (message: string, data?: LogData) => base(message, data, true)

  return fn
}

const logger: Record<LogLevel, LoggerFn> = {
  debug: createLogger('debug'),
  info: createLogger('info'),
  success: createLogger('success'),
  warn: createLogger('warn'),
  error: createLogger('error'),
  fatal: createLogger('fatal')
}

export default logger