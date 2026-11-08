export enum BlacklistDuration {
  ONE_WEEK = 7,
  TWO_WEEKS = 14,
  ONE_MONTH = 30,
  TWO_MONTHS = 60,
  THREE_MONTHS = 90,
  FOUR_MONTHS = 120,
  FIVE_MONTHS = 150,
  SIX_MONTHS = 180,
  ONE_YEAR = 365
}

export type BlacklistType = 'tournaments' | 'economy'

export interface BlacklistEntry {
  addedBy: string
  reason: string
  durationDays: number | null
  createdAt: Date
  expiresAt: Date | null
}

export interface BlacklistData {
  discordId: string
  tournaments: BlacklistEntry | null
  economy: BlacklistEntry | null
}