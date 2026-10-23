import { ChannelType, TextChannel, type ChannelSelectMenuInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { addDays } from '../../services/asociaciones'
import { schedulePanelsSync, buildEditorPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// Cambiar canal de la asociación — CustomId: asoc-edit-canal:{asociacionId}
export default {
  async execute(interaction: ChannelSelectMenuInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.' })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.' })

    const canalId = interaction.values[0]
    const canal = await interaction.guild?.channels.fetch(canalId).catch(() => null)
    if (!canal || canal.type !== ChannelType.GuildText) {
      return void interaction.reply({ content: 'El canal seleccionado no es un canal de texto.' })
    }
    const last = await getLastMessageDate(canal)
    asociacion.canalId = canalId
    asociacion.lastRenovationDate = last
    asociacion.nextRenovationDate = addDays(last, asociacion.renovacionDias)
    asociacion.renovacionAvisada = false
    await asociacion.save()
    schedulePanelsSync(interaction.client)

    await interaction.update(buildEditorPayload(asociacion))
  }
}

async function getLastMessageDate(channel: TextChannel): Promise<Date> {
  const last = await channel.messages.fetch({ limit: 1 }).catch(() => null)
  const firstMessage = last?.values().next().value
  return firstMessage?.createdAt ?? new Date()
}
