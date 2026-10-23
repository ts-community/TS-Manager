import {
  ActionRowBuilder,
  ChannelType,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Collection,
  type Message
} from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Asociacion from '../../../models/Asociacion'
import {
  buildAssociationDetailPayload,
  buildAssociationsListPayload,
  buildMessageCard,
  buildRemoveConfirmPayload,
  capitalizeName,
  schedulePanelsSync,
  sendAsociacionesLog
} from '../../../services/asociaciones'
import {
  ASOCIACIONES_CATEGORY_ID,
  EMOJI,
  addDays,
  greenEmbed,
  servidorFilter,
  titleFromChannelName,
  toChannelSlug,
  unix
} from '../../../services/asociaciones'

const STAFF_MENU_ID = 'asoc-select-staff'
const ASOCIACION_MENU_ID = 'asoc-select-asociacion'

async function getLastMessageDate(channel: unknown): Promise<Date> {
  const manager = (channel as { messages?: { fetch: (o: { limit: number }) => Promise<Collection<string, Message>> } }).messages
  const last = await manager?.fetch({ limit: 1 }).catch(() => null)
  const firstMessage = last?.values().next().value
  return firstMessage?.createdAt ?? new Date()
}

// Tarjeta con las asociaciones de un staff + menú para entrar a cada una
async function buildAsociacionesStaffPayload(
  interaction: ChatInputCommandInteraction,
  memberId: string
): Promise<unknown> {
  const member = await interaction.guild!.members.fetch(memberId).catch(() => null)
  const asociaciones = await Asociacion.find({ staffEncargadoId: memberId }).sort({ servidor: 1 })
  const staffName = member?.displayName ?? `<@${memberId}>`

  if (!asociaciones.length) {
    return {
      embeds: [greenEmbed()
        .setTitle(`${EMOJI.asociacion} Sin asociaciones`)
        .setDescription(`**${staffName}** todavía no participa en ninguna asociación.`)
        .setTimestamp()
      ],
      components: []
    }
  }

  if (asociaciones.length === 1) {
    return buildAssociationDetailPayload(asociaciones[0], { canEdit: true, canDelete: true })
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(ASOCIACION_MENU_ID)
    .setPlaceholder('Selecciona una asociación para ver su información')
  for (const a of asociaciones.slice(0, 25)) {
    menu.addOptions({ label: capitalizeName(a.servidor).slice(0, 100), value: a.id.toString() })
  }

  return buildAssociationsListPayload(asociaciones, {
    title: `Asociaciones de ${staffName}`,
    subtitle: `${asociaciones.length} asociaciones`,
    menu
  })
}

async function findAsociacion(value: string) {
  return await Asociacion.findById(value) ?? await Asociacion.findOne(servidorFilter(value))
}

export default {
  data: new SlashCommandBuilder()
    .setName('asociaciones')
    .setDescription('Gestión de asociaciones')
    .addSubcommand(sub =>
      sub
        .setName('mostrar')
        .setDescription('Muestra la información de una asociación o de las que gestiona un staff')
        .addStringOption(o =>
          o
            .setName('asociacion')
            .setDescription('Ver una asociación concreta (búsqueda por nombre)')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addUserOption(o => o.setName('staff').setDescription('Ver las asociaciones gestionadas por este staff').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('crear')
        .setDescription('Crea una asociación nueva o adosa un canal ya existente')
        .addUserOption(o => o.setName('representante').setDescription('Representante de la asociación').setRequired(true))
        .addIntegerOption(o => o.setName('tiempo-renovacion').setDescription('Días entre renovaciones').setMinValue(1).setMaxValue(365).setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji del canal nuevo (formato 「emoji」nombre-a-nombre)'))
        .addStringOption(o => o.setName('nombre').setDescription('Nombre de la asociación, con mayúsculas correctas'))
        .addChannelOption(o => o.setName('canal').setDescription('Canal ya existente (si no se crea uno nuevo)').addChannelTypes(ChannelType.GuildText))
        .addUserOption(o => o.setName('staff-encargado').setDescription('Miembro del staff encargado de esta asociación (por defecto: tú)'))
    )
    .addSubcommand(sub =>
      sub
        .setName('editar')
        .setDescription('Edita los campos de una asociación')
        .addStringOption(o =>
          o
            .setName('nombre')
            .setDescription('Asociación a editar')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(o => o.setName('nuevo-nombre').setDescription('Nuevo nombre de la asociación, con mayúsculas correctas').setMaxLength(64))
        .addUserOption(o => o.setName('nuevo-representante').setDescription('Nuevo representante de la asociación'))
        .addUserOption(o => o.setName('nuevo-encargado').setDescription('Nuevo miembro del staff encargado de la asociación'))
        .addIntegerOption(o => o.setName('nueva-duracion').setDescription('Nueva frecuencia de renovación, en días').setMinValue(1).setMaxValue(365))
        .addChannelOption(o => o.setName('nuevo-canal').setDescription('Nuevo canal de la asociación').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
      sub
        .setName('eliminar')
        .setDescription('Elimina una asociación de la lista')
        .addStringOption(o =>
          o
            .setName('nombre')
            .setDescription('Asociación a eliminar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true)
    const search = String(focused.value).toLowerCase()
    const asociaciones = await Asociacion.find().sort({ servidor: 1 })

    const seen = new Set<string>()
    const options: { name: string, value: string }[] = []
    for (const a of asociaciones) {
      if (!a.servidor.toLowerCase().includes(search)) continue
      const name = capitalizeName(a.servidor).slice(0, 100)
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      options.push({ name, value: a.id.toString() })
      if (options.length >= 25) break
    }

    await interaction.respond(options)
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Este comando solo puede usarse en un servidor.' })
    }

    const sub = interaction.options.getSubcommand()

    await interaction.deferReply()

    const reply = async (content: string) => {
      await interaction.editReply({ content })
    }

    /* ------------------- mostrar ------------------- */
    if (sub === 'mostrar') {
      const asociacionParam = interaction.options.getString('asociacion')
      const staffUser = interaction.options.getUser('staff')

      if (asociacionParam) {
        const asociacion = await findAsociacion(asociacionParam)
        if (!asociacion) {
          return void reply(`No se encontró ninguna asociación con \`${asociacionParam}\`.`)
        }

        return void interaction.editReply(
          buildAssociationDetailPayload(asociacion, { canEdit: true, canDelete: true }) as never
        )
      }

      if (staffUser) {
        return void interaction.editReply(await buildAsociacionesStaffPayload(interaction, staffUser.id) as never)
      }

      // Sin parámetros: menú para elegir el staff/miembro
      const menu = new UserSelectMenuBuilder()
        .setCustomId(STAFF_MENU_ID)
        .setPlaceholder('Selecciona el staff o miembro a consultar')
      return void interaction.editReply(buildMessageCard(
        `# ${EMOJI.asociacion} ¿A quién consultamos?\n\n` +
        'Elige a un miembro del menú de abajo y verás sus asociaciones; si gestiona varias, podrás elegir una para ver toda la info con botones de editar/eliminar.',
        { actionRow: new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu) }
      ) as never)
    }

    /* ------------------- crear ------------------- */
    if (sub === 'crear') {
      const canalOpt = interaction.options.getChannel('canal')
      const emoji = interaction.options.getString('emoji')?.trim()
      const nombreRaw = interaction.options.getString('nombre')?.trim()
      const nombreOpt = nombreRaw ? capitalizeName(nombreRaw) : null
      const representante = interaction.options.getUser('representante', true)
      const dias = interaction.options.getInteger('tiempo-renovacion', true)
      const staffEncargadoId = interaction.options.getUser('staff-encargado')?.id ?? interaction.user.id

      let canal = canalOpt
      let servidorDisplay = ''

      if (canal) {
        // Usamos un canal ya existente
        servidorDisplay = nombreOpt ?? titleFromChannelName(canal.name ?? '')
      } else {
        // Creamos un canal nuevo con el formato 「emoji」nombre-con-guiones
        if (!emoji || !nombreOpt) {
          return void reply('Si no eliges un canal existente, debes indicar `emoji` y `nombre` para crear el canal nuevo.')
        }
        const category = await interaction.guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
        if (!category || category.type !== ChannelType.GuildCategory) {
          return void reply('No se encontró la categoría de asociaciones configurada.')
        }

        servidorDisplay = nombreOpt
        const channelName = `「${emoji}」${toChannelSlug(servidorDisplay)}`
        const created = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id
        })
        await created.lockPermissions()
        canal = created
      }

      const duplicada = await Asociacion.findOne(servidorFilter(servidorDisplay))
      if (duplicada) {
        return void reply(`Ya existe una asociación guardada con el nombre "${servidorDisplay}".`)
      }

      const lastMessageDate = await getLastMessageDate(canal)
      const asociacion = await Asociacion.create({
        servidor: servidorDisplay,
        representanteId: representante.id,
        renovacionDias: dias,
        canalId: canal.id,
        staffEncargadoId,
        lastRenovationDate: lastMessageDate,
        nextRenovationDate: addDays(lastMessageDate, dias)
      })

      await sendAsociacionesLog(
        interaction.client,
        greenEmbed().setTitle('📋 LOG: Asociación Creada').setDescription(
          `**Ejecutado por:** ${interaction.user}\n` +
          `${EMOJI.servidor} **Asociación:** ${capitalizeName(asociacion.servidor)}\n` +
          `${EMOJI.canal} **Canal:** <#${asociacion.canalId}>\n` +
          `${EMOJI.representante} **Representante:** ${representante}\n` +
          `${EMOJI.staff} **Staff encargado:** <@${staffEncargadoId}>\n` +
          `${EMOJI.renovacion} **Renovación:** cada ${dias} días`
        ).setTimestamp()
      )

      schedulePanelsSync(interaction.client)

      return void interaction.editReply(buildAssociationDetailPayload(asociacion, {
        canEdit: true,
        canDelete: true,
        note: '✅ **Asociación creada correctamente.**'
      }) as never)
    }

    /* ------------------- editar ------------------- */
    if (sub === 'editar') {
      const nombreOpt = interaction.options.getString('nombre', true)
      const asociacion = await findAsociacion(nombreOpt)
      if (!asociacion) return void reply(`No se encontró ninguna asociación con \`${nombreOpt}\`.`)

      const nuevoNombreRaw = interaction.options.getString('nuevo-nombre')?.trim()
      const nuevoNombre = nuevoNombreRaw ? capitalizeName(nuevoNombreRaw) : null
      const nuevoRepresentante = interaction.options.getUser('nuevo-representante')
      const nuevoEncargado = interaction.options.getUser('nuevo-encargado')
      const nuevaDuracion = interaction.options.getInteger('nueva-duracion')
      const nuevoCanal = interaction.options.getChannel('nuevo-canal')

      if (!nuevoNombre && !nuevoRepresentante && !nuevoEncargado && !nuevaDuracion && !nuevoCanal) {
        return void reply('Indica al menos un campo a editar: `nuevo-nombre`, `nuevo-representante`, `nuevo-encargado`, `nueva-duracion` o `nuevo-canal`.')
      }

      if (nuevoNombre && nuevoNombre.toLowerCase() !== asociacion.servidor.toLowerCase()) {
        const duplicada = await Asociacion.findOne({ ...servidorFilter(nuevoNombre), _id: { $ne: asociacion._id } })
        if (duplicada) {
          return void reply(`Ya existe otra asociación guardada con el nombre "${nuevoNombre}".`)
        }
      }

      const cambios: string[] = []
      const antes = asociacion.servidor

      if (nuevoNombre && nuevoNombre !== asociacion.servidor) {
        asociacion.servidor = nuevoNombre
        cambios.push(`${EMOJI.servidor} **Nombre:** ${antes} → **${nuevoNombre}**`)
      }
      if (nuevoRepresentante && nuevoRepresentante.id !== asociacion.representanteId) {
        const anterior = asociacion.representanteId
        asociacion.representanteId = nuevoRepresentante.id
        cambios.push(`${EMOJI.representante} **Representante:** ${anterior ? `<@${anterior}>` : '*sin asignar*'} → ${nuevoRepresentante}`)
      }
      if (nuevoEncargado && nuevoEncargado.id !== asociacion.staffEncargadoId) {
        const anterior = asociacion.staffEncargadoId
        asociacion.staffEncargadoId = nuevoEncargado.id
        cambios.push(`${EMOJI.staff} **Staff encargado:** ${anterior ? `<@${anterior}>` : '*sin asignar*'} → ${nuevoEncargado}`)
      }
      if (nuevoCanal && nuevoCanal.id !== asociacion.canalId) {
        const anterior = asociacion.canalId
        asociacion.canalId = nuevoCanal.id
        cambios.push(`${EMOJI.canal} **Canal:** <#${anterior}> → <#${nuevoCanal.id}>`)
      }
      if (nuevaDuracion && nuevaDuracion !== asociacion.renovacionDias) {
        const anterior = asociacion.renovacionDias
        asociacion.renovacionDias = nuevaDuracion
        asociacion.nextRenovationDate = addDays(new Date(asociacion.lastRenovationDate as Date), nuevaDuracion)
        asociacion.renovacionAvisada = false
        const next = unix(asociacion.nextRenovationDate)
        cambios.push(`${EMOJI.renovacion} **Frecuencia:** cada ${anterior} → **cada ${nuevaDuracion}** día(s) · ${EMOJI.proxima} Próxima: <t:${next}:d>`)
      }

      if (!cambios.length) {
        return void reply('No hay nada que cambiar: todos los campos indicados ya tenían esos valores.')
      }

      await asociacion.save()
      schedulePanelsSync(interaction.client)

      await sendAsociacionesLog(
        interaction.client,
        greenEmbed().setTitle('📋 LOG: Asociación Editada').setDescription(
          `**Ejecutado por:** ${interaction.user}\n` +
          `${EMOJI.servidor} **Asociación:** ${capitalizeName(asociacion.servidor)} (<#${asociacion.canalId}>)\n\n` +
          cambios.join('\n')
        ).setTimestamp()
      )

      return void interaction.editReply(buildAssociationDetailPayload(asociacion, {
        canEdit: true,
        canDelete: true,
        note: `✏️ **Cambios aplicados**\n${cambios.join('\n')}`
      }) as never)
    }

    /* ------------------- eliminar ------------------- */
    if (sub === 'eliminar') {
      const nombreOpt = interaction.options.getString('nombre', true)
      const asociacion = await findAsociacion(nombreOpt)
      if (!asociacion) return void reply(`No se encontró ninguna asociación con \`${nombreOpt}\`.`)

      return void interaction.editReply(buildRemoveConfirmPayload(asociacion) as never)
    }
  }
} satisfies SlashCommand
