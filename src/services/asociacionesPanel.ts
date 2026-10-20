import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Client,
  type Collection,
  type ContainerBuilder as Container,
  type Snowflake
} from 'discord.js'
import { guildId as botGuildId } from '../config/env'
import Asociacion, { type AsociacionDocument } from '../models/Asociacion'
import AsociacionesPanel, { PANEL_KEY, type AsociacionesPanelDocument } from '../models/AsociacionesPanel'
import { ASOCIACIONES_CATEGORY_ID, EMOJI, toChannelSlug, unix } from './asociaciones'
import { getGuildConfig } from './guild'
import logger from '../utils/logger'

// Canal/hilo donde vive el panel "en vivo" del estado de asociaciones
export const ASOCIACIONES_LIVE_THREAD_ID = '1557096855786229863'
// Nombre del canal privado del staff (posicionado en la categoría de asociaciones)
export const STAFF_PANEL_NAME = '「🛠️」panel-asociaciones'
export const STAFF_CHANNEL_EMOJI = '🛠️'

// En Components V2 el límite de texto por mensaje es 4000 chars (no 6000 como en embeds)
const MAX_CONTAINER_CHARS = 3800

type SendableTextChannel = {
  id: string
  isTextBased(): boolean
  messages: {
    fetch: (id: string) => Promise<{ id: string, edit: (p?: unknown) => Promise<unknown> }>
    delete: (id: string) => Promise<unknown>
    send: (payload: { flags: number, components: Container[] }) => Promise<{ id: string }>
  }
}

export interface StaffGroup {
  staffId: string | null
  nombre: string
  items: AssociationBlockData[]
}

// ---------- Rendering ----------

// Color primario: el morado oscuro usado también en bumps
export const ASOCIACIONES_PANEL_COLOR = 0x9B4DFF

// Datos que necesita un bloque de asociación (con su emoji extraído del canal)
export interface AssociationBlockData {
  servidor: string
  canalId: string
  representanteId: string | null
  renovacionDias: number
  nextRenovationDate: Date
  emoji: string
}

// Extrae el emoji decorativo del nombre del canal "「❤」nombre" (fallback: ☕, el oficial)
function emojiFromChannelName(channelName: string | undefined): string {
  const match = /「(.+?)」/.exec(channelName ?? '')
  return match?.[1] ?? '☕'
}

// Bloque de una asociación: título con emoji + canal, y solo tiempo relativo para la renovación
export function associationBlock(a: AssociationBlockData): string {
  const next = unix(a.nextRenovationDate)
  return [
    `### ${a.emoji} ${a.servidor} (<#${a.canalId}>)`,
    `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : '*Sin asignar*'}`,
    `${EMOJI.renovacion} **Frecuencia:** cada ${a.renovacionDias} días`,
    `${EMOJI.proxima} **Próxima renovación:** <t:${next}:R>`
  ].join('\n')
}

