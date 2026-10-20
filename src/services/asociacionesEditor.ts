import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type ContainerBuilder as Container
} from 'discord.js'
import { EMOJI, unix } from './asociaciones'
import { asocId, type AsociacionLike } from './asociacionesPanel'

// Menú de edición (V2) con el detalle actual + selección de campo
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

  return { flags: MessageFlags.IsComponentsV2, components: [container as Container] }
}

// Mensaje público de confirmación previa a eliminar una asociación (embed rojo)
export function buildRemoveConfirmPayload(a: AsociacionLike): { embeds: unknown[], components: ActionRowBuilder<ButtonBuilder>[] } {
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
