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
  ChannelType,
} from 'discord.js'
import Asociacion, { type AsociacionDocument } from '../models/Asociacion'
import { guildId as botGuildId } from '../config/env'
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
const MAX_CONTAINER_CHARS = 3800

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

// Nombre display a partir del canal: "「❤」el-sotano-oficial" -> "El Sotano Oficial"
export function titleFromChannelName(rawName: string): string {
  return capitalizeName(cleanChannelName(rawName))
}

// Monosílabo aproximado: una sola agrupación de vocales (o ninguna, tipo "TS")
function isMonosyllable(word: string): boolean {
  const groups = word.toLowerCase().match(/[aeiouáéíóúü]+/g)
  return !groups || groups.length <= 1
}

// Nombre para mostrar: primera letra de cada palabra en mayúscula, salvo monosílabos.
// Respeta mayúsculas ya existentes (siglas, nombres propios). "la casa de papel" -> "La Casa de Papel"
export function capitalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return word
      // Si el usuario ya puso mayúsculas (siglas, nombres propios...), no las tocamos
      if (word !== word.toLowerCase()) return word
      if (index > 0 && isMonosyllable(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
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

// Comprueba si algún representante de asociación ha salido del servidor y avisa con embed rojo.
// Se ejecuta cada 1 h: si sigue ausente, vuelve a avisar (el aviso es idempotente a propósito).
export async function checkRepresentantesAusentes(client: Client): Promise<void> {
  const guild = await resolveGuild(client)
  if (!guild) return

  const conRepresentante = await Asociacion.find({ representanteId: { $ne: null } })
  if (!conRepresentante.length) return

  const ausentes: AsociacionDocument[] = []
  for (const asociacion of conRepresentante) {
    const repId = asociacion.representanteId as string
    // Primero la caché de miembros (sin coste); fetch solo si no está
    const esta = guild.members.cache.has(repId) ||
      (await guild.members.fetch(repId).catch(() => null)) !== null
    if (!esta) ausentes.push(asociacion)
  }

  if (!ausentes.length) return

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('❌ Representantes que salieron del servidor')
    .setDescription(
      ausentes
        .map(a => `${EMOJI.canal} **${capitalizeName(a.servidor)}** (<#${a.canalId}>)\n${EMOJI.representante} Representante: <@${a.representanteId}> ya no está en el servidor`)
        .join('\n\n')
    )
    .addFields({ name: 'Acción sugerida', value: 'Asigna un nuevo representante con `/asociaciones editar`.' })
    .setTimestamp()

  logger.warn('Asociaciones: representantes ausentes detectados', { cantidad: ausentes.length })
  await sendAsociacionesLog(client, embed)
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
        `Ha llegado la fecha de renovación de la asociación con **${capitalizeName(asociacion.servidor)}**.\n\n` +
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
      new TextDisplayBuilder().setContent(`## ✏️ Editar: ${capitalizeName(a.servidor)}\n-# <#${a.canalId}>. Próxima renovación <t:${next}:R>`)
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

// Mensaje de texto fuera de cualquier contenedor (confirmaciones simples)
export function buildNoticePayload(text: string): { flags: number, components: TextDisplayBuilder[] } {
  return { flags: MessageFlags.IsComponentsV2, components: [new TextDisplayBuilder().setContent(text)] }
}

// Confirmación previa a eliminar (texto fuera y botones en un contenedor)
export function buildRemoveConfirmPayload(a: AsociacionLike): { flags: number, components: Array<TextDisplayBuilder | Container> } {
  const dotId = asocId(a)

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`asoc-btn-eliminar-confirmar:${dotId}`).setLabel('🗑️ Confirmar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`asoc-btn-eliminar-cancelar:${dotId}`).setLabel('✖️ Cancelar').setStyle(ButtonStyle.Secondary)
  )

  const buttons = new ContainerBuilder()
    .setAccentColor(0xE74C3C)
    .addActionRowComponents(actionRow)

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      new TextDisplayBuilder().setContent(
        `## 🗑️ Eliminar asociación - ${capitalizeName(a.servidor)}\n\n` +
        `${EMOJI.canal} **Canal:** <#${a.canalId}>\n\n` +
        `Confirmar **borra** la asociación de la lista y de los paneles.\n` +
        `El canal de Discord **no** se borra.\n\n` +
        `Si no es eso, pulsa **Cancelar**.`
      ),
      buttons
    ]
  }
}

