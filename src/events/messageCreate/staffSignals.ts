import type {Event} from '../../types/events'
import {captureSignal} from '../../services/staffSignals'
export default {async execute(message){await captureSignal(message)}} satisfies Event<'messageCreate'>
