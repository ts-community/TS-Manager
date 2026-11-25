import {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,type ChatInputCommandInteraction,type ButtonInteraction} from 'discord.js'
import {staffApi} from './staffApi'
export async function readNotes(i:ChatInputCommandInteraction|ButtonInteraction,member:string,cursor=''){
  await i.deferReply({flags:MessageFlags.Ephemeral})
  const page=await staffApi<{items:{actor:string;at:string;text:string}[];next?:string}>(i.user.id,'tracking/members/'+member+'/notes?limit=2&cursor='+encodeURIComponent(cursor))
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir ficha').setURL('https://panel.tscomunity.es/seguimiento?miembro='+member))
  if(page.next)row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Anteriores').setCustomId('staff-notes:'+member+':'+page.next))
  await i.editReply({content:page.items.map(n=>n.actor+' · <t:'+Math.floor(Date.parse(n.at)/1000)+':f>\n'+n.text).join('\n\n')||'Sin observaciones compartidas.',components:[row],allowedMentions:{parse:[]}})
}