// Tarjeta V2 de una asociación (mismo estilo que la lista del hilo en vivo)
export function buildAssociationDetailPayload(
  a: AsociacionLike,
  { canEdit = false, canDelete = false, hint, intro, showLastRenewal = true }: {
    canEdit?: boolean
    canDelete?: boolean
    hint?: string | null
    intro?: string
    showLastRenewal?: boolean
  } = {}
): { flags: number, components: Array<TextDisplayBuilder | Container> } {
  const next = unix(a.nextRenovationDate)
  const last = unix(a.lastRenovationDate)
  const dotId = asocId(a)

  const container = new ContainerBuilder()
    .setAccentColor(ASOCIACIONES_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${EMOJI.asociacion} ${capitalizeName(a.servidor)}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))

  const lines = [
    `${EMOJI.canal} **Canal:** <#${a.canalId}>`,
    `${EMOJI.staff} **Staff encargado:** ${a.staffEncargadoId ? `<@${a.staffEncargadoId}>` : '*Sin asignar*'}`,
    `${EMOJI.renovacion} **Frecuencia:** cada ${a.renovacionDias} día(s)`,
    `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : '*Sin asignar*'}`,
    `${EMOJI.proxima} **Próxima renovación:** <t:${next}:R>`
  ]
  if (showLastRenewal) lines.push(`${EMOJI.ultima} **Última renovación:** <t:${last}:R>`)

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))

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
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons))
  } else if (hint !== null) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        hint ?? '-# Para editar esta asociación usa `/asociaciones editar`. Para eliminarla usa `/asociaciones eliminar`.'
      ))
  }

  const components: Array<TextDisplayBuilder | Container> = []
  if (intro) components.push(new TextDisplayBuilder().setContent(intro))
  components.push(container)

  return { flags: MessageFlags.IsComponentsV2, components }
}

