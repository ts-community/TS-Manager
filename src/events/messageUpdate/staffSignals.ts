import type {Event} from '../../types/events'
import {updateSource} from '../../services/staffSignals'
export default {async execute(_old, message){await updateSource(message)}} satisfies Event<'messageUpdate'>
