import {
  ActionRowBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type Client,
  type StringSelectMenuInteraction
} from 'discord.js'
import type { Service } from './tickets'

export const SERVICES_FORUM_CHANNEL_ID = '1549499940722581524'
const SERVICES_THREAD_NAME = 'Servicios de desarrollo'

const info: Record<Service, string> = {
  discord: [
    '# 🤖 DESARROLLO DE BOTS DE DISCORD PERSONALIZADOS', '',
    'Desarrollo de bots a medida, optimizados y estables, adaptados a la comunidad, servidor de rol o negocio del cliente.', '',
    '## ⚡ Tier Básico — Automatización y utilidad',
    '- Moderación automática, logs y bienvenida interactiva.', '- Comandos de texto y slash commands (/).',
    '- Embeds configurados y verificación por botones o reacciones.', '- **Precio:** [DEFINIR] €.', '',
    '## 🛠️ Tier Intermedio — Economía, roles y tickets',
    '- Tickets con transcripción HTML/TXT.', '- Economía, tienda de roles, inventario y recompensas.',
    '- SQLite o PostgreSQL, sorteos y minijuegos.', '- **Precio:** [DEFINIR] €.', '',
    '## 🚀 Tier Avanzado — Sistemas complejos y APIs',
    '- Integración con pagos, paneles externos, IA y servicios de terceros.', '- Dashboard web y arquitectura escalable con sharding.',
    '- **Precio:** a consultar según especificaciones.', '',
    '## 🖥️ Hosting 24/7', '- Estándar: 1,50 €/mes o 25 € de pago único permanente.',
    '- Alto consumo: 3 €/mes o 50 € de pago único permanente.',
    '*Incluye código documentado, base de datos configurada y asistencia inicial.*'
  ].join('\n'),
  web: [
    '# 🌐 SERVICIOS DE DESARROLLO WEB & APLICACIONES', '',
    'Sitios web modernos, responsivos y optimizados para potenciar la marca, proyecto o negocio del cliente.', '',
    '## 📄 Landing Page / Portfolio',
    '- Diseño one-page responsive para móviles y tablets.', '- Servicios, sobre nosotros, testimonios y contacto.',
    '- Velocidad de carga y SEO básico.', '- **Precio:** [DEFINIR] €.', '',
    '## 🏢 Web Corporativa / Multipage',
    '- Inicio, Servicios, Blog, Contacto y FAQ.', '- Panel de administración o CMS.',
    '- Formularios, redes sociales y analíticas.', '- **Precio:** [DEFINIR] €.', '',
    '## ⚙️ Aplicaciones Web / Paneles a Medida',
    '- Desarrollo full-stack con autenticación y login con Discord.', '- Bases de datos y paneles de gestión.',
    '- Pasarelas de pago como Stripe o PayPal.', '- **Precio:** a consultar según alcance.', '',
    '## 🖥️ Alojamiento Web & Despliegue',
    '- Estándar: 1,50 €/mes o 25 € de pago único permanente.', '- Alto rendimiento: 3 €/mes o 50 € de pago único permanente.',
    '*La cuota permanente depende de la actividad del servicio, estimada en 1–2 años. Si el hosting deja de ofrecerse, se cancelan los cobros y se ofrece asistencia para migrar al hosting del cliente o a Vercel.*',
    '- Dominio: 15 € durante 2 años, dependiendo del dominio.', '',
    '## 📦 Entregables & Despliegue', '- Repositorio privado, código fuente, certificados SSL y accesos completos.'
  ].join('\n')
}

function selectRow(customId: string, placeholder: string, options: Array<{ label: string; value: string; description: string; emoji?: string }>) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options.map(option => new StringSelectMenuOptionBuilder()
      .setLabel(option.label).setValue(option.value).setDescription(option.description).setEmoji(option.emoji ?? '')))

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

