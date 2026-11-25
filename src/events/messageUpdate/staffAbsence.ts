import type {Event} from '../../types/events'
import {ingestAbsence} from '../../services/staffAbsences'
export default {async execute(_old, msg){await ingestAbsence(msg)}} satisfies Event<'messageUpdate'>
