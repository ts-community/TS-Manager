import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type Client,
  type Message,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js'
import Asociacion, { type AsociacionDocument } from '../models/Asociacion'
import AsociacionesPanel, { PANEL_KEY, type AsociacionesPanelDocument } from '../models/AsociacionesPanel'
import { guildId as botGuildId } from '../config/env'
import { getGuildConfig } from './guild'
import logger from '../utils/logger'

// Re-export logger for consumers
export { logger }

// Type alias for Discord.js Container (Components V2)
export type Container = InstanceType<typeof ContainerBuilder>

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

// Convierte un nombre de staff a formato compatible con Discord (normalización que hace Discord automáticamente)
export function normalizeStaffName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD') // Descompone acentos
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (acentos)
    // Reemplazar caracteres que Discord elimina por guiones o nada
    .replace(/[|()[\]{}]/g, '') // Eliminar paréntesis, corchetes, llaves, pipes
    .replace(/[^\w\s\-_.~]/g, '') // Solo caracteres que Discord permite
    .replace(/\s+/g, '-') // Espacios → guiones
    .replace(/-+/g, '-') // Múltiples guiones → uno solo
    .replace(/^-|-$/g, '') // Quita guiones al inicio/final
    .trim()
}

// Aplica la misma normalización que Discord hace automáticamente a los nombres de canales
export function normalizeDiscordChannelName(channelName: string): string {
  return channelName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-_.~]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

// Crea el nombre final del canal como lo creará Discord (prefijo + nombre normalizado + sufijo)
export function createDiscordChannelName(staffDisplayName: string): string {
  const normalizedName = normalizeStaffName(staffDisplayName)
  return `${STAFF_CHANNEL_PREFIX}${normalizeDiscordChannelName(normalizedName)}${STAFF_CHANNEL_SUFFIX}`
}

// Nombre display a partir del canal: "「❤」el-sotano-oficial" -> "El Sotano Oficial"
export function titleFromChannelName(rawName: string): string {
  return cleanChannelName(rawName)
    .split(/\s+/)
    .filter(Boolean)
    .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ')
}

// Nombre de canal en formato minúsculas-con-guiones: "El Sótano Oficial" -> "el-sotano-oficial"
export function toChannelSlug(display: string): string {
  return display
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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

// Funciones de editor (fusionadas de asociacionesEditor.ts)
export function buildEditorPayload(
  a: AsociacionLike,
  { canDelete = false } = {}
): { flags: number, components: Container[] } {
  const next = unix(a.nextRenovationDate)
  const dotId = asocId(a)

  const select = new StringSelectMenuBuilder()
    .setCustomId(`asoc-edit-campo:${dotId}`)
    .setPlaceholder('Selecciona el campo a editar')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Nombre').setValue('nombre').setEmoji('🏷️'),
      new StringSelectMenuOptionBuilder().setLabel('Representante').setValue('representante').setEmoji('👤'),
      new StringSelectMenuOptionBuilder().setLabel('Staff encargado').setValue('staff-encargado').setEmoji('🛠️'),
      new StringSelectMenuOptionBuilder().setLabel('Canal').setValue('canal').setEmoji('📢'),
      new StringSelectMenuOptionBuilder().setLabel('Frecuencia de renovación').setValue('renovacion').setEmoji('⏱️')
    )

  const buttons: ButtonBuilder[] = [new ButtonBuilder().setCustomId(`asoc-btn-ver:${dotId}`).setLabel('Ver tarjeta').setStyle(ButtonStyle.Secondary)]
  if (canDelete) {
    buttons.push(new ButtonBuilder().setCustomId(`asoc-btn-eliminar:${dotId}`).setLabel('Eliminar').setStyle(ButtonStyle.Danger))
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ✏️ Editar: ${a.servidor}\n-# <#${a.canalId}> · próxima renovación <t:${next}:d>`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Selecciona **un campo** del menú para editarlo. Los cambios se guardan al momento y los paneles se actualizan solos.')
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

// Mensaje público de confirmación previa a eliminar (fusionado de asociacionesPanel.ts)
export function buildRemoveConfirmPayload(a: AsociacionLike): { embeds: EmbedBuilder[], components: ActionRowBuilder<ButtonBuilder>[] } {
  const dotId = asocId(a)
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle(`🗑️ Eliminar asociación — ${a.servidor}`)
    .setDescription(
      `${EMOJI.canal} Canal: <#${a.canalId}>\n\n` +
      `Confirmar **borra** la asociación de la lista y los paneles.\n` +
      `El canal de Discord **no** se borra.\n\n` +
      `Si no es eso, pulsa **Cancelar**.`
    )
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`asoc-btn-eliminar-confirmar:${dotId}`).setLabel('🗑️ Confirmar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`asoc-btn-eliminar-cancelar:${dotId}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
      )
    ]
  }
}

