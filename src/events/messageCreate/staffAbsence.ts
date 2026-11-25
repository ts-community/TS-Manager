import type {Event} from '../../types/events'
import {ingestAbsence} from '../../services/staffAbsences'
export default {async execute(msg){await ingestAbsence(msg)}} satisfies Event<'messageCreate'>
