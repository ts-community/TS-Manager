import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import type { PrefixCommand } from '../../../types/commands'

const ALIANZAS = `## 🤝 Alianzas
### 1. ¿Cómo se hacen las alianzas?
- **Primero:** revisa nuestro canal de <#1269721600169607250> antes de abrir un ticket.
- **Segundo:** entra a nuestro canal de <#1112731493060595813>, elige cualquier servidor publicado y únete.
- **Tercero:** en el servidor que hayas elegido ve a su canal de #tickets-soporte, abre un ticket y selecciona el apartado de alianzas. Si no aparece el apartado, busca la categoría de alianzas y entra al canal solicitar alianza.
- **Cuarto:** cuando reclamen tu ticket ve al canal <#1269721664783126641>, copia nuestra plantilla, envíala y espera a que te envíen la suya.
- **Quinto:** cuando te manden su plantilla publícala en el canal de <#1112731493060595813>. Una vez publicada, verifica en su canal de alianzas que también hayan publicado la nuestra antes de hacer otra alianza.`

const AFILIACIONES = `## 🔰 Afiliaciones
### 2. ¿Cómo se hacen las afiliaciones?
Las afiliaciones son iguales que las alianzas, pero tienen que llevar mención @everyone y se realizan cada 1 o 2 semanas.
- **Primero:** revisa nuestro canal de <#1269721600169607250> y mira en nuestro canal de <#1543733449888899142> cuándo fue la última afiliación (si ya se hizo una ese mismo día, no hagas otra).
- **Segundo:** entra a nuestro canal de <#1543733449888899142>, elige cualquier servidor publicado y únete.
- **Tercero:** en el servidor que hayas elegido ve a su canal de #tickets-soporte, abre un ticket y selecciona el apartado de alianzas. Habrá una pregunta: *"¿Qué tipo de alianzas buscas?"* y tendrás que responder **afiliación**.
- **Cuarto:** cuando reclamen tu ticket ve al canal <#1269721664783126641>, copia nuestra plantilla, envíala y espera a que te envíen la suya.
- **Quinto:** cuando te manden su plantilla publícala en el canal de <#1543733449888899142>. Una vez publicada, verifica en su canal de afiliaciones que también hayan publicado la nuestra antes de hacer otra afiliación.`

const ASOCIACIONES = `## 🤝 Asociaciones
### 3. ¿Cómo se hacen las asociaciones?
Las asociaciones son iguales que las alianzas, pero el servidor tiene **su propio canal** aquí y se renuevan cada cierto tiempo. Se gestionan con el bot.
- **Primero:** revisa nuestro canal de <#1269721600169607250>, entra al servidor con el que quieras asociarte, ve a su canal de #tickets-soporte, abre un ticket en el apartado de alianzas y, en la pregunta *"¿Qué tipo de alianzas buscas?"*, responde **asociación**. Cuando reclamen tu ticket, intercambiad las plantillas (la nuestra está en <#1269721664783126641>).
- **Segundo:** registra la asociación con </asociaciones crear:1557804108092547143>. Indica el \`representante\`, el \`tiempo-renovacion\` en días, y el \`emoji\` y \`nombre\` para crear el canal (o elige un \`canal\` ya existente). Si no pones \`staff-encargado\`, quedarás tú como encargado.
- **Tercero:** publica su plantilla en el canal de la asociación. Cada mensaje en ese canal cuenta como renovación y reinicia la fecha automáticamente.
- **Cuarto:** consulta las asociaciones con </asociaciones mostrar:1557804108092547143> (por nombre o por staff), cambia datos con </asociaciones editar:1557804108092547143> y bórralas con </asociaciones eliminar:1557804108092547143>.
- Todas aparecen en <#1562220631783903382>.`

const RENOVACIONES = `## 🔄 Renovaciones
### 4. ¿Cómo se hacen las renovaciones?
Un bot te avisará cuando tengas que hacer la renovación. Recuerda que debes hacerla ese mismo día y, si no puedes, avisarlo.
- **Primero:** ve a nuestra <#1562220631783903382> y mira la renovación que se te ha asignado.
- **Segundo:** cuando sepas la renovación asignada, únete al servidor y ve a su canal de #tickets-soporte, abre un ticket y selecciona el apartado de alianzas. Habrá una pregunta: *"¿Qué tipo de alianzas buscas?"* y tendrás que responder **renovación**.
- **Tercero:** cuando reclamen tu ticket ve al canal <#1269721664783126641>, copia nuestra plantilla, envíala y espera a que te envíen la suya.
- **Cuarto:** cuando te manden su plantilla publícala en el canal adecuado con el nombre del servidor y, una vez publicada, verifica que también hayan publicado la nuestra.`

export default {
  description: 'Envía la guía de alianzas, afiliaciones y renovaciones',

  async execute(message) {
    if (!message.inGuild() || !message.channel.isSendable()) return

    const separator = () =>
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)

    const text = (content: string) => new TextDisplayBuilder().setContent(content)

    // Discord limita a 4000 caracteres el texto de un mensaje con componentes v2,
    // así que la guía se reparte en dos mensajes.
    const first = new ContainerBuilder()
      .setAccentColor(0xe02424)
      .addTextDisplayComponents(text('# 📖 Guía de Alianzas, Afiliaciones, Asociaciones y Renovaciones'))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(ALIANZAS))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(AFILIACIONES))

    const second = new ContainerBuilder()
      .setAccentColor(0xe02424)
      .addTextDisplayComponents(text(ASOCIACIONES))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(RENOVACIONES))

    for (const container of [first, second]) {
      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
    }

    await message.delete().catch(() => {})
  }
} satisfies PrefixCommand