// Tarjeta V2 fusionada (de asociacionesPanel.ts)
export function buildAssociationDetailPayload(
  a: AsociacionLike,
  { canEdit = true, canDelete = false } = {}
): { flags: number, components: Container[] } {
  const next = unix(a.nextRenovationDate)
  const last = unix(a.lastRenovationDate)
  const created = unix(a.createdAt)
  const dotId = asocId(a)

  const container = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🤝 ${a.servidor}\n-# <#${a.canalId}> · creada <t:${created}:d>`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : '*Sin asignar*'}`,
          `${EMOJI.staff} **Staff encargado:** ${a.staffEncargadoId ? `<@${a.staffEncargadoId}>` : '*Sin asignar*'}`,
          `${EMOJI.renovacion} **Frecuencia:** cada ${a.renovacionDias} día(s)`,
          `${EMOJI.proxima} **Próxima renovación:** <t:${next}:d> (<t:${next}:R>)`,
          `${EMOJI.ultima} **Última renovación:** <t:${last}:d>`
        ].join('\n')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))

  const buttons: ButtonBuilder[] = []
  if (canEdit) {
    buttons.push(
      new ButtonBuilder().setCustomId(`asoc-btn-editar:${dotId}`).setLabel('Editar').setStyle(ButtonStyle.Secondary)
    )
  }
  if (canDelete) {
    buttons.push(
      new ButtonBuilder().setCustomId(`asoc-btn-eliminar:${dotId}`).setLabel('Eliminar').setStyle(ButtonStyle.Danger)
    )
  }
  if (buttons.length > 0) {
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))
  }

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

// ===== Panel types & functions (fusionados de asociacionesPanel.ts) =====

// Canal/hilo donde vive el panel "en vivo" del estado de asociaciones
export const ASOCIACIONES_LIVE_THREAD_ID = '1562220631783903382'
// Nombre del canal privado del staff (posicionado en la categoría de asociaciones)
export const STAFF_PANEL_NAME = '₊୧ panel-asociaciones ୨₊'
// Iconos decorativos para los canales de staff (prefijo y sufijo) - formato compatible con Discord
export const STAFF_CHANNEL_PREFIX = '﹏︿'
export const STAFF_CHANNEL_SUFFIX = '︿﹏'
// Roles encargados de alianzas / cazas (IDs configurados)
export const ALIANZAS_ROLE_IDS = [
  '1170449867823382649',
  '1305269600962871367',
  '1305272031729680444',
  '1305273508921737226'
]

// En Components V2 el límite de texto por mensaje es 4000 chars
const MAX_CONTAINER_CHARS = 3800

export interface StaffGroup {
  staffId: string | null
  nombre: string
  items: AssociationBlockData[]
}

export interface AssociationBlockData {
  servidor: string
  canalId: string
  representanteId: string | null
  renovacionDias: number
  nextRenovationDate: Date
  emoji: string
}

export interface AsociacionLike {
  id?: string
  _id?: unknown
  servidor: string
  canalId: string
  representanteId: string | null
  staffEncargadoId: string | null
  renovacionDias: number
  lastRenovationDate: Date
  nextRenovationDate: Date
  createdAt: Date
}

