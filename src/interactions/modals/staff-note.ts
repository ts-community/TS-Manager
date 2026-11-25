import {MessageFlags,type ModalSubmitInteraction} from 'discord.js'
import {staffApi} from '../../services/staffApi'
export default {async execute(i:ModalSubmitInteraction){
  await i.deferReply({flags:MessageFlags.Ephemeral})
  const member=i.customId.split(':')[1]
  await staffApi(i.user.id,'tracking/members/'+member+'/notes',{text:i.fields.getTextInputValue('text'),requestId:i.id})
  await i.editReply('Observación guardada. https://panel.tscomunity.es/seguimiento?miembro='+member)
}}
