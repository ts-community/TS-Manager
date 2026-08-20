import type {
  Client,
  Message,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ContextMenuCommandBuilder
} from 'discord.js'

export type CommandPermission = 'admin' | 'staff' | 'member'
export type CommandCategory = 'general' // Here you can add more categories like 'moderation', 'fun', etc.

export interface BaseCommand {
  category?: CommandCategory
  cooldown?: number
}

export interface PrefixCommand extends BaseCommand {
  aliases?: string[]
  description?: string
  execute: (message: Message, args: string[], client: Client) => Promise<unknown>
}

export interface PrefixCommandInstance extends PrefixCommand {
  name: string
  permission: CommandPermission
}

export type AnySlashCommandBuilder =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder

export interface SlashCommand extends BaseCommand {
  data: AnySlashCommandBuilder
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<unknown>
}

export interface SlashCommandInstance extends SlashCommand {
  permission: CommandPermission
}

export interface ContextMenuCommand extends BaseCommand {
  data: ContextMenuCommandBuilder
  execute: (interaction: ContextMenuCommandInteraction, client: Client) => Promise<unknown>
}

export interface ContextMenuCommandInstance extends ContextMenuCommand {
  permission: CommandPermission
}