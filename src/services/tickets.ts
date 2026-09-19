import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  ContainerBuilder,
  FileBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnyThreadChannel,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type GuildChannel,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextBasedChannel
} from 'discord.js'
import Ticket, { type TicketDocument, type TicketStatus } from '../models/Ticket'
import Review from '../models/Review'
import logger from '../utils/logger'
import { getGuildConfig } from './guild'

export const TICKETS_CHANNEL_ID = '1096144326393864234'
export const TRANSCRIPT_THREAD_ID = '1550976625103863899'
/** Rol de desarrollo: se añade a los roles de staff de la DB en los pings. */
const DEV_ROLE_ID = '1313248021403930715'

export type Service = 'discord' | 'web'

export const SERVICE_LABEL: Record<Service, string> = {
  discord: 'Bot de Discord',
  web: 'Web / app'
}

/** Solo administradores del servidor (owner y co-owner). */
async function isTicketStaff(
  interaction: ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction
): Promise<boolean> {
  if (!interaction.guild) return false
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
  return member?.permissions.has(PermissionFlagsBits.Administrator) ?? false
}

function divider() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
}

function formatElapsed(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000))
  if (minutes < 1) return 'menos de una hora'
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return hours === 1 ? '1 hora' : `${hours} horas`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 día' : `${days} días`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-ES')
}

async function hasOpenTicket(guild: Guild, userId: string): Promise<GuildChannel | AnyThreadChannel | null> {
  const storedTicket = await Ticket.findOne({ guildId: guild.id, userId, status: { $ne: 'cerrado' } }).lean()
  if (storedTicket) {
    const storedChannel = await guild.channels.fetch(storedTicket.channelId).catch(() => null)
    if (storedChannel) return storedChannel
    await Ticket.updateOne({ _id: storedTicket._id }, { $set: { status: 'cerrado', closedAt: new Date() } })
  }

  // Fallback para tickets huérfanos (sin registro en DB): formato nuevo y legacy.
  const parent = await guild.channels.fetch(TICKETS_CHANNEL_ID).catch(() => null)
  if (!parent) return null
  if (parent.type === ChannelType.GuildCategory) {
    return parent.children.cache.find(channel =>
      channel.name === `ticket-${userId}` ||
      (channel.name.startsWith('servicios-') && channel.permissionOverwrites.cache.has(userId))
    ) || null
  }
  if (parent.type === ChannelType.GuildForum || parent.type === ChannelType.GuildText || parent.type === ChannelType.GuildAnnouncement) {
    const active = await parent.threads.fetchActive().catch(() => null)
    return active?.threads.find(thread =>
      thread.name === `ticket-${userId}` ||
      (thread.name.startsWith('servicios-') && thread.ownerId === userId)
    ) || null
  }
  return null
}

async function nextTicketName(guild: Guild): Promise<{ name: string; number: number }> {
  const total = await Ticket.countDocuments({ guildId: guild.id })
  let number = total + 1

  // Evita colisiones si se borró la DB o hay huecos: sube hasta un nombre libre.
  for (let i = 0; i < 100; i++) {
    const name = `servicios-${number}`
    const exists = guild.channels.cache.some(c => c.name === name)
    if (!exists) return { name, number }
    number++
  }

  return { name: `servicios-${number}`, number }
}

export type TicketPhase = Exclude<TicketStatus, 'cerrado'>

const PHASE_TEXT: Record<TicketPhase, string> = {
  solicitado: 'Solicitado. La solicitud de presupuesto no supone ningún compromiso.',
  en_curso: 'En curso. Un desarrollador está trabajando en el proyecto.',
  en_revision: 'En revisión. Se ruega al cliente revisar la entrega y comentar.',
  entregado: 'Entregado. Se ha enviado la solicitud de valoración. El ticket puede cerrarse.'
}

