import type { Client, ClientEvents } from 'discord.js'

export interface Event<K extends keyof ClientEvents> {
  once?: boolean
  execute: (...args: [...ClientEvents[K], Client]) => Promise<void> | void
}