// Lista V2 de asociaciones (mismo estilo que el hilo en vivo, sin estado de renovación)
export function buildAssociationsListPayload(
  asociaciones: AsociacionLike[],
  { title, menu }: { title: string, menu?: StringSelectMenuBuilder } = { title: 'Asociaciones' }
): { flags: number, components: Container[] } {
  const shown = asociaciones.slice(0, 25)
  const containers: Container[] = []
  let builder: ContainerBuilder = new ContainerBuilder().setAccentColor(ASOCIACIONES_COLOR)
  let length = 0
  let blocks = 0

  const openContainer = () => {
    builder = new ContainerBuilder().setAccentColor(ASOCIACIONES_COLOR)
    containers.push(builder)
    length = 0
    blocks = 0
  }

  builder.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${EMOJI.asociacion} ${title} (${asociaciones.length})`)
  )
  builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
  length += title.length + String(asociaciones.length).length + 25

  for (const a of shown) {
    const next = unix(a.nextRenovationDate)
    const last = unix(a.lastRenovationDate)
    const content = [
      `### ${EMOJI.servidor} ${capitalizeName(a.servidor)}`,
      `${EMOJI.canal} **Canal:** <#${a.canalId}>`,
      `${EMOJI.staff} **Staff encargado:** ${a.staffEncargadoId ? `<@${a.staffEncargadoId}>` : '*Sin asignar*'}`,
      `${EMOJI.renovacion} **Frecuencia:** cada ${a.renovacionDias} día(s)`,
      `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : '*Sin asignar*'}`,
      `${EMOJI.proxima} **Próxima renovación:** <t:${next}:R>`,
      `${EMOJI.ultima} **Última renovación:** <t:${last}:R>`
    ].join('\n')

    if (length + content.length + 40 > MAX_CONTAINER_CHARS) openContainer()
    if (blocks > 0) builder.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    length += content.length + 40
    blocks++
  }

  if (asociaciones.length > shown.length) {
    builder.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Mostrando ${shown.length} de ${asociaciones.length} asociaciones.`))
  }

  if (menu) builder.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu))

  return { flags: MessageFlags.IsComponentsV2, components: containers }
}

// ===== Panel types & functions (fusionados de asociacionesPanel.ts) =====

// Canal/hilo donde vive el panel "en vivo" del estado de asociaciones
export const ASOCIACIONES_LIVE_THREAD_ID = '1562220631783903382'
// Canal anfitrión del hilo en vivo (no se trata como asociación)
export const ASOCIACIONES_THREAD_CHANNEL_ID = '1436773704980758548'
// Icono decorativo de canales de staff en desuso (se eliminan automáticamente en cada sync)
export const STAFF_CHANNEL_PREFIX = '﹏︿'
// Roles encargados de alianzas / cazas (IDs configurados)
export const ALIANZAS_ROLE_IDS = [
  '1170449867823382649',
  '1305269600962871367',
  '1305272031729680444',
  '1305273508921737226'
]

// En Components V2 el límite de texto por mensaje es 4000 chars

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

// Estado de renovación (lógica del bot viejo): ✅ renovada, ⚠️ expira en <= 2 días, ❌ sin renovar
export function renewalState(nextRenovation: Date | string, now = Date.now()): { icon: string, diasRestantes: number } {
  const nextMs = new Date(nextRenovation).getTime()
  if (Number.isNaN(nextMs)) return { icon: '❌', diasRestantes: 0 }
  const diasRestantes = (nextMs - now) / DAY_MS
  return {
    icon: diasRestantes > 0 && diasRestantes <= 2 ? '⚠️' : (diasRestantes > 2 ? '✅' : '❌'),
    diasRestantes
  }
}

// Contenedores de un grupo de staff (diseño exacto del bot viejo: un mensaje V2 por asignado)
function groupContainers(group: StaffGroup): Container[] {
  const now = Date.now()
  const assigned = group.staffId !== null
  const accent = assigned ? 0x00b0f4 : 0xffcc00
  const renovadas = group.items.filter(i => renewalState(i.nextRenovationDate, now).icon !== '❌').length
  const header = assigned
    ? `### 📌 <@${group.staffId}> - ${renovadas}/${group.items.length}`
    : `### 📋 Sin asignar - ${group.items.length}`

  const containers: Container[] = []

  if (!group.items.length) {
    const empty = new ContainerBuilder().setAccentColor(accent)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        assigned ? '> *El usuario no tiene asociaciones asignadas.*' : '> *No hay asociaciones sin asignar.*'
      ))
    containers.push(empty)
    return containers
  }

  let builder: ContainerBuilder | null = null
  let length = 0
  let firstInCard = true

  const startCard = () => {
    builder = new ContainerBuilder().setAccentColor(accent)
    containers.push(builder!)
    builder!.addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
    // Separador entre el nombre del staff y sus asociaciones
    builder!.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    length = header.length
    firstInCard = true
  }

  for (const item of group.items) {
    const estado = renewalState(item.nextRenovationDate, now)
    const content = assigned
      ? [
          `**${estado.icon} Canal:** <#${item.canalId}>`,
          `**${EMOJI.proxima} Próxima Renovación:** <t:${unix(item.nextRenovationDate)}:R>`,
          `**${EMOJI.representante} Representante:** ${item.representanteId ? `<@${item.representanteId}>` : '*Sin representante*'}`
        ].join('\n')
      : `${EMOJI.canal} <#${item.canalId}>`

    if (!builder || length + content.length + 30 > MAX_CONTAINER_CHARS) startCard()
    const current = builder!
    if (!firstInCard) {
      current.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    }
    current.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    length += content.length + 30
    firstInCard = false
  }

  return containers
}

// Un mensaje V2 por grupo de staff (igual que createContainerForAsociation del bot viejo)
export function renderStaffCenter(groups: StaffGroup[]): Container[] {
  return groups.flatMap(groupContainers)
}

