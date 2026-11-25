import type {Event} from '../../types/events'
import {deletedAbsence} from '../../services/staffAbsences'
export default {async execute(msg){await deletedAbsence(msg)}} satisfies Event<'messageDelete'>
