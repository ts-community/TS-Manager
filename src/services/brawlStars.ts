import { brawlStarsApiToken } from '../config/env'
import logger from '../utils/logger'

export interface BrawlPlayer {
  tag: string
  name: string
  nameColor: string
  trophies: number
  highestTrophies: number
  expLevel: number
  expPoints: number
  '3vs3Victories': number
  soloVictories: number
  duoVictories: number
  /** Puntos de ranked actuales (Power League), puede ser undefined si no ha jugado. */
  rankedPoints?: number
  club?: {
    tag: string
    name: string
  }
}

export type BrawlClubRole = 'member' | 'president' | 'vicePresident' | 'senior'

export interface BrawlClubMember {
  tag: string
  name: string
  role: BrawlClubRole
}

interface BrawlClubMembersResponse {
  items?: Array<{ tag: string; name: string; role: BrawlClubRole }>
}

/** Error de la API que conserva el código HTTP para poder distinguir un 404. */
export class BrawlStarsApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BrawlStarsApiError'
    this.status = status
  }
}

export function normalizeBrawlTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\s/g, '').toUpperCase()
}

function isValidTag(normalizedTag: string): boolean {
  return /^[0289PYLQGRJCUV]+$/.test(normalizedTag)
}

async function brawlRequest<T>(pathname: string, notFoundMessage: string): Promise<T> {
  if (brawlStarsApiToken === '') {
    throw new Error('Falta BRAWL_STARS_API_TOKEN en las variables de entorno.')
  }

  const response = await fetch(`https://api.brawlstars.com/v1/${pathname}`, {
    headers: {
      Authorization: `Bearer ${brawlStarsApiToken}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new BrawlStarsApiError(notFoundMessage, 404)
    }

    if (response.status === 429) {
      throw new BrawlStarsApiError('Se ha alcanzado el límite de peticiones de la API de Brawl Stars.', 429)
    }

    if (response.status === 403) {
      throw new BrawlStarsApiError('La API de Brawl Stars ha rechazado la clave. Comprueba su configuración.', 403)
    }

    throw new BrawlStarsApiError(`Error de la API de Brawl Stars: ${response.status}`, response.status)
  }

  return await response.json() as T
}

export async function getBrawlPlayer(tag: string): Promise<BrawlPlayer> {
  const normalizedTag = normalizeBrawlTag(tag)

  if (!isValidTag(normalizedTag)) {
    throw new Error('El tag de Brawl Stars no tiene un formato válido.')
  }

  return brawlRequest<BrawlPlayer>(
    `players/${encodeURIComponent(`#${normalizedTag}`)}`,
    'No existe ningún jugador con ese tag.'
  )
}

export async function getBrawlClubMembers(clubTag: string): Promise<BrawlClubMember[]> {
  const normalizedTag = normalizeBrawlTag(clubTag)

  if (!isValidTag(normalizedTag)) {
    throw new Error('El tag del club no tiene un formato válido.')
  }

  const data = await brawlRequest<BrawlClubMembersResponse>(
    `clubs/${encodeURIComponent(`#${normalizedTag}`)}/members`,
    'No existe ningún club con ese tag.'
  )

  return (data.items ?? []).map((member) => ({
    tag: normalizeBrawlTag(member.tag),
    name: member.name,
    role: member.role
  }))
}

export async function getBrawlClubRank(clubTag: string, playerTag: string): Promise<BrawlClubRole | null> {
  const target = normalizeBrawlTag(playerTag)

  try {
    const members = await getBrawlClubMembers(clubTag)
    return members.find((member) => member.tag === target)?.role ?? null
  } catch (error) {
    logger.warn(`No se pudo obtener el rango del club ${clubTag} para ${playerTag}: ${(error as Error).message}`)
    return null
  }
}