// Embed resumen con estadísticas (igual que createSummaryEmbed del bot viejo)
export function createSummaryEmbed(groups: StaffGroup[]): EmbedBuilder {
  const now = Date.now()
  const items = groups.flatMap(g => g.items)
  const total = items.length
  const sinAsignarCount = groups.filter(g => g.staffId === null).reduce((sum, g) => sum + g.items.length, 0)

  let sinRenovar = 0
  let vencenPronto = 0
  for (const item of items) {
    const { icon } = renewalState(item.nextRenovationDate, now)
    if (icon === '❌') sinRenovar++
    else if (icon === '⚠️') vencenPronto++
  }
  const renovadas = total - sinRenovar
  const porcentajeRenovacion = total > 0 ? Math.round((renovadas / total) * 100) : 0

  return new EmbedBuilder()
    .setDescription('## 🏠 Resumen de asociaciones')
    .setColor(0x7289DA)
    .addFields(
      { name: '📈 Total', value: `\`${total}\``, inline: true },
      { name: '📋 Sin asignar', value: `\`${sinAsignarCount}\``, inline: true },
      { name: '📊 % Renovación', value: `\`${porcentajeRenovacion}%\``, inline: true },
      { name: '✅ Renovadas', value: `\`${renovadas}\``, inline: true },
      { name: '⚠️ Expiran en < 2 días', value: `\`${vencenPronto}\``, inline: true },
      { name: '❌ Sin Renovar', value: `\`${sinRenovar}\``, inline: true }
    )
    .setTimestamp()
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

// Staff ordenado por n.º de asociaciones (de más a menos); "Sin asignar" siempre al final
function sortStaffGroupsByLoad(groups: StaffGroup[]): StaffGroup[] {
  return groups.sort((a, b) => {
    if (!a.staffId) return 1
    if (!b.staffId) return -1
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    return compareNames(a.nombre, b.nombre)
  })
}

let staffCache: { at: number, groups: StaffGroup[] } | null = null
const STAFF_CACHE_TTL = 5 * 60 * 1000

// Diggestos de los mensajes del hilo en vivo por id de mensaje: evita edits idénticos en cada sync
const liveMessagesDigest = new Map<string, string>()

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
    // Caché de miembros primero: evita una llamada a la API por cada staff en cada sync
    const member = guild ? (guild.members.cache.get(key) ?? await guild.members.fetch(key).catch(() => null)) : null
    groups.push({
      staffId: key,
      nombre: member?.displayName ?? `ID ${key}`,
      items: enriched
    })
  }

  sortStaffGroupsByLoad(groups)

  if (!groups.some(g => !g.staffId)) {
    groups.push({ staffId: null, nombre: 'Sin asignar', items: [] })
  }

  // Igual que en el bot viejo: los canales de la categoría que no están registrados en la DB aparecen en "Sin asignar"
  const unassignedGroup = groups.find(g => g.staffId === null)
  if (guild && unassignedGroup) {
    const category = await guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
    if (category && category.type === ChannelType.GuildCategory) {
      const registered = new Set(all.map(a => a.canalId))
      const children = guild.channels.cache.filter(c => c.parentId === category.id) as unknown as Map<string, { id: string, type: number, name: string }>
      for (const child of children.values()) {
        if (child.type !== ChannelType.GuildText) continue
        if (child.id === ASOCIACIONES_THREAD_CHANNEL_ID) continue
        if (child.name.startsWith(STAFF_CHANNEL_PREFIX)) continue
        if (registered.has(child.id)) continue
        unassignedGroup.items.push({
          servidor: cleanChannelName(child.name) || child.name,
          canalId: child.id,
          representanteId: null,
          renovacionDias: 0,
          nextRenovationDate: new Date(0),
          emoji: emojiFromChannelName(child.name)
        })
      }
      unassignedGroup.items.sort((a, b) => compareNames(a.servidor, b.servidor))
    }
  }

  staffCache = { at: Date.now(), groups }
  return groups
}

export function invalidateStaffCache(): void {
  staffCache = null
}

function containerDigest(container: Container): string {
  return JSON.stringify(container.toJSON())
}

