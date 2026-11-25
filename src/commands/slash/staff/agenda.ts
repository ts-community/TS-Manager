import {SlashCommandBuilder,MessageFlags} from 'discord.js'
import type {SlashCommand} from '../../../types/commands'
import {staffApi} from '../../../services/staffApi'
export default {data:new SlashCommandBuilder().setName('agenda').setDescription('Staff · consulta tus próximos plazos y tareas en privado'),
  async execute(i){await i.deferReply({flags:MessageFlags.Ephemeral})
    const {agenda}=await staffApi<{agenda:{title:string;due:string;href:string}[]}>(i.user.id,'home')
    const rows=agenda.slice(0,8).map(t=>t.title+' · <t:'+Math.floor(Date.parse(t.due)/1000)+':R> · <'+(t.href.startsWith('https://')?t.href:'https://panel.tscomunity.es'+t.href)+'>')
    await i.editReply({content:rows.join('\n').slice(0,1950)||'Estás al día',allowedMentions:{parse:[]}})
  }} satisfies SlashCommand
