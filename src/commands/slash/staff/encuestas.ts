import {SlashCommandBuilder,type SlashCommandSubcommandBuilder} from 'discord.js'
import type {SlashCommand} from '../../../types/commands'
import {surveysInteraction} from '../../../services/surveyInteractions'
import {weekdays} from '../../../services/surveyBoard'
const day=(s:SlashCommandSubcommandBuilder)=>s.addIntegerOption(o=>o.setName('dia').setDescription('Día de la semana').setRequired(true).addChoices(...weekdays.map((name,i)=>({name,value:i+1}))))
const scope=(s:SlashCommandSubcommandBuilder)=>day(s).addStringOption(o=>o.setName('alcance').setDescription('Alcance del cambio').setRequired(true).addChoices({name:'Solo esta semana',value:'week'},{name:'Cambiar reparto semanal',value:'template'}))
export default {data:new SlashCommandBuilder().setName('encuestas').setDescription('Reparto semanal del equipo')
  .addSubcommand(s=>s.setName('mis-turnos').setDescription('Staff · consulta privada de tus turnos'))
  .addSubcommand(s=>s.setName('semana').setDescription('Staff · ver el reparto completo'))
  .addSubcommand(s=>day(s.setName('asignar').setDescription('Instructor · asignar un día y ordenar sus refuerzos')).addUserOption(o=>o.setName('titular').setDescription('Titular recurrente').setRequired(true)))
  .addSubcommand(s=>scope(s.setName('editar').setDescription('Instructor · editar el reparto')))
  .addSubcommand(s=>scope(s.setName('cancelar').setDescription('Instructor · cancelar un día'))),execute:surveysInteraction} satisfies SlashCommand
