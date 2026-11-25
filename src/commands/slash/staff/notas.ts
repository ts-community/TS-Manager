import {SlashCommandBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder,MessageFlags} from 'discord.js'
import type {SlashCommand} from '../../../types/commands'
import {staffRank} from '../../../services/permissions'
import {readNotes} from '../../../services/staffNotes'
export default {data:new SlashCommandBuilder().setName('notas').setDescription('Observaciones compartidas del equipo')
  .addSubcommand(s=>s.setName('añadir').setDescription('Instructor · escribir una observación compartida').addUserOption(o=>o.setName('miembro').setDescription('Miembro del equipo').setRequired(true)))
  .addSubcommand(s=>s.setName('ver').setDescription('Staff · consultar el historial de un miembro').addUserOption(o=>o.setName('miembro').setDescription('Sin miembro se muestran tus notas'))),
  async execute(i){
    const user=i.options.getUser('miembro')||i.user
    if(i.options.getSubcommand()==='ver')return readNotes(i,user.id)
    if(!(await staffRank(i)).instructor)return i.reply({content:'Se requiere Instructor o superior.',flags:MessageFlags.Ephemeral})
    const field=new TextInputBuilder().setCustomId('text').setLabel('Observación · Visible para todo el staff de TS').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600)
    return i.showModal(new ModalBuilder().setTitle(('Observación · '+user.username).slice(0,45)).setCustomId('staff-note:'+user.id).addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)))
  }} satisfies SlashCommand