// Tarjeta de texto simple con acento morado
function textContainer(content: string): Container {
  return new ContainerBuilder().setAccentColor(ASOCIACIONES_PANEL_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
}

// Un grupo de staff = una tarjeta (container) propia, separada visualmente de las demás.
// Si el grupo no cabe en un mensaje (límite de 4000 chars de texto en V2), se reparte
// en varias tarjetas repitiendo el header.
//   title   → se inyecta solo en la PRIMERA tarjeta del primer grupo (título + separador)
//   trailer → se añade solo al FINAL de la última tarjeta del último grupo (separador + actualizado)
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
    // Grupo vacío (típico: "Sin asignar" sin nada): header (0) + separador + explicación en cursiva
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

// El panel completo: el título vive DENTRO de la primera tarjeta; el pie de
// "Actualizado" al final de la última; una tarjeta por staff y "Sin asignar" al final
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

// Clave de ordenado: quita el emoji decorativo 「...」, emojis sueltos y símbolos,
// acentos y mayúsculas — así el orden no depende de texto raro
export function normalizeSortKey(input: string): string {
  return input
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

// PERF: solo agrupa; el mayor peso es el fetch de nombres, caché de 5 min
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

  // Staff alfabético (robusto con nombres raros); "Sin asignar" siempre al final
  groups.sort((a, b) => {
    if (!a.staffId) return 1
    if (!b.staffId) return -1
    return compareNames(a.nombre, b.nombre)
  })

  // "Sin asignar" SIEMPRE existe, aunque tenga 0
  if (!groups.some(g => !g.staffId)) {
    groups.push({ staffId: null, nombre: 'Sin asignar', items: [] })
  }

  staffCache = { at: Date.now(), groups }
  return groups
}

export function invalidateStaffCache(): void {
  staffCache = null
}

// ---------- Sync de mensajes (edits inteligentes + caché de contenido) ----------

const contentCache = new Map<string, string>()

function containerDigest(container: Container): string {
  return JSON.stringify(container.toJSON())
}

async function syncMessages(
  channel: SendableTextChannel,
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
      // El mensaje ya no existe; lo recreamos abajo
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
  channel: SendableTextChannel,
  containers: Container[],
  currentIds: string[]
): Promise<string[]> {
  return syncMessages(channel, containers, currentIds)
}

// ---------- Canal privado del staff ----------

async function ensureStaffPanelChannel(client: Client, doc: AsociacionesPanelDocument): Promise<{ channel: SendableTextChannel | null, created: boolean }> {
  if (doc.staffPanelChannelId) {
    const channel = await client.channels.fetch(doc.staffPanelChannelId).catch(() => null)
    if (channel?.isTextBased()) return { channel: channel as unknown as SendableTextChannel, created: false }
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
  for (const roleId of config.staffRoleIds) {
    overwrites.push({ id: roleId as Snowflake, allow: [PermissionFlagsBits.ViewChannel] })
  }

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
  return { channel: created as unknown as SendableTextChannel, created: true }
}

// ---------- Canales por staff ----------

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
  const staffRoleIds = (await getGuildConfig()).staffRoleIds

  const overwrites: { id: string, allow?: bigint[], deny?: bigint[] }[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
  ]
  for (const roleId of staffRoleIds) {
    overwrites.push({ id: roleId as Snowflake, allow: [PermissionFlagsBits.ViewChannel] })
  }
  overwrites.push({ id: staffId as Snowflake, allow: [PermissionFlagsBits.ViewChannel] })

  const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
  if (!category || category.type !== ChannelType.GuildCategory) {
    logger.warn('AsociacionesPanel: categoría de asociaciones no disponible para canal de staff')
    return { channelId: '', created: false }
  }

  if (entry) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (channel?.isTextBased()) {
      const c = channel as unknown as SendableTextChannel & { type: ChannelType, parentId: string | null, name: string, setName: (n: string, r?: string) => Promise<unknown>, permissionOverwrites: { edit: (id: string, o: unknown) => Promise<unknown> } }
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

  doc.staffChannels.push({ staffId, channelId: created.id, messageIds: [] })
  doc.markModified('staffChannels')
  await doc.save()
  return { channelId: created.id, created: true }
}

async function pruneStaffChannels(client: Client, doc: AsociacionesPanelDocument, active: Set<string>): Promise<void> {
  const stale = doc.staffChannels.filter(entry => !active.has(entry.staffId) || !entry.messageIds.some(Boolean))
  const guild = await resolveGuild(client)
  for (const entry of stale) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null)
    if (channel && 'deletable' in channel && channel.deletable) {
      await (channel as unknown as { delete: (r?: string) => Promise<unknown> }).delete('Sin asociaciones activas').catch(() => {})
    }
    doc.staffChannels = doc.staffChannels.filter(e => e.channelId !== entry.channelId)
  }
  if (stale.length) {
    doc.markModified('staffChannels')
    await doc.save()
  }
}

