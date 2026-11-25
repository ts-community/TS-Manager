import type {Event} from '../../types/events'
import {retireSource} from '../../services/staffSignals'
export default {async execute(message){await retireSource(message)}} satisfies Event<'messageDelete'>
