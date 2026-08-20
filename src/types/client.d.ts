import { Collection } from 'discord.js'
import type {
  PrefixCommandInstance,
  SlashCommandInstance,
  ContextMenuCommandInstance
} from './commands'

declare module 'discord.js' {
  interface Client {
    prefixCommands: Collection<string, PrefixCommandInstance>
    slashCommands: Collection<string, SlashCommandInstance>
    contextMenuCommands: Collection<string, ContextMenuCommandInstance>
  }
}