const PHASE_NEXT: Record<TicketPhase, { action: 'start' | 'review' | 'deliver'; label: string } | null> = {
  solicitado: { action: 'start', label: '🛠️ Pasar a desarrollo' },
  en_curso: { action: 'review', label: '👁 Pasar a revisión' },
  en_revision: { action: 'deliver', label: '✅ Marcar como entregado' },
  entregado: null
}

async function buildTicketPingLine(userId: string, serviceName: string): Promise<string> {
  const config = await getGuildConfig().catch(() => null)
  const ids = [...(config?.staffRoleIds ?? [])]
  if (!ids.includes(DEV_ROLE_ID)) ids.push(DEV_ROLE_ID)
  const pings = ids.map(id => `||<@&${id}>||`).join('')
  return `-# <@${userId}> ha abierto un ticket de tipo **Servicios** \`${serviceName}\`. ${pings}`
}

async function ticketWelcome(userId: string, serviceName: string, ticketNumber: number, status: TicketPhase) {
  const ping = new TextDisplayBuilder().setContent(
    await buildTicketPingLine(userId, serviceName)
  )
  const title = new TextDisplayBuilder().setContent(`# Ticket #${ticketNumber} · Servicios`)
  const body = new TextDisplayBuilder().setContent([
    `Se ha registrado la solicitud del cliente.`,
    `**Tipo solicitado:** \`${serviceName}\`.`,
    `**Estado:** ${PHASE_TEXT[status]}`, '',
    'La ficha del proyecto se encuentra a continuación.',
    'Un desarrollador responderá con el presupuesto correspondiente.',
    'Pago inicial del 50%; el resto se abona a la entrega.'
  ].join('\n'))
  const buttons = [
    new ButtonBuilder().setCustomId('services-close-ticket').setLabel('🔒 Cerrar').setStyle(ButtonStyle.Secondary)
  ]
  const next = PHASE_NEXT[status]
  if (next) {
    buttons.push(new ButtonBuilder().setCustomId(`services-phase:${next.action}`).setLabel(next.label).setStyle(ButtonStyle.Primary))
  }
  const container = new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(ping, title)
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(body)
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons))
  return { container }
}