export function asocId(a: AsociacionLike): string {
  return a.id ?? String(a._id ?? '')
}

function emojiFromChannelName(channelName: string | undefined): string {
  const match = /「(.+?)」/.exec(channelName ?? '')
  return match?.[1] ?? '☕'
}

export function staffChannelName(nombre: string): string {
  return createDiscordChannelName(nombre)
}

export function associationBlock(a: AssociationBlockData): string {
  const next = unix(a.nextRenovationDate)
  return [
    `### ${a.emoji} ${a.servidor} (<#${a.canalId}>)`,
    `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : '*Sin asignar*'}`,
    `${EMOJI.renovacion} **Frecuencia:** cada ${a.renovacionDias} días`,
    `${EMOJI.proxima} **Próxima renovación:** <t:${next}:R>`
  ].join('\n')
}

function textContainer(content: string): Container {
  return new ContainerBuilder().setAccentColor(ASOCIACIONES_PANEL_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
}

export const ASOCIACIONES_PANEL_COLOR = 0x9B4DFF

function groupCard(
  group: StaffGroup,
  options: { hideHeader?: boolean, title?: string | null, trailer?: boolean } = {}
): Container[] {
  const headerText = options.hideHeader
    ? null
    : `${group.staffId ? `### ${EMOJI.staff} ${group.nombre}` : `### 💤 Sin asignar`} (${group.items.length})`

  const trailerText = `-# Actualizado: <t:${unix(new Date())}:R>`

  const blocks = group.items.map(associationBlock)
  if (!blocks.length) {
    const emptyLine = group.staffId ? '-# *Nada por ahora.*' : '-# *No hay ninguna asociación sin asignar.*'
    const builder = new ContainerBuilder().setAccentColor(ASOCIACIONES_PANEL_COLOR)
    if (options.title) {
      builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(options.title))
      builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    }
    if (headerText) builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
    builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(emptyLine))
    if (options.trailer) {
      builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(trailerText))
    }
    return [builder]
  }

  const containers: Container[] = []
  let builder: ContainerBuilder | null = null
  let length = 0
  let firstInCard = true
  let titleInjected = false

  const startCard = () => {
    builder = new ContainerBuilder().setAccentColor(ASOCIACIONES_PANEL_COLOR)
    containers.push(builder)
    length = 0
    firstInCard = true
    if (!titleInjected && options.title) {
      builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(options.title))
      builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      length += options.title.length
      titleInjected = true
    }
    if (headerText) {
      builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
      length += headerText.length
    }
  }

  for (const block of blocks) {
    if (!builder || length + block.length > MAX_CONTAINER_CHARS) startCard()
    const current = builder!
    if (!firstInCard) {
      current.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    }
    current.addTextDisplayComponents(new TextDisplayBuilder().setContent(block))
    length += block.length
    firstInCard = false
  }

  if (options.trailer && builder !== null) {
    const last = builder as ContainerBuilder
    last.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    last.addTextDisplayComponents(new TextDisplayBuilder().setContent(trailerText))
  }

  return containers
}

export function renderStaffCenter(
  groups: StaffGroup[],
  options: { title?: string, hideGroupHeaders?: boolean } = {}
): Container[] {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)
  const title = options.title ?? `## ☕ Lista de Asociaciones (${total})`

  if (!groups.length) {
    return [textContainer(`${title}\n-# *Sin asociaciones registradas.*`)]
  }

  const cards: Container[] = []
  groups.forEach((group, index) => {
    cards.push(...groupCard(group, {
      hideHeader: options.hideGroupHeaders ?? false,
      title: index === 0 ? title : null,
      trailer: index === groups.length - 1
    }))
  })
  return cards
}