// Detecta si un mensaje ya fue enviado con Components V2 (igual que en el bot viejo)
function isV2(message: unknown): boolean {
  const flags = BigInt((message as { flags?: number | bigint } | null)?.flags ?? 0)
  return (flags & BigInt(MessageFlags.IsComponentsV2)) !== 0n
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function resolveGuild(client: Client) {
  return client.guilds.cache.get(botGuildId) ?? await client.guilds.fetch(botGuildId).catch(() => null)
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
    const groups = await fetchStaffGroups(client)
    logger.info('AsociacionesPanel: sync iniciada', {
      grupos: groups.length,
      conAsignaciones: groups.filter(g => g.items.length > 0).length
    })

    await syncLiveThread(client, groups)
    logger.info('AsociacionesPanel: sync completada')
  } catch (error) {
    logger.error('AsociacionesPanel: error sincronizando paneles', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    syncPending = false
  }
}

async function syncLiveThread(client: Client, groups: StaffGroup[]): Promise<void> {
  if (!client.user) return
  const thread = await client.channels.fetch(ASOCIACIONES_LIVE_THREAD_ID).catch(() => null)
  if (!thread || !('isThread' in thread) || !thread.isThread()) {
    logger.warn('AsociacionesPanel: no se encontró el hilo en vivo de asociaciones', { threadId: ASOCIACIONES_LIVE_THREAD_ID })
    return
  }

  type MessageLike = { id: string, author: { id: string }, createdTimestamp: number, flags: number | bigint, edit: (p?: unknown) => Promise<unknown>, delete: (r?: string) => Promise<unknown> }
  type ThreadLike = { messages: { fetch: (opts: { limit: number }) => Promise<Map<string, MessageLike>> }, send: (p: Record<string, unknown>) => Promise<unknown> }

  const t = thread as unknown as ThreadLike
  const fetched = await t.messages.fetch({ limit: 100 }).catch(() => null)
  if (!fetched) return
  const botMsgs = Array.from(fetched.values())
    .filter(m => m.author.id === client.user!.id)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)

  // Igual que en el bot viejo: el resumen es el único mensaje clásico, el resto son V2 (uno por asignado)
  const summary = botMsgs.find(m => !isV2(m))
  const v2s = botMsgs.filter(m => isV2(m))
  const containers = renderStaffCenter(groups)

  // Si falta el resumen o cambió el número de secciones V2: borrar TODO y recrear
  const structureChanged = !summary || v2s.length !== containers.length
  if (structureChanged) {
    liveMessagesDigest.clear()
    for (const msg of botMsgs) {
      await (msg as unknown as { delete: (r?: string) => Promise<unknown> }).delete().catch(() => {})
      await sleep(100)
    }
    try {
      const summaryEmbed = createSummaryEmbed(groups)
      await (t.send as (p: { embeds: EmbedBuilder[] }) => Promise<unknown>)({ embeds: [summaryEmbed] })
      await sleep(200)
      for (const container of containers) {
        await (t.send as (p: { flags: number, components: Container[] }) => Promise<unknown>)({ flags: MessageFlags.IsComponentsV2, components: [container] })
        await sleep(200)
      }
    } catch (error) {
      logger.warn('AsociacionesPanel: fallo recreando la lista de asociaciones', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    logger.info('AsociacionesPanel: lista de asociaciones recreada en el hilo', { secciones: containers.length })
    return
  }

  // Estructura intacta: solo actualizar el contenido que cambió (digest en caché = cero llamadas)
  const summaryDigest = JSON.stringify(createSummaryEmbed(groups).toJSON())
  let edited = 0
  if (liveMessagesDigest.get(summary.id) !== summaryDigest) {
    await (summary as unknown as { edit: (p: { embeds: EmbedBuilder[] }) => Promise<unknown> }).edit({ embeds: [createSummaryEmbed(groups)] }).catch(() => {})
    liveMessagesDigest.set(summary.id, summaryDigest)
    edited++
    await sleep(150)
  }
  for (let i = 0; i < containers.length; i++) {
    const digest = containerDigest(containers[i])
    if (liveMessagesDigest.get(v2s[i].id) === digest) continue
    await (v2s[i] as unknown as { edit: (p: unknown) => Promise<unknown> }).edit({ flags: MessageFlags.IsComponentsV2, components: [containers[i]] }).catch(() => {})
    liveMessagesDigest.set(v2s[i].id, digest)
    edited++
    await sleep(150)
  }
  if (edited > 1) logger.info('AsociacionesPanel: hilo en vivo actualizado', { mensajes: edited })
}

