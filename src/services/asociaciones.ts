import { EmbedBuilder, type Client } from 'discord.js'
import Asociacion from '../models/Asociacion'
import logger from '../utils/logger'

// Canal donde se registran logs, avisos de renovación y salidas de representantes
export const ASOCIACIONES_LOG_CHANNEL_ID = '1557813125581906001'

// Categoría donde se crean los canales de asociación
export const ASOCIACIONES_CATEGORY_ID = '1544707760287912107'

// Rol que silencia el ping del aviso de renovación automática
export const ASOCIACIONES_PING_ROLE_ID = '1219196487011930194'

export const ASOCIACIONES_COLOR = 0x2ecc71

const DAY_MS = 24 * 60 * 60 * 1000

export const EMOJI = {
  asociacion: '🤝',
  representante: '👤',
  renovacion: '⏱️',
  canal: '📢',
  proxima: '📅',
  ultima: '⏮️',
  staff: '🛠️',
  servidor: '🏰',
  avisada: '🔔',
  creada: '🗓️'
} as const

export function greenEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(ASOCIACIONES_COLOR)
}

export function unix(date: Date | string | number): number {
  return Math.floor(new Date(date).getTime() / 1000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

// Quita la decoración del nombre del canal (bullets, corchetes, emojis). Ej: "•〔🪽〕etheria" -> "etheria"
export function cleanChannelName(rawName: string): string {
  return rawName
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Búsqueda por "servidor" ignorando mayúsculas/minúsculas
export function servidorFilter(servidor: string) {
  return { servidor: new RegExp(`^${escapeRegExp(servidor)}$`, 'i') }
}

// Los embeds de un mismo mensaje no pueden superar 10 embeds ni 6000 caracteres combinados
const MAX_EMBEDS_PER_MESSAGE = 10
const MAX_CHARS_PER_MESSAGE = 6000
export const FIELDS_PER_EMBED = 8

function embedCharLength(embed: EmbedBuilder): number {
  const data = embed.data
  let length = 0
  if (data.title) length += data.title.length
  if (data.description) length += data.description.length
  if (data.footer?.text) length += data.footer.text.length
  if (data.author?.name) length += data.author.name.length
  for (const field of data.fields ?? []) length += field.name.length + field.value.length
  return length
}

export function packEmbedsIntoMessages(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  const batches: EmbedBuilder[][] = []
  let current: EmbedBuilder[] = []
  let currentLength = 0

  for (const embed of embeds) {
    const len = embedCharLength(embed)
    if (current.length > 0 && (current.length >= MAX_EMBEDS_PER_MESSAGE || currentLength + len > MAX_CHARS_PER_MESSAGE)) {
      batches.push(current)
      current = []
      currentLength = 0
    }
    current.push(embed)
    currentLength += len
  }
  if (current.length > 0) batches.push(current)

  return batches
}

export async function sendAsociacionesLog(client: Client, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = await client.channels.fetch(ASOCIACIONES_LOG_CHANNEL_ID).catch(() => null)
    if (channel?.isSendable()) await channel.send({ embeds: [embed] }).catch(() => {})
  } catch (error) {
    logger.error('Asociaciones: error enviando log', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Avisa al staff de las asociaciones cuya fecha de renovación ya llegó
export async function checkDueAsociaciones(client: Client): Promise<void> {
  const due = await Asociacion.find({
    nextRenovationDate: { $lte: new Date() },
    renovacionAvisada: false
  })
  if (!due.length) return

  const channel = await client.channels.fetch(ASOCIACIONES_LOG_CHANNEL_ID).catch(() => null)
  if (!channel?.isSendable()) {
    logger.warn('Asociaciones: no se encontró el canal de avisos', { channelId: ASOCIACIONES_LOG_CHANNEL_ID })
    return
  }

  for (const asociacion of due) {
    const staffMention = asociacion.staffEncargadoId ? `<@${asociacion.staffEncargadoId}>` : null

    const embed = greenEmbed()
      .setTitle('🔄 Toca Renovar Asociación')
      .setDescription(
        `Ha llegado la fecha de renovación de la asociación con **${asociacion.servidor}**.\n\n` +
        `${EMOJI.representante} **Representante:** ${asociacion.representanteId ? `<@${asociacion.representanteId}>` : 'Sin asignar'}\n` +
        `${EMOJI.canal} **Canal:** <#${asociacion.canalId}>\n` +
        `${EMOJI.renovacion} **Frecuencia:** Cada ${asociacion.renovacionDias} días\n` +
        `${EMOJI.staff} **Staff Encargado:** ${staffMention ?? 'Sin asignar'}`
      )
      .setTimestamp()

    await channel.send({
      content: staffMention ?? '⚠️ Esta asociación no tiene staff encargado asignado.',
      embeds: [embed]
    }).catch(() => {})

    asociacion.renovacionAvisada = true
    await asociacion.save()
  }
}