export function normalizeSortKey(input: string): string {
  return input
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function compareNames(a: string, b: string): number {
  return normalizeSortKey(a).localeCompare(normalizeSortKey(b), 'es')
}

let staffCache: { at: number, groups: StaffGroup[] } | null = null
const STAFF_CACHE_TTL = 5 * 60 * 1000

export async function fetchStaffGroups(client: Client): Promise<StaffGroup[]> {
  if (staffCache && Date.now() - staffCache.at < STAFF_CACHE_TTL) return staffCache.groups

  const all = await Asociacion.find()
  const grouped = new Map<string, AsociacionDocument[]>()
  for (const a of all) {
    const key = a.staffEncargadoId ?? 'sin-asignar'
    const list = grouped.get(key)
    if (list) list.push(a)
    else grouped.set(key, [a])
  }

  const guild = client.guilds.cache.get(botGuildId) ?? await client.guilds.fetch(botGuildId).catch(() => null)

  const groups: StaffGroup[] = []
  for (const [key, items] of grouped.entries()) {
    items.sort((a, b) => compareNames(a.servidor, b.servidor))
    const enriched = items.map(item => ({
      servidor: item.servidor,
      canalId: item.canalId,
      representanteId: item.representanteId,
      renovacionDias: item.renovacionDias,
      nextRenovationDate: item.nextRenovationDate,
      emoji: emojiFromChannelName(guild?.channels.cache.get(item.canalId)?.name)
    } satisfies AssociationBlockData))

    if (key === 'sin-asignar') {
      groups.push({ staffId: null, nombre: 'Sin asignar', items: enriched })
      continue
    }
    const member = guild ? await guild.members.fetch(key).catch(() => null) : null
    groups.push({
      staffId: key,
      nombre: member?.displayName ?? `ID ${key}`,
      items: enriched
    })
  }

  groups.sort((a, b) => {
    if (!a.staffId) return 1
    if (!b.staffId) return -1
    return compareNames(a.nombre, b.nombre)
  })

  if (!groups.some(g => !g.staffId)) {
    groups.push({ staffId: null, nombre: 'Sin asignar', items: [] })
  }

  staffCache = { at: Date.now(), groups }
  return groups
}

export function invalidateStaffCache(): void {
  staffCache = null
}

const contentCache = new Map<string, string>()

function containerDigest(container: Container): string {
  return JSON.stringify(container.toJSON())
}

async function syncMessages(
  channel: { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } },
  containers: Container[],
  ids: string[]
): Promise<string[]> {
  const nextIds: string[] = []

  for (let i = 0; i < containers.length; i++) {
    const digest = containerDigest(containers[i])
    const cacheKey = `${channel.id}:${i}`
    const existingId = ids[i]
    nextIds.push(existingId ?? '')
    if (contentCache.get(cacheKey) === digest && existingId) continue

    const payload = { flags: MessageFlags.IsComponentsV2, components: [containers[i]] }
    try {
      if (existingId) {
        const message = await channel.messages.fetch(existingId) as unknown as { edit: (p: unknown) => Promise<unknown> }
        await message.edit(payload)
        contentCache.set(cacheKey, digest)
        continue
      }
    } catch {
      contentCache.delete(cacheKey)
    }

    try {
      const created = await channel.messages.send(payload)
      nextIds[i] = created.id
      contentCache.set(cacheKey, digest)
    } catch (error) {
      logger.error('AsociacionesPanel: no se pudo enviar el mensaje del panel', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  for (let i = containers.length; i < ids.length; i++) {
    const staleId = ids[i]
    contentCache.delete(`${channel.id}:${i}`)
    await channel.messages.delete(staleId).catch(() => {})
  }

  return nextIds.filter(Boolean)
}

async function syncV2Channel(
  channel: { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } },
  containers: Container[],
  currentIds: string[]
): Promise<string[]> {
  return syncMessages(channel, containers, currentIds)
}

async function ensureStaffPanelChannel(client: Client, doc: AsociacionesPanelDocument): Promise<{ channel: { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } } | null, created: boolean }> {
  if (doc.staffPanelChannelId) {
    const channel = await client.channels.fetch(doc.staffPanelChannelId).catch(() => null)
    if (channel?.isTextBased()) {
      const textChannel = channel as TextChannel
      if (textChannel.name !== STAFF_PANEL_NAME) {
        await textChannel.setName(STAFF_PANEL_NAME, 'Corrección de nombre del panel de staff').catch(() => {})
      }
      return { channel: textChannel as unknown as { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } }, created: false }
    }
  }

const guild = client.guilds.cache.get(botGuildId) ?? await client.guilds.fetch(botGuildId).catch(() => null)
  if (!guild) return { channel: null, created: false }

  const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
  if (!category || category.type !== ChannelType.GuildCategory) {
    logger.warn('AsociacionesPanel: categoría de asociaciones no disponible', { categoryId: ASOCIACIONES_CATEGORY_ID })
    return { channel: null, created: false }
  }

  const config = await getGuildConfig()
  const overwrites: { id: string, allow?: bigint[], deny?: bigint[] }[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ]
  const created = await guild.channels.create({
    name: STAFF_PANEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites as never
  })

  doc.staffPanelChannelId = created.id
  doc.staffPanelMessageIds = []
  await doc.save()
  logger.info('AsociacionesPanel: canal privado del staff creado', { channelId: created.id })
  return { channel: created as unknown as { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } }, created: true }
}