// Reordena TODO en la categoría con un único `setPositions` solo cuando el orden
// cambió (amigable con rate limits):
//   1. Panel de asociaciones ( primero)
//   2. Canales por staff, por nombre del staff (alfabético, sin emojis/acentos)
//   3. Canales de asociación, por nombre de la asociación (alfabético)
//   4. Resto de canales (posición actual)
async function orderCategoryChannels(
  guild: NonNullable<Awaited<ReturnType<typeof resolveGuild>>>,
  doc: AsociacionesPanelDocument,
  groups: StaffGroup[]
): Promise<void> {
  const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
  if (!category || category.type !== ChannelType.GuildCategory) return

  type ChildChannel = { id: string, name: string, rawPosition: number }
  const children = guild.channels.cache.filter(c => c.parentId === category.id) as unknown as Collection<string, ChildChannel>

  const staffNameByKey = new Map(groups.filter(g => g.staffId).map(g => [g.staffId!, g.nombre]))
  const assocKeyByCanal = new Map<string, string>(
    groups.flatMap(g => g.items.map(item => [item.canalId, item.servidor] as const))
  )

  const managedIds = new Set<string>(
    [doc.staffPanelChannelId, ...doc.staffChannels.map(e => e.channelId)].filter(Boolean)
  )

  const panelChannel = doc.staffPanelChannelId ? children.get(doc.staffPanelChannelId) : undefined

  const staffChannels = doc.staffChannels
    .map(entry => ({ entry, channel: children.get(entry.channelId) }))
    .filter((x): x is { entry: { staffId: string, channelId: string, messageIds: string[] }, channel: ChildChannel } => Boolean(x.channel))
    .sort((a, b) => compareNames(
      staffNameByKey.get(a.entry.staffId) ?? `id ${a.entry.staffId}`,
      staffNameByKey.get(b.entry.staffId) ?? `id ${b.entry.staffId}`
    ))
    .map(x => x.channel)

  const associationChannels = [...children.values()]
    .filter(c => assocKeyByCanal.has(c.id))
    .sort((a, b) => compareNames(assocKeyByCanal.get(a.id)!, assocKeyByCanal.get(b.id)!))

  const others = [...children.values()]
    .filter(c => !managedIds.has(c.id) && !assocKeyByCanal.has(c.id))
    .sort((a, b) => a.rawPosition - b.rawPosition)

  const target = [
    ...(panelChannel ? [panelChannel] : []),
    ...staffChannels,
    ...associationChannels,
    ...others
  ]

  const changed = target.some((c, index) => c.rawPosition !== index)
  if (!changed) return

  await guild.channels.setPositions(
    target.map((c, index) => ({ channel: c.id, position: index })) as never
  ).catch(() => {})
  logger.info('AsociacionesPanel: canales de la categoría reordenados', { cantidad: target.length })
}

// ---------- Tarjeta de detalle de una asociación ----------

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

// ID usable en customIds: acepta documentos de mongoose (id/_id) y objetos planos
export function asocId(a: AsociacionLike): string {
  return a.id ?? String(a._id ?? '')
}

// Tarjeta V2 con los datos claros + botones Editar/Eliminar
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

  return { flags: MessageFlags.IsComponentsV2, components: [container as Container] }
}

// ---------- Orquestación ----------

// Dos ritmos de sync separados para proteger al bot peta:
//   - rápido (10s): acciones de staff (crear/editar/eliminar)
//   - lento (30 min): renovaciones automáticas por mensajes (los paneles
//     no se reeditan a cada mensaje de miembro)
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

// Rápido: cancela el lento pendiente (lo cubre)
export function schedulePanelsSync(client: Client, delayMs = FAST_SYNC_DELAY_MS): void {
  if (slowTimer) { clearTimeout(slowTimer); slowTimer = null }
  if (fastTimer) return
  fastTimer = setTimeout(() => runSync(client), delayMs).unref?.() ?? null
}

// Lento: solo si no hay sync rápida ya programada
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

    // 1) Panel en vivo del hilo
    await syncLiveThread(client, groups)

    // 2) Canal privado del staff
    await syncStaffPanel(client, doc, groups)

    // 3) Un canal por cada staff con asociaciones
    await syncPerStaffChannels(client, doc, groups)

    // 4) Reordena la categoría (solo 1 request si el orden cambió)
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
  if (!thread || !thread.isThread()) {
    logger.warn('AsociacionesPanel: no se encontró el hilo en vivo de asociaciones', { threadId: ASOCIACIONES_LIVE_THREAD_ID })
    return
  }

  const doc = await loadPanelConfig()
  const containers = renderStaffCenter(groups)
  const ids = await syncV2Channel(thread as unknown as SendableTextChannel, containers, doc.liveMessageIds ?? [])
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
    let entry = doc.staffChannels.find(e => e.staffId === group.staffId)
    const desiredName = `「${STAFF_CHANNEL_EMOJI}」${toChannelSlug(group.nombre)}`

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

    const named = channel as unknown as { name: string, setName: (n: string, r?: string) => Promise<unknown> }
    if (named.name !== desiredName) {
      await named.setName(desiredName, 'Sincronización del panel de staff').catch(() => {})
    }

    const containers = renderStaffCenter([group], {
      title: `## ☕ Asociaciones de ${group.nombre} (${group.items.length})`,
      hideGroupHeaders: true
    })
    const ids = await syncV2Channel(channel as unknown as SendableTextChannel, containers, entry.messageIds ?? [])
    if (entry.messageIds?.join(',') !== ids.join(',')) {
      entry.messageIds = ids
      doc.markModified('staffChannels')
      await doc.save()
    }
  }
}