function servicesMessage(thumbnailUrl?: string) {
  const header = new TextDisplayBuilder().setContent([
    '# Servicios de desarrollo',
    'Bots de Discord y webs a medida. Opciones disponibles:'
  ].join('\n'))
  const list = new TextDisplayBuilder().setContent([
    '- 🤖 **Bots de Discord**. Automatización, sistemas y funciones a medida.',
    '- 🌐 **Webs y apps**. Landings, webs corporativas y paneles.'
  ].join('\n'))
  const terms = new TextDisplayBuilder().setContent(
    'Presupuesto personalizado. Pago inicial del 50%; el resto se abona a la entrega.'
  )
  const note = new TextDisplayBuilder().setContent(
    '-# Entrega del código tras el pago final. Respuesta en menos de 24 horas.'
  )
  const divider = () =>
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)

  const container = new ContainerBuilder().setAccentColor(0x6F2CFF)
  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
    )
  } else {
    container.addTextDisplayComponents(header)
  }
  container.addSeparatorComponents(divider())
  container.addTextDisplayComponents(list, terms, note)
  container.addSeparatorComponents(divider())
  container.addActionRowComponents(selectRow('services-info', 'Ver información', [
    { label: 'Bots de Discord', value: 'discord', description: 'Catálogo, tiers y precios', emoji: '🤖' },
    { label: 'Webs y apps', value: 'web', description: 'Catálogo, planes y precios', emoji: '🌐' },
    { label: 'Términos del servicio', value: 'terminos', description: 'Pagos, plazos y entrega', emoji: '📋' },
    { label: 'Preguntas frecuentes', value: 'faq', description: 'Dudas habituales', emoji: '❓' }
  ]))

  container.addActionRowComponents(selectRow('services-buy', 'Solicitar presupuesto', [
    { label: 'Solicitar presupuesto de bot', value: 'discord', description: 'Se abre un ticket privado', emoji: '🤖' },
    { label: 'Solicitar presupuesto de web', value: 'web', description: 'Se abre un ticket privado', emoji: '🌐' }
  ]))

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [container]
  }
}

export async function publishServiceThreads(client: Client): Promise<void> {
  const channel = await client.channels.fetch(SERVICES_FORUM_CHANNEL_ID).catch(() => null)
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`El canal ${SERVICES_FORUM_CHANNEL_ID} no existe o el bot no puede verlo`)
  }

  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    const thumbnailUrl = client.user?.displayAvatarURL() ?? undefined
    const payload = servicesMessage(thumbnailUrl)
    const recent = await channel.messages.fetch({ limit: 50 })
    const existing = recent.find(message => message.author.id === client.user?.id && message.flags.has(MessageFlags.IsComponentsV2))
    if (existing) {
      await existing.edit(payload)
      return
    }
    await channel.send(payload)
    return
  }

  const channelType = channel.type as ChannelType
  if (channelType !== ChannelType.GuildForum) {
    throw new Error(`El canal ${SERVICES_FORUM_CHANNEL_ID} debe ser de texto o foro`)
  }
  const forum = channel as unknown as import('discord.js').ForumChannel
  const active = await forum.threads.fetchActive()
  const existing = forum.threads.cache.find(thread => thread.name === SERVICES_THREAD_NAME)
    || active.threads.find(thread => thread.name === SERVICES_THREAD_NAME)
  if (!existing) {
    const thumbnailUrl = client.user?.displayAvatarURL() ?? undefined
    await forum.threads.create({ name: SERVICES_THREAD_NAME, message: servicesMessage(thumbnailUrl), reason: 'Publicación del panel unificado de servicios' })
  }
}

export type InfoTopic = Service | 'terminos' | 'faq'

const INFO_ACCENT: Record<InfoTopic, number> = {
  discord: 0x5865F2,
  web: 0x22D3EE,
  terminos: 0x99AAB5,
  faq: 0x99AAB5
}

const terminosText = [
  '# 📜 Términos del servicio', '',
  '## 💳 Pago',
  'Para el inicio del proyecto se abona el **50% por adelantado**; el importe restante se abona a la entrega.',
  'El código fuente se entrega tras completar el pago.', '',
  '## 📦 Alcance y plazos',
  'El presupuesto detalla los elementos incluidos. Las funciones nuevas o los cambios de alcance se presupuestan por separado.',
  'Proyectos básicos: 2–4 días. Avanzados: 7–15 días.', '',
  '## 🖥️ Hosting y dominio (opcional)',
  'Bots: estándar 1,50 €/mes o 25 € pago único. Alto consumo 3 €/mes o 50 € pago único.',
  'Webs: estándar 1,50 €/mes o 25 € pago único. Alto rendimiento 3 €/mes o 50 € pago único.',
  'Dominio: 15 € durante 2 años, según dominio.'
].join('\n')

