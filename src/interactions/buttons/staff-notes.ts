import type {ButtonInteraction} from 'discord.js'
import {readNotes} from '../../services/staffNotes'
export default {async execute(i:ButtonInteraction){const [,id,...cursor]=i.customId.split(':');await readNotes(i,id,cursor.join(':'))}}