async function resolveGuild(client: Client) {
  return client.guilds.cache.get(botGuildId) ?? await client.guilds.fetch(botGuildId).catch(() => null)
}

async function ensureStaffChannel(
  client: Client,
  guild: NonNullable<Awaited<ReturnType<typeof resolveGuild>>>,
  doc: AsociacionesPanelDocument,
  staffId: string,
  desiredName: string
): Promise<{ channelId: string, messageIdFirst?: string, created: boolean }> {
  const entry = doc.staffChannels.find(e => e.staffId === staffId)

  if (entry) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (!channel?.isTextBased()) {
      doc.staffChannels = doc.staffChannels.filter(e => e.staffId !== staffId)
      doc.markModified('staffChannels')
      await doc.save()
    }
  }

  const config = await getGuildConfig()
  const overwrites: { id: string, allow?: bigint[], deny?: bigint[] }[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ]
  for (const roleId of config.staffRoleIds) {
    overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] })
  }
  for (const cazaRoleId of ALIANZAS_ROLE_IDS) {
    overwrites.push({ id: cazaRoleId, allow: [PermissionFlagsBits.ViewChannel] })
  }
  overwrites.push({ id: staffId, allow: [PermissionFlagsBits.ViewChannel] })

  const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
  if (!category || category.type !== ChannelType.GuildCategory) {
    logger.warn('AsociacionesPanel: categoría de asociaciones no disponible para canal de staff')
    return { channelId: '', created: false }
  }

  if (entry) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (channel?.isTextBased()) {
      const c = channel as unknown as { type: number; parentId: string | null; name: string; setName: (n: string, r?: string) => Promise<unknown>; permissionOverwrites: { edit: (id: string, o: unknown) => Promise<unknown> } }
      if ((c as unknown as { parentId: string | null }).parentId !== category.id) {
        await (c as unknown as { setParent: (id: string) => Promise<unknown> }).setParent(category.id).catch(() => {})
      }
      if (c.name !== desiredName) await c.setName(desiredName, 'Sincronización del panel de staff').catch(() => {})
      return { channelId: entry.channelId, created: false }
    }
  }

  const created = await guild.channels.create({
    name: desiredName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites as never
  })

  if (entry) {
    doc.staffChannels = doc.staffChannels.filter(e => e.staffId !== staffId)
  }
  doc.staffChannels.push({ staffId, channelId: created.id, messageIds: [] })
  doc.markModified('staffChannels')
  await doc.save()

  return { channelId: created.id, created: true }
}

async function pruneStaffChannels(client: Client, doc: AsociacionesPanelDocument, active: Set<string>): Promise<void> {
  const stale = doc.staffChannels.filter(entry => !active.has(entry.staffId))
  const guild = await resolveGuild(client)
  for (const entry of stale) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (channel && 'deletable' in channel && (channel as unknown as { deletable: boolean }).deletable) {
      await (channel as unknown as { delete: (r?: string) => Promise<unknown> }).delete('Sin asociaciones activas').catch(() => {})
    }
    doc.staffChannels = doc.staffChannels.filter(e => e.channelId !== entry.channelId)
  }
  if (stale.length) {
    doc.markModified('staffChannels')
    await doc.save()
  }
}

