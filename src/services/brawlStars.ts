import { brawlStarsApiToken, token } from '@/config/env.ts'

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
  club?: {
    tag: string
    name: string
  }
}

export function normalizeBrawlTag(tag: string): string {
  return tag.replace(/^#/, '').replace(/\s/g, '').toUpperCase()
}

export async function getBrawlPlayer(tag: string): Promise<BrawlPlayer> {
  if (brawlStarsApiToken === '') {
    throw new Error('Falta BRAWL_STARS_API_TOKEN en las variables de entorno.')
  }

  const normalizedTag = normalizeBrawlTag(tag)

  if (!/^[0289PYLQGRJCUV]+$/.test(normalizedTag)) {
    throw new Error('El tag de Brawl Stars no tiene un formato válido.')
  }

  const response = await fetch(
    `https://api.brawlstars.com/v1/players/${encodeURIComponent(`#${normalizedTag}`)}`,
    {
      headers: {
        Authorization: `Bearer ${brawlStarsApiToken}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    }
  )

  if (response.status === 404) {
    throw new Error('No existe ningún jugador con ese tag.')
  }

  if (response.status === 429) {
    throw new Error('Se ha alcanzado el límite de peticiones de la API de Brawl Stars.')
  }

  if (response.status === 403) {
    throw new Error('La API de Brawl Stars ha rechazado la clave. Comprueba su configuración.')
  }

  if (!response.ok) {
    throw new Error(`Error de la API de Brawl Stars: ${response.status}`)
  }

  return await response.json() as BrawlPlayer
}