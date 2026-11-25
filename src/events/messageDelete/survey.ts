import type { Event } from '../../types/events'
import { staffChannels } from '../../config/staffChannels'
import { staffApi } from '../../services/staffApi'
import { nativePollsEnabled } from '../../services/surveyDelivery'
export default {async execute(message) {
  if(nativePollsEnabled() && message.guildId===staffChannels.guild && message.channelId===staffChannels.polls)
    await staffApi(null,'surveys/withdraw',{messageId:message.id})
}} satisfies Event<'messageDelete'>
