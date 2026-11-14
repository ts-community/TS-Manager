export const SPAIN_TIME_ZONE = 'Europe/Madrid'

export interface DateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SPAIN_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

const displayFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: SPAIN_TIME_ZONE,
  hourCycle: 'h23',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
})

export function getSpainParts(date: Date): DateTimeParts {
  const parts = partsFormatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find(item => item.type === type)?.value
    return part ? Number(part) : 0
  }

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second')
  }
}

function getSpainOffsetMs(date: Date): number {
  const parts = getSpainParts(date)

  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    date.getTime()
  )
}

export function spainDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let timestamp = wallClock

  for (let index = 0; index < 2; index += 1) {
    timestamp = wallClock - getSpainOffsetMs(new Date(timestamp))
  }

  return new Date(timestamp)
}

export function formatSpainDateTime(date: Date): string {
  return displayFormatter.format(date)
}

export function formatSpainDate(date: Date): string {
  const parts = getSpainParts(date)
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`
}