function projectCard(details: { descripcion: string; funciones: string; referencias: string | null }): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Ficha del proyecto')
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Descripción:** ${details.descripcion}`,
        `**Funciones imprescindibles:** ${details.funciones}`,
        `**Referencias:** ${details.referencias || 'No indicado.'}`
      ].join('\n'))
    )
}

function conditionsCard(userId: string, precio: string, plazo: string, notas: string | null): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@${userId}>. El proyecto ha sido aceptado. Condiciones acordadas:`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Precio:** ${precio}`,
        `**Plazo:** ${plazo}`,
        `**Alcance:** ${notas || 'Según lo descrito en la ficha del proyecto.'}`
      ].join('\n'))
    )
}

function reviewCard(userId: string, entrega: string, inicio: Date, plazoAcordado: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@${userId}>. El proyecto está listo para su revisión.`),
      new TextDisplayBuilder().setContent('# Revisión del proyecto')
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Entrega:** ${entrega}`,
        `**Inicio:** ${formatDate(inicio)}. **Tiempo transcurrido:** ${formatElapsed(inicio)}. **Plazo acordado:** ${plazoAcordado}.`
      ].join('\n'))
    )
}

export function briefingRequestModal(service: Service) {
  return new ModalBuilder()
    .setCustomId(`briefing-request:${service}`)
    .setTitle('Solicitar presupuesto')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('descripcion')
          .setLabel('Descripción del proyecto')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('funciones')
          .setLabel('Funciones imprescindibles')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('referencias')
          .setLabel('Referencias o ejemplos')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    )
}

export async function openBriefingRequest(interaction: StringSelectMenuInteraction, service: Service): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Este menú solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }
  const existing = await hasOpenTicket(interaction.guild, interaction.user.id)
  if (existing) {
    await interaction.reply({ content: `Ya existe un ticket abierto: ${existing}`, ephemeral: true })
    return
  }
  await interaction.showModal(briefingRequestModal(service))
}

export async function handleBriefingRequestSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const service = interaction.customId.split(':')[1]
  if (service !== 'discord' && service !== 'web') return

  if (!interaction.guild) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }
  const existing = await hasOpenTicket(interaction.guild, interaction.user.id)
  if (existing) {
    await interaction.reply({ content: `Ya existe un ticket abierto: ${existing}`, ephemeral: true })
    return
  }
  const parent = await interaction.guild.channels.fetch(TICKETS_CHANNEL_ID).catch(() => null)
  if (!parent) {
    await interaction.reply({ content: 'No se encontró el canal configurado para tickets.', ephemeral: true })
    return
  }

  const descripcion = interaction.fields.getTextInputValue('descripcion').trim()
  const funciones = interaction.fields.getTextInputValue('funciones').trim()
  const referencias = interaction.fields.getTextInputValue('referencias').trim() || null
  if (!descripcion || !funciones) {
    await interaction.reply({ content: 'La descripción y las funciones son obligatorias.', ephemeral: true })
    return
  }

  const { name: ticketName, number: ticketNumber } = await nextTicketName(interaction.guild)
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
  ]
  const serviceName = SERVICE_LABEL[service]
  const payload = { flags: MessageFlags.IsComponentsV2 as const }

  if (parent.type === ChannelType.GuildCategory) {
    const ticket = await interaction.guild.channels.create({ name: ticketName, type: ChannelType.GuildText, parent: parent.id, topic: `Ticket #${ticketNumber} · ${interaction.user.tag} (${interaction.user.id}) · ${serviceName}`, permissionOverwrites: overwrites, reason: `Ticket #${ticketNumber} (${serviceName}) de ${interaction.user.tag}` })
    try {
      const doc = await Ticket.create({ guildId: interaction.guild.id, channelId: ticket.id, userId: interaction.user.id, service, status: 'solicitado', number: ticketNumber })
      const { container } = await ticketWelcome(interaction.user.id, serviceName, ticketNumber, 'solicitado')
      const sent = await ticket.send({ ...payload, components: [container] })
      await ticket.send({ ...payload, components: [projectCard({ descripcion, funciones, referencias })] })
      doc.welcomeMessageId = sent.id
      await doc.save()
    } catch (error) {
      await ticket.delete('No se pudo registrar el ticket en MongoDB').catch(() => null)
      throw error
    }
    await interaction.reply({ content: `<@${interaction.user.id}>, su ticket de tipo **Servicios** \`${serviceName}\` ha sido creado en ${ticket}.`, ephemeral: true })
    return
  }
  if (parent.type === ChannelType.GuildForum || parent.type === ChannelType.GuildText || parent.type === ChannelType.GuildAnnouncement) {
    const { container } = await ticketWelcome(interaction.user.id, serviceName, ticketNumber, 'solicitado')
    const thread = await parent.threads.create({ name: ticketName, message: { flags: MessageFlags.IsComponentsV2, components: [container] }, reason: `Ticket #${ticketNumber} (${serviceName}) de ${interaction.user.tag}` })
    try {
      const starter = await thread.fetchStarterMessage().catch(() => null)
      await Ticket.create({
        guildId: interaction.guild.id,
        channelId: thread.id,
        userId: interaction.user.id,
        service,
        status: 'solicitado',
        number: ticketNumber,
        welcomeMessageId: starter?.id
      })
      await thread.send({ ...payload, components: [projectCard({ descripcion, funciones, referencias })] })
    } catch (error) {
      await thread.delete('No se pudo registrar el ticket en MongoDB').catch(() => null)
      throw error
    }
    await interaction.reply({ content: `<@${interaction.user.id}>, su ticket de tipo **Servicios** \`${serviceName}\` ha sido creado en ${thread}.`, ephemeral: true })
    return
  }
  await interaction.reply({ content: 'El canal configurado para tickets no permite crear tickets.', ephemeral: true })
}