async function orderCategoryChannels(
  guild: NonNullable<Awaited<ReturnType<typeof resolveGuild>>>,
  doc: AsociacionesPanelDocument,
  groups: StaffGroup[]
): Promise<void> {
  const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
  if (!category || category.type !== ChannelType.GuildCategory) return

  type ChildChannel = { id: string, name: string, rawPosition: number }
  const children = guild.channels.cache.filter(c => c.parentId === category.id) as unknown as Map<string, ChildChannel>

  const panelChannel = doc.staffPanelChannelId ? children.get(doc.staffPanelChannelId) : undefined

  const assocByStaff: Map<string, { server: string, canalId: string }[]> = new Map()
  for (const group of groups.filter(g => g.staffId)) {
    assocByStaff.set(group.staffId!, group.items.map(item => ({ server: item.servidor, canalId: item.canalId })))
  }

  const target: ChildChannel[] = []

  if (panelChannel) target.push(panelChannel)

  const sortedStaffGroups = [...groups.filter(g => g.staffId)].sort((a, b) => compareNames(a.nombre, b.nombre))

  for (const group of sortedStaffGroups) {
    const entry = doc.staffChannels.find(e => e.staffId === group.staffId)
    const staffChannel = entry ? children.get(entry.channelId) : undefined
    if (staffChannel) target.push(staffChannel)

    const assocs = assocByStaff.get(group.staffId!) || []
    const assocChannels = [...children.values()]
      .filter(c => assocs.some(a => a.canalId === c.id))
      .sort((a, b) => compareNames(assocByStaff.get(group.staffId!)!.find(x => x.canalId === a.id)!.server, assocByStaff.get(group.staffId!)!.find(x => x.canalId === b.id)!.server))
    target.push(...assocChannels)
  }

  const sinAsignar = groups.find(g => !g.staffId)
  if (sinAsignar) {
    const assocChannels = [...children.values()]
      .filter(c => sinAsignar.items.some(item => item.canalId === c.id))
      .sort((a, b) => compareNames(sinAsignar.items.find(i => i.canalId === a.id)!.servidor, sinAsignar.items.find(i => i.canalId === b.id)!.servidor))
    target.push(...assocChannels)
  }

  const managedIds = new Set<string>([doc.staffPanelChannelId, ...doc.staffChannels.map(e => e.channelId)].filter(Boolean))
  const others = [...children.values()]
    .filter(c => !managedIds.has(c.id))
    .sort((a, b) => a.rawPosition - b.rawPosition)
  target.push(...others)

  const changed = target.some((c, index) => c.rawPosition !== index)
  if (!changed) return

  await guild.channels.setPositions(
    target.map((c, index) => ({ channel: c.id, position: index })) as never
  ).catch(() => {})
  logger.info('AsociacionesPanel: canales de la categoría reordenados', { cantidad: target.length })
}

const FAST_SYNC_DELAY_MS = 10_000
const SLOW_SYNC_DELAY_MS = 30 * 60 * 1000

let fastTimer: NodeJS.Timeout | null = null
let slowTimer: NodeJS.Timeout | null = null
let syncPending = false

function runSync(client: Client): void {
  fastTimer = null
  slowTimer = null
  void syncPanels(client).catch(() => {})
}

export function schedulePanelsSync(client: Client, delayMs = FAST_SYNC_DELAY_MS): void {
  if (slowTimer) { clearTimeout(slowTimer); slowTimer = null }
  if (fastTimer) return
  fastTimer = setTimeout(() => runSync(client), delayMs).unref?.() ?? null
}

export function scheduleRenewalPanelSync(client: Client): void {
  if (fastTimer || slowTimer) return
  slowTimer = setTimeout(() => runSync(client), SLOW_SYNC_DELAY_MS).unref?.() ?? null
}