const faqText = [
  '# ❓ Preguntas frecuentes', '',
  '**¿Cómo se solicita un presupuesto?**',
  'Mediante la opción `Solicitar presupuesto` del panel. En el ticket generado se describen las necesidades del proyecto.', '',
  '**¿Cuál es el plazo de entrega?**',
  'Proyectos básicos: 2–4 días; proyectos avanzados: 7–15 días, según la carga de trabajo.', '',
  '**¿Cuál es la forma de pago?**',
  '50% por adelantado para el inicio del proyecto y resto a la entrega.', '',
  '**¿A quién pertenece el código?**',
  'El código se entrega de forma completa al cliente tras finalizar el pago.', '',
  '**¿Se ofrece hosting?**',
  'Existe servicio opcional de hosting 24/7 y despliegue con SSL.', '',
  '**¿Y si se requieren cambios posteriores?**',
  'Los cambios de alcance se presupuestan por separado en un nuevo ticket.'
].join('\n')

/** Corte manual por tema: cada mensaje empieza en una sección completa, nunca a mitad de bloque. */
const INFO_SPLIT_BEFORE: Record<InfoTopic, string | null> = {
  discord: '## 🖥️ Hosting 24/7',
  web: '## 🖥️ Alojamiento Web & Despliegue',
  terminos: '## 🖥️ Hosting y dominio (opcional)',
  faq: null
}

function buildInfoContainers(topic: InfoTopic, thumbnailUrl?: string): ContainerBuilder[] {
  const body = topic === 'terminos' ? terminosText : topic === 'faq' ? faqText : info[topic]
  const lines = body.split('\n')
  const title = lines[0]
  let i = 1
  while (i < lines.length && lines[i].trim() === '') i++
  let j = i
  while (j < lines.length && lines[j].trim() !== '') j++
  const header = new TextDisplayBuilder().setContent([title, '', ...lines.slice(i, j)].join('\n'))
  const blocks = lines
    .slice(j)
    .join('\n')
    .replace(/^\n+/, '')
    .split(/(?=^## )/m)
    .map(block => block.trim())
    .filter(Boolean)
  const marker = INFO_SPLIT_BEFORE[topic]
  const cut = marker ? blocks.findIndex(block => block.startsWith(marker)) : -1
  const groups: string[][] = cut < 0 ? [blocks] : [blocks.slice(0, cut), blocks.slice(cut)]
  const divider = () =>
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  const containers: ContainerBuilder[] = []
  groups.forEach((group, gi) => {
    let box = new ContainerBuilder().setAccentColor(INFO_ACCENT[topic])
    let used = 0
    if (gi === 0) {
      if (thumbnailUrl) {
        box.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(header)
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        )
      } else {
        box.addTextDisplayComponents(header)
      }
      used = 1
    }
    for (const block of group) {
      // Red de seguridad: si el texto crece en el futuro y no cabe, se abre
      // otro mensaje siempre entre bloques, nunca a mitad.
      if (used > 0 && used + 2 > 10) {
        containers.push(box)
        box = new ContainerBuilder().setAccentColor(INFO_ACCENT[topic])
        used = 0
      }
      if (used > 0) {
        box.addSeparatorComponents(divider())
        used += 1
      }
      box.addTextDisplayComponents(new TextDisplayBuilder().setContent(block))
      used += 1
    }
    containers.push(box)
  })
  return containers
}

export async function showServiceInfo(interaction: StringSelectMenuInteraction, topic: InfoTopic): Promise<void> {
  const thumbnailUrl = interaction.client.user?.displayAvatarURL() ?? undefined
  const containers = buildInfoContainers(topic, thumbnailUrl)
  await interaction.reply({
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    components: containers
  })
}