async function editWelcomeTicket(client: Client, ticket: TicketDocument): Promise<void> {
  const { container } = await ticketWelcome(ticket.userId, SERVICE_LABEL[ticket.service], ticket.number, ticket.status as TicketPhase)
  const payload = { flags: MessageFlags.IsComponentsV2 as const, components: [container] }
  const guild = client.guilds.cache.get(ticket.guildId) ?? await client.guilds.fetch(ticket.guildId).catch(() => null)
  if (!guild) return
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || !('send' in channel)) return
  if (ticket.welcomeMessageId) {
    const message = await channel.messages.fetch(ticket.welcomeMessageId).catch(() => null)
    if (message) {
      await message.edit(payload).catch(() => null)
      return
    }
  }
  const sent = await channel.send(payload).catch(() => null)
  if (sent) {
    ticket.welcomeMessageId = sent.id
    await ticket.save().catch(() => null)
  }
}

/** Docs de antes del cambio de estados: se normalizan solas al guardar. */
export function normalizeLegacyTicket(doc: TicketDocument | null): TicketDocument | null {
  if (doc && ((doc.status as string) === 'open' || (doc.status as string) === 'closed')) {
    doc.status = (doc.status as string) === 'open' ? 'solicitado' : 'cerrado'
  }
  return doc
}

async function findOpenTicket(guildId: string, channelId: string) {
  const ticket = await Ticket.findOne({ guildId, channelId, status: { $ne: 'cerrado' } })
  return normalizeLegacyTicket(ticket)
}

export function startConditionsModal() {
  return new ModalBuilder()
    .setCustomId('start-conditions')
    .setTitle('Condiciones acordadas')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('precio')
          .setLabel('Precio acordado')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('120 €')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('plazo')
          .setLabel('Plazo acordado')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('7 días')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('notas')
          .setLabel('Alcance o notas')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
      )
    )
}

export function reviewDetailsModal() {
  return new ModalBuilder()
    .setCustomId('review-details')
    .setTitle('Revisión del proyecto')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('entrega')
          .setLabel('Qué se entrega en esta revisión')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    )
}

export async function advanceTicketPhase(interaction: ButtonInteraction, action: 'start' | 'review' | 'deliver'): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('send' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }
  if (!interaction.guild) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }
  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }
  const ticket = await findOpenTicket(interaction.guild.id, channel.id)
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }

  if (action === 'start') {
    if (ticket.status !== 'solicitado') {
      await interaction.reply({ content: 'La transición no es válida desde el estado actual.', ephemeral: true })
      return
    }
    await interaction.showModal(startConditionsModal())
    return
  }

  if (action === 'review') {
    if (ticket.status !== 'en_curso') {
      await interaction.reply({ content: 'La transición no es válida desde el estado actual.', ephemeral: true })
      return
    }
    await interaction.showModal(reviewDetailsModal())
    return
  }

  if (ticket.status !== 'en_revision') {
    await interaction.reply({ content: 'La transición no es válida desde el estado actual.', ephemeral: true })
    return
  }

  ticket.status = 'entregado'
  ticket.deliveredAt = new Date()
  await ticket.save()
  await editWelcomeTicket(interaction.client, ticket)
  const total = formatElapsed(ticket.startedAt ?? ticket.createdAt)
  await channel.send(`<@${ticket.userId}>. El proyecto ha sido entregado. Tiempo total: ${total}.`)
  await postRatingMessage(interaction.client, ticket)
  await interaction.reply({ content: 'El ticket ha pasado a entregado.', ephemeral: true })
}

