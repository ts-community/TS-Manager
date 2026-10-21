import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import Asociacion from '../../models/Asociacion'
import { addDays } from '../../services/asociaciones'
import { scheduleRenewalPanelSync } from '../../services/asociaciones-sync'
import logger from '../../utils/logger'

// Tiempo mínimo entre plantillas de renovación en un mismo canal
const TEMPLATE_COOLDOWN_MS = 5 * 60 * 1000

// Canal donde los miembros desactivan los pings de renovación
const ASOCIACIONES_PING_CHANNEL_ID = '1544728042213998702'

// dd/mm/aa
function formatDate(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Madrid' })
}

// Cada mensaje nuevo en un canal de asociación renueva la fecha y avisa con la plantilla
export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (!message.guild || message.author.bot) return

    try {
      const asociacion = await Asociacion.findOne({ canalId: message.channelId })
      if (!asociacion) return

      const now = new Date()
      const nextRenovationDate = addDays(now, asociacion.renovacionDias)
      const update = { lastRenovationDate: now, nextRenovationDate, renovacionAvisada: false }

      // La fecha cambió, pero los paneles NO se reeditan por cada mensaje:
      // se agrupan en una única sync lenta (30 min de debounce)
      scheduleRenewalPanelSync(_client)

      // Reclamo atómico: solo el primer mensaje fuera del cooldown envía la plantilla,
      // así varios mensajes seguidos (o simultáneos) de la alianza no la duplican
      const claimed = await Asociacion.findOneAndUpdate(
        { _id: asociacion._id, lastRenovationDate: { $lte: new Date(now.getTime() - TEMPLATE_COOLDOWN_MS) } },
        update,
        { new: true }
      )

      if (!claimed) {
        await Asociacion.updateOne({ _id: asociacion._id }, update)
        return
      }
      asociacion.nextRenovationDate = claimed.nextRenovationDate

      if (!message.channel.isSendable()) return

      const representante = asociacion.representanteId ? `<@${asociacion.representanteId}>` : 'Sin asignar'

      await message.channel.send({
        content:
          `👤 ﹒ **Re**pr__es__**en**tan**te:**  ${representante} \n` +
          `🔄 ﹒ **Fre**cu__en__**cia:** ${asociacion.renovacionDias} días\n` +
          `📅 ﹒ **Pró**xi__ma__ **Re**no**va**ció**n:** ${formatDate(asociacion.nextRenovationDate)}\n\n` +
          `### \`🔕\` *Desactiva estos pings en <#${ASOCIACIONES_PING_CHANNEL_ID}>*`,
        allowedMentions: { parse: ['users'] }
      }).catch(() => {})
    } catch (error) {
      logger.error('Asociaciones: error procesando renovación automática', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>