export async function syncPanels(client: Client): Promise<void> {
  if (syncPending) return
  syncPending = true
  try {
    invalidateStaffCache()
    const doc = await loadPanelConfig()
    const groups = await fetchStaffGroups(client)

    await syncLiveThread(client, groups)
    await syncStaffPanel(client, doc, groups)
    await syncPerStaffChannels(client, doc, groups)

    const guild = await resolveGuild(client)
    if (guild) await orderCategoryChannels(guild, doc, groups)
  } catch (error) {
    logger.error('AsociacionesPanel: error sincronizando paneles', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    syncPending = false
  }
}

async function loadPanelConfig(): Promise<AsociacionesPanelDocument> {
  const doc = await AsociacionesPanel.findOne({ key: PANEL_KEY })
  return doc ?? await AsociacionesPanel.create({ key: PANEL_KEY })
}

async function syncLiveThread(client: Client, groups: StaffGroup[]): Promise<void> {
  const thread = await client.channels.fetch(ASOCIACIONES_LIVE_THREAD_ID).catch(() => null)
  if (!thread || !('isThread' in thread) || !thread.isThread()) {
    logger.warn('AsociacionesPanel: no se encontró el hilo en vivo de asociaciones', { threadId: ASOCIACIONES_LIVE_THREAD_ID })
    return
  }

  const doc = await loadPanelConfig()
  const containers = renderStaffCenter(groups)
  const ids = await syncV2Channel(thread as unknown as { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } }, containers, doc.liveMessageIds ?? [])
  doc.liveMessageIds = ids
  doc.markModified('liveMessageIds')
  await doc.save()
}

async function syncStaffPanel(client: Client, doc: AsociacionesPanelDocument, groups: StaffGroup[]): Promise<void> {
  const { channel } = await ensureStaffPanelChannel(client, doc)
  if (!channel) return

  const containers = renderStaffCenter(groups)
  const ids = await syncV2Channel(channel, containers, doc.staffPanelMessageIds ?? [])
  if (doc.staffPanelMessageIds!.join(',') !== ids.join(',')) {
    doc.staffPanelMessageIds = ids
    doc.markModified('staffPanelMessageIds')
    await doc.save()
  }
}

async function syncPerStaffChannels(client: Client, doc: AsociacionesPanelDocument, groups: StaffGroup[]): Promise<void> {
  const guild = await resolveGuild(client)
  if (!guild) return

  const staffWithItems = groups.filter(g => g.staffId && g.items.length > 0)
  const activeIds = new Set(staffWithItems.map(g => g.staffId!))
  await pruneStaffChannels(client, doc, activeIds)

  for (const group of staffWithItems) {
    const desiredName = staffChannelName(group.nombre)

    let entry = doc.staffChannels.find(e => e.staffId === group.staffId)
    if (!entry) {
      await ensureStaffChannel(client, guild, doc, group.staffId!, desiredName)
      entry = doc.staffChannels.find(e => e.staffId === group.staffId)
      if (!entry) {
        logger.warn('AsociacionesPanel: no se pudo crear el canal de staff', { staffId: group.staffId })
        continue
      }
    }

    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (!channel?.isTextBased()) continue
    const textChannel = channel as TextChannel

    if (textChannel.name !== desiredName) {
      await textChannel.setName(desiredName, 'Sincronización del panel de staff').catch(() => {})
    }

    const containers = renderStaffCenter([group], {
      title: `## ☕ Asociaciones de ${group.nombre} (${group.items.length})`,
      hideGroupHeaders: true
    })
    const ids = await syncV2Channel(textChannel as unknown as { id: string; isTextBased(): boolean; messages: { fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>; delete: (id: string) => Promise<unknown>; send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }> } }, containers, entry.messageIds ?? [])
    if (entry.messageIds?.join(',') !== ids.join(',')) {
      entry.messageIds = ids
      doc.markModified('staffChannels')
      await doc.save()
    }
  }
}
