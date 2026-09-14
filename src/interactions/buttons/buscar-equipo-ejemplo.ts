import type { ButtonHandler } from '../../types/interactions'
import {
  BUSCAR_EQUIPO_ROLE_ID
} from '../../services/buscarEquipo'

export default {
  customId: 'buscar-equipo-ejemplo',

  async execute(interaction) {
    await interaction.reply({
      content: [
        '# 🔍 Cómo funciona Buscar Equipo',
        '',
        'Este canal sirve para **buscar jugadores con los que jugar a Brawl Stars** mediante el rol de Buscar Equipo. <:emoji2:1264913591312711812>',
        '',
        '## 🔔 El rol de Buscar Equipo',
        '',
        `El rol **@Buscar Equipo** tiene dos usos:`,
        '',
        `- **📥 Recibir pings:** equípate el rol desde **Personalizar** (<id:customize>) para recibir los avisos de las búsquedas de equipo que se hagan en este canal.`,
        '',
        `- **📤 Dar pings / Buscar equipo:** si necesitas encontrar jugadores, menciona el rol **@Buscar Equipo** en este canal junto con tu búsqueda.`,
        '',
        'Para mencionar el rol, escribe `@` seguido de **Buscar Equipo** y selecciona el rol que aparece en la lista. Después, escribe tu búsqueda.',
        '',
        `Por ejemplo:`,
        `> <@&${BUSCAR_EQUIPO_ROLE_ID}> Alguien para para subir prestigio 2 de Kenji?`,
        '',
        'Procura incluir la información necesaria para que los demás sepan si pueden unirse. <:emoji2:1264913591312711812>',
        '',
        '## 🎙️ Canales de voz',
        '',
        'Si quieres hablar mientras juegas, puedes crear un canal de voz dentro del servidor según lo que necesites:',
        '',
        `- **Dúo:** <#1163774017975631892>`,
        `- **Trío:** <#1163777101426597948>`,
        `- **Amistoso:** <#1163778987122761728>`,
        '',
        '## ⚠️ Importante',
        '',
        'Menciona el rol **solo cuando realmente estés buscando equipo**. Evita las menciones innecesarias o repetidas para no molestar al resto de miembros. <:No_more:1461425869275791483>',
        '',
        'El mal uso del sistema podrá ser **sancionado en el servidor**.'
      ].join('\n'),
      allowedMentions: { parse: [] },
      ephemeral: true
    })
  }
} satisfies ButtonHandler