export async function handleStartConditionsSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('send' in channel)) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }
  if (!interaction.guild) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }
  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }
  const ticket = await findOpenTicket(interaction.guild.id, channel.id)
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }
  if (ticket.status !== 'solicitado') {
    await interaction.reply({ content: 'La transición no es válida desde el estado actual.', ephemeral: true })
    return
  }

  const precio = interaction.fields.getTextInputValue('precio').trim()
  const plazo = interaction.fields.getTextInputValue('plazo').trim()
  const notas = interaction.fields.getTextInputValue('notas').trim() || null
  if (!precio || !plazo) {
    await interaction.reply({ content: 'El precio y el plazo son obligatorios.', ephemeral: true })
    return
  }

  ticket.status = 'en_curso'
  ticket.startedAt = new Date()
  ticket.agreedPrice = precio
  ticket.agreedDeadline = plazo
  await ticket.save()
  await editWelcomeTicket(interaction.client, ticket)
  await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [conditionsCard(ticket.userId, precio, plazo, notas)]
  })
  await interaction.reply({ content: 'El ticket ha pasado a desarrollo.', ephemeral: true })
}

export async function handleReviewDetailsSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('send' in channel)) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }
  if (!interaction.guild) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }
  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }
  const ticket = await findOpenTicket(interaction.guild.id, channel.id)
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }
  if (ticket.status !== 'en_curso') {
    await interaction.reply({ content: 'La transición no es válida desde el estado actual.', ephemeral: true })
    return
  }

  const entrega = interaction.fields.getTextInputValue('entrega').trim()
  if (!entrega) {
    await interaction.reply({ content: 'La descripción de la entrega es obligatoria.', ephemeral: true })
    return
  }

  ticket.status = 'en_revision'
  await ticket.save()
  await editWelcomeTicket(interaction.client, ticket)
  await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [reviewCard(ticket.userId, entrega, ticket.startedAt ?? ticket.createdAt, ticket.agreedDeadline ?? 'No indicado.')]
  })
  await interaction.reply({ content: 'El ticket ha pasado a revisión.', ephemeral: true })
}

export async function setTicketPhase(
  client: Client,
  ticket: TicketDocument,
  status: TicketPhase
): Promise<{ firstDelivery: boolean }> {
  const firstDelivery = status === 'entregado' && ticket.status !== 'entregado'
  if (status === 'en_curso' && !ticket.startedAt) ticket.startedAt = new Date()
  if (status === 'entregado' && !ticket.deliveredAt) ticket.deliveredAt = new Date()
  ticket.status = status
  await ticket.save()
  await editWelcomeTicket(client, ticket)
  if (firstDelivery) await postRatingMessage(client, ticket)
  return { firstDelivery }
}

export function describeTicketPhase(ticket: TicketDocument): string {
  const lines = [
    `**Estado:** ${PHASE_TEXT[ticket.status as TicketPhase]}`,
    `**Tipo:** \`${SERVICE_LABEL[ticket.service]}\`. **Ticket:** \`servicios-${ticket.number}\``,
    `**Precio acordado:** ${ticket.agreedPrice ?? 'No indicado.'}. **Plazo acordado:** ${ticket.agreedDeadline ?? 'No indicado.'}`
  ]
  if (ticket.startedAt) lines.push(`**Inicio:** ${formatDate(ticket.startedAt)}`)
  if (ticket.deliveredAt) lines.push(`**Entrega:** ${formatDate(ticket.deliveredAt)}`)
  return lines.join('\n')
}

