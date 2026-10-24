import { ChannelType, type AnyThreadChannel, type Client, type Message } from 'discord.js'
import type { Event } from '../../types/events'
import Minijuego from '../../models/Minijuego'
import { mlParticipation } from '../../ml/index'

export const MINIJUEGOS_CHANNEL_ID = '1552390158081331419'

const MAX_TEXT_LENGTH = 300
/** Mensajes más cortos que esto, solos, no expresan intención: con el citado pueden decidir. */
const SHORT_MESSAGE_LENGTH = 30
const MAX_CONTEXT_LENGTH = 250

/**
 * Si el mensaje es corto y responde a otro usuario, se antepone el contenido citado:
 * así un "yo tmb" tras un "yo participo" sí se detecta como participación.
 */
async function withReplyContext(message: Message, content: string): Promise<string> {
  if (content.length > SHORT_MESSAGE_LENGTH) return content
  if (!message.reference?.messageId) return content

  const reference = await message.fetchReference().catch(() => null)
  if (!reference || reference.author.bot) return content

  const referenceText = reference.content.trim()
  if (!referenceText || referenceText.length > MAX_CONTEXT_LENGTH) return content

  return `${referenceText} ${content}`
}

/** Cache en memoria de participantes por hilo; se escribe y se lee a la vez en la DB. */
const participantsByThread = new Map<string, Set<string>>()
const loadedThreads = new Set<string>()

async function ensureThreadLoaded(threadId: string): Promise<void> {
  if (loadedThreads.has(threadId)) return
  loadedThreads.add(threadId)

  const doc = await Minijuego.findOne({ threadId }).lean()
  participantsByThread.set(threadId, new Set(doc?.participants ?? []))
}

async function addParticipant(threadId: string, userId: string): Promise<void> {
  participantsByThread.get(threadId)!.add(userId)
  await Minijuego
    .updateOne({ threadId }, { $addToSet: { participants: userId } }, { upsert: true })
    .catch(() => null)
}

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.author.bot) return
    if (!message.channel.isThread()) return
    const thread = message.channel as AnyThreadChannel
    if (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) return
    if (thread.parentId !== MINIJUEGOS_CHANNEL_ID) return

    await ensureThreadLoaded(thread.id)

    if (participantsByThread.get(thread.id)!.has(message.author.id)) return

    const content = message.content.trim()
    if (!content || content.length > MAX_TEXT_LENGTH) return

    const text = await withReplyContext(message, content)
    const { decision } = mlParticipation.predict(text)
    if (decision !== 'joining') return

    await addParticipant(thread.id, message.author.id)

    await message.reply({
      content: `✅ Quedas registrado para este minijuego (<#${thread.id}>), ¡mucha suerte!`
    }).catch(() => null)
  }
} satisfies Event<'messageCreate'>
