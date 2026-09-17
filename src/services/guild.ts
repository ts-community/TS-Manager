import { guildId } from '../config/env'
import { isSupportedCountryCode, normalizeCountryInput } from '../config/countries'
import type { GuildDocument } from '../models/Guild'
import Guild from '../models/Guild'

export interface ResolvedClub {
  tag: string
  countryCode: string
  /** true si el país viene de una entrada explícita, false si es el ES por defecto heredado */
  explicitCountry: boolean
}

export const DEFAULT_CLUB_COUNTRY = 'ES'

export function normalizeCountryCode(input: unknown, fallback = DEFAULT_CLUB_COUNTRY): string {
  const code = normalizeCountryInput(input)
  if (code && isSupportedCountryCode(code)) return code
  const fb = normalizeCountryInput(fallback)
  return fb && isSupportedCountryCode(fb) ? fb : DEFAULT_CLUB_COUNTRY
}

export function isValidCountryCode(input: unknown): input is string {
  return isSupportedCountryCode(input)
}

/** Tags en formato antiguo (string suelto) que aún no tienen país explícito. */
export function findLegacyClubTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return []
  const out: string[] = []
  for (const raw of rawTags) {
    if (typeof raw === 'string' && raw.trim()) {
      const value = raw.trim().toUpperCase()
      out.push(value.startsWith('#') ? value : `#${value}`)
    }
  }
  return [...new Set(out)]
}

function normalizeTagWithHash(tag: string): string {
  const value = tag.trim().toUpperCase()
  return value.startsWith('#') ? value : `#${value}`
}

/**
 * Normaliza clubTags aceptando el formato antiguo (string) y el nuevo
 * ({ tag, countryCode }). Devuelve tags con # y país en mayúsculas.
 */
export function resolveClubEntries(rawTags: unknown): ResolvedClub[] {
  if (!Array.isArray(rawTags)) return []

  const seen = new Set<string>()
  const entries: ResolvedClub[] = []

  for (const raw of rawTags) {
    let tag: string | null = null
    let country = DEFAULT_CLUB_COUNTRY
    let explicitCountry = false

    if (typeof raw === 'string') {
      tag = normalizeTagWithHash(raw)
    } else if (raw && typeof raw === 'object') {
      const obj = raw as { tag?: unknown; countryCode?: unknown; country?: unknown; pais?: unknown }
      if (typeof obj.tag === 'string' && obj.tag.trim()) {
        tag = normalizeTagWithHash(obj.tag)
      }
      const cc = obj.countryCode ?? obj.country ?? obj.pais
      const normalized = normalizeCountryInput(cc)
      if (normalized && isSupportedCountryCode(normalized)) {
        country = normalized
        explicitCountry = true
      }
    }

    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    entries.push({ tag, countryCode: country, explicitCountry })
  }

  return entries
}

let configCache: GuildDocument | null = null
let cacheTime = 0
const CACHE_DURATION = 60_000

async function loadGuildConfig(): Promise<GuildDocument> {
  let config = await Guild.findOne({ guildId })

  if (!config) {
    config = await Guild.create({ guildId })
  }

  return config
}

export async function getGuildConfig(forceRefresh = false): Promise<GuildDocument> {
  const now = Date.now()

  if (!forceRefresh && configCache && now - cacheTime < CACHE_DURATION) {
    return configCache
  }

  configCache = await loadGuildConfig()
  cacheTime = now

  return configCache
}

export async function addPurgeChannel(channelId: string, intervalMinutes: number): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $push: { purgeChannels: { channelId, intervalMinutes } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update purge channel configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}

export async function setStarboardThreshold(stars: number): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $set: { starboardThreshold: stars } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update starboard configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}

export async function removePurgeChannel(channelId: string): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $pull: { purgeChannels: { channelId } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update purge channel configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}