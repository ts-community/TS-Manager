import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  ContextMenuCommandInteraction,
  ContextMenuCommandBuilder,
  Client
} from 'discord.js'

export interface ButtonHandler {
  customId: string
  execute: (interaction: ButtonInteraction, client: Client) => Promise<void>
}

export interface ModalHandler {
  customId: string
  execute: (interaction: ModalSubmitInteraction, client: Client) => Promise<void>
}

export interface SelectMenuHandler {
  customId: string
  execute: (interaction: AnySelectMenuInteraction, client: Client) => Promise<void>
}

export interface ContextMenuHandler {
  data: ContextMenuCommandBuilder
  execute: (interaction: ContextMenuCommandInteraction, client: Client) => Promise<void>
}