export async function postRatingMessage(client: Client, ticket: TicketDocument): Promise<void> {
  const guild = client.guilds.cache.get(ticket.guildId) ?? await client.guilds.fetch(ticket.guildId).catch(() => null)
  if (!guild) return
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || !('send' in channel)) return
  const stars = [5, 4, 3, 2, 1].map(value =>
    new StringSelectMenuOptionBuilder()
      .setLabel('★'.repeat(value))
      .setValue(String(value))
      .setDescription(`${value} de 5 estrellas`)
  )
  const container = new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@${ticket.userId}>. Se ruega valorar el servicio.`),
      new TextDisplayBuilder().setContent('# Valoración del servicio')
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('services-rate')
          .setPlaceholder('Seleccionar valoración')
          .addOptions(stars)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('services-review-comment').setLabel('Añadir comentario').setStyle(ButtonStyle.Secondary)
      )
    )
  await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container] }).catch(() => null)
}

export async function handleRateService(interaction: StringSelectMenuInteraction): Promise<void> {
  const rating = Number(interaction.values[0])
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: 'Esta acción solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }
  const ticket = await findOpenTicket(interaction.guild.id, interaction.channel.id)
  if (!ticket || ticket.status !== 'entregado') {
    await interaction.reply({ content: 'La valoración solo está disponible cuando el proyecto está entregado.', ephemeral: true })
    return
  }
  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: 'Esta acción está reservada al cliente del ticket.', ephemeral: true })
    return
  }
  const existing = await Review.findOne({ channelId: ticket.channelId }).lean()
  if (existing) {
    await interaction.reply({ content: 'Ya se ha registrado una valoración para este ticket.', ephemeral: true })
    return
  }
  await Review.create({
    guildId: ticket.guildId,
    channelId: ticket.channelId,
    userId: ticket.userId,
    service: ticket.service,
    rating
  })
  await interaction.reply({ content: 'La valoración ha sido registrada.', ephemeral: true })
}

export function reviewCommentModal() {
  return new ModalBuilder()
    .setCustomId('review-comment')
    .setTitle('Añadir comentario')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('comentario')
          .setLabel('Comentario sobre el servicio')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    )
}

export async function handleReviewCommentSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: 'Este formulario solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }
  const ticket = await findOpenTicket(interaction.guild.id, interaction.channel.id)
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }
  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: 'Esta acción está reservada al cliente del ticket.', ephemeral: true })
    return
  }
  const review = await Review.findOne({ channelId: ticket.channelId })
  if (!review) {
    await interaction.reply({ content: 'Se ruega registrar primero una valoración.', ephemeral: true })
    return
  }
  const comentario = interaction.fields.getTextInputValue('comentario').trim()
  if (!comentario) {
    await interaction.reply({ content: 'El comentario no puede estar vacío.', ephemeral: true })
    return
  }
  review.comment = comentario
  await review.save()
  await interaction.reply({ content: 'El comentario ha sido registrado.', ephemeral: true })
}

/** Cierre pendiente por canal (id del mensaje de confirmación, anti-doble-clic). */
const pendingClose = new Map<string, string>()

function renderComponentText(component: unknown): string[] {
  if (!component || typeof component !== 'object') return []
  const node = component as {
    type?: number
    content?: unknown
    components?: unknown
    label?: unknown
    placeholder?: unknown
  }
  const lines: string[] = []
  switch (node.type) {
    case ComponentType.TextDisplay:
      if (typeof node.content === 'string' && node.content.trim()) lines.push(node.content.trim())
      break
    case ComponentType.Container:
    case ComponentType.Section:
    case ComponentType.ActionRow:
      if (Array.isArray(node.components)) {
        for (const nested of node.components) lines.push(...renderComponentText(nested))
      }
      break
    case ComponentType.Button:
      if (typeof node.label === 'string') lines.push(`[Botón: ${node.label}]`)
      break
    case ComponentType.StringSelect:
    case ComponentType.UserSelect:
    case ComponentType.RoleSelect:
    case ComponentType.MentionableSelect:
    case ComponentType.ChannelSelect:
      if (typeof node.placeholder === 'string') lines.push(`[Menú: ${node.placeholder}]`)
      break
    default:
      break
  }
  return lines
}

function renderMessageText(message: Message): string {
  const date = message.createdAt.toLocaleString('es-ES')
  const body: string[] = []
  if (message.content?.trim()) body.push(message.content.trim())
  for (const embed of message.embeds) {
    if (embed.title) body.push(embed.title)
    if (embed.description) body.push(embed.description)
    for (const field of embed.fields ?? []) body.push(`${field.name}: ${field.value}`)
    if (embed.footer?.text) body.push(embed.footer.text)
  }
  for (const component of message.components) {
    body.push(...renderComponentText(component.toJSON()))
  }
  for (const attachment of message.attachments.values()) {
    body.push(`[Adjunto: ${attachment.name ?? 'archivo'}](${attachment.url})`)
  }
  return `[${date}] ${message.author.tag}:\n${body.join('\n') || '(sin contenido)'}`
}

async function fetchChannelMessages(channel: TextBasedChannel): Promise<{ messages: Message[]; truncated: boolean }> {
  const all: Message[] = []
  let before: string | undefined
  for (let page = 0; page < 50; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null)
    if (!batch || batch.size === 0) return { messages: all, truncated: false }
    const sorted = [...batch.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    all.unshift(...sorted)
    if (batch.size < 100) return { messages: all, truncated: false }
    before = sorted[0].id
  }
  return { messages: all, truncated: true }
}

function transcriptContainer(data: {
  ticketNumber: number
  serviceName: string
  userId: string
  created: Date
  started?: Date
  delivered?: Date
  closed: Date
  precio: string
  plazo: string
  rating: number | null
  comment?: string | null
  messageCount: number
  truncated: boolean
}): ContainerBuilder {
  const dates =
    `**Creado:** ${formatDate(data.created)}.` +
    (data.started ? ` **Inicio:** ${formatDate(data.started)}.` : '') +
    (data.delivered ? ` **Entrega:** ${formatDate(data.delivered)}.` : '') +
    ` **Cierre:** ${formatDate(data.closed)}.`
  return new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# Transcripción del ticket #${data.ticketNumber}`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Tipo:** \`${data.serviceName}\`. **Cliente:** <@${data.userId}>.`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(dates))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Precio acordado:** ${data.precio}. **Plazo acordado:** ${data.plazo}.`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        (data.rating
          ? `**Valoración:** ${data.rating}/5.${data.comment ? ` **Comentario:** ${data.comment}` : ''}`
          : 'Sin valoración.') +
        `\n**Mensajes:** ${data.messageCount}${data.truncated ? ' (limitados a los 5000 más recientes)' : ''}.`
      )
    )
    .addFileComponents(
      new FileBuilder().setURL(`attachment://servicios-${data.ticketNumber}.txt`)
    )
}
async function sendTicketTranscript(client: Client, ticket: TicketDocument, channel: TextBasedChannel): Promise<void> {
  try {
    if (channel.isDMBased()) return
    const [fetched, review, user] = await Promise.all([
      fetchChannelMessages(channel),
      Review.findOne({ channelId: ticket.channelId }).lean(),
      client.users.fetch(ticket.userId).catch(() => null)
    ])
    const messages = fetched.messages
    const meta = [
      `Ticket #${ticket.number} · Servicios`,
      `Tipo: ${SERVICE_LABEL[ticket.service]}`,
      `Cliente: ${user ? `${user.tag} (<@${ticket.userId}>)` : `<@${ticket.userId}>`}`,
      'Estado: Cerrado.',
      `Creado: ${ticket.createdAt.toLocaleDateString('es-ES')}.` +
        (ticket.startedAt ? ` Inicio: ${ticket.startedAt.toLocaleDateString('es-ES')}.` : '') +
        (ticket.deliveredAt ? ` Entrega: ${ticket.deliveredAt.toLocaleDateString('es-ES')}.` : ''),
      `Precio acordado: ${ticket.agreedPrice ?? 'No indicado.'} Plazo acordado: ${ticket.agreedDeadline ?? 'No indicado.'}`,
      review
        ? `Valoración: ${review.rating}/5.${review.comment ? ` Comentario: ${review.comment}` : ''}`
        : 'Sin valoración.'
    ]
    const transcript = `${meta.join('\n')}\n\n===== Mensajes (${messages.length}${fetched.truncated ? ', limitados a los 5000 más recientes' : ''}) =====\n\n${messages.map(renderMessageText).join('\n\n')}`
    const fileName = `servicios-${ticket.number}.txt`
    const container = transcriptContainer({
      ticketNumber: ticket.number,
      serviceName: SERVICE_LABEL[ticket.service],
      userId: ticket.userId,
      created: ticket.createdAt,
      started: ticket.startedAt,
      delivered: ticket.deliveredAt,
      closed: new Date(),
      precio: ticket.agreedPrice ?? 'No indicado.',
      plazo: ticket.agreedDeadline ?? 'No indicado.',
      rating: review?.rating ?? null,
      comment: review?.comment,
      messageCount: messages.length,
      truncated: fetched.truncated
    })
    const target = await client.channels.fetch(TRANSCRIPT_THREAD_ID).catch(() => null)
    if (target && target.isTextBased() && 'send' in target) {
      await target.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files: [new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: fileName })]
      })
    } else {
      logger.warn('Transcripción omitida: hilo no disponible', { threadId: TRANSCRIPT_THREAD_ID })
    }
    if (user && !user.bot) {
      await user.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files: [new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: fileName })]
      }).catch(() => logger.info('Transcripción por MD omitida: mensajes directos cerrados', { ticket: ticket.number }))
    }
  } catch (error) {
    logger.warn('Transcripción fallida', {
      ticket: ticket.number,
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

function closeConfirmContainer(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0x99AAB5)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Cerrar ticket')
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '¿Está seguro de que desea cerrar el ticket? Esta acción eliminará el canal.'
      )
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('services-confirm-close').setLabel('Confirmar cierre').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('services-cancel-close').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    ))
}

export async function requestServiceTicketClose(interaction: ButtonInteraction | ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('delete' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }

  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }

  const ticket = await findOpenTicket(interaction.guild.id, channel.id)
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }

  if (pendingClose.has(channel.id)) {
    await interaction.reply({ content: 'Ya existe una solicitud de cierre pendiente.', ephemeral: true })
    return
  }

  if (!('send' in channel) || !('messages' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }

  const pendingId = pendingClose.get(channel.id)
  if (pendingId) {
    const pendingMessage = await channel.messages.fetch(pendingId).catch(() => null)
    if (pendingMessage) {
      await interaction.reply({ content: 'Ya existe una solicitud de cierre pendiente.', ephemeral: true })
      return
    }
    pendingClose.delete(channel.id)
  }

  const confirmMessage = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [closeConfirmContainer()]
  })
  pendingClose.set(channel.id, confirmMessage.id)
  await interaction.reply({ content: 'Se ha enviado la solicitud de cierre al canal.', ephemeral: true })
}

export async function confirmServiceTicketClose(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('delete' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }

  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }

  const ticket = await findOpenTicket(interaction.guild.id, channel.id)
  if (!ticket) {
    pendingClose.delete(channel.id)
    await interaction.message.delete().catch(() => null)
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }

  ticket.status = 'cerrado'
  ticket.closedAt = new Date()
  ticket.closedBy = interaction.user.id
  await ticket.save()
  pendingClose.delete(channel.id)

  if (channel.isTextBased()) {
    await sendTicketTranscript(interaction.client, ticket, channel).catch(() => null)
  }

  await interaction.reply({ content: 'El ticket se cerrará en unos instantes.', ephemeral: true })
  await channel.delete(`Ticket cerrado por ${interaction.user.tag}`)
}

export async function cancelServiceTicketClose(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('delete' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }

  if (!await isTicketStaff(interaction)) {
    await interaction.reply({ content: 'Esta acción está reservada a los administradores del servidor.', ephemeral: true })
    return
  }

  pendingClose.delete(channel.id)
  await interaction.message.delete().catch(() => null)
  await interaction.reply({ content: 'El cierre del ticket ha sido cancelado.', ephemeral: true })
}

export async function closeServiceTicket(interaction: ButtonInteraction): Promise<void> {
  await requestServiceTicketClose(interaction)
}
