import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { Client, PermissionFlagsBits } from 'discord.js'
import {
  PrefixCommandInstance,
  SlashCommandInstance,
  ContextMenuCommandInstance,
  CommandPermission
} from '../types/commands'
import { guildId } from '../config/env'
import logger from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const permissionFolders: CommandPermission[] = ['admin', 'staff', 'member']

type CommandType = 'prefix' | 'slash' | 'contextMenu'
interface LoadedCommand { fileName: string; command: any; permission: CommandPermission }
interface LoadError { file: string; reason: string }

export default async (client: Client): Promise<void> => {
  const prefix = await loadCommands('prefix')
  for (const { fileName, command, permission } of prefix) {
    const instance: PrefixCommandInstance = { ...command, name: fileName, permission }
    client.prefixCommands.set(fileName, instance)
    if (instance.aliases) {
      for (const alias of instance.aliases) client.prefixCommands.set(alias, instance)
    }
  }

  const slash = await loadCommands('slash')
  for (const { command, permission } of slash) {
    if (permission === 'admin') command.data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    client.slashCommands.set(command.data.name, { ...command, permission } as SlashCommandInstance)
  }

  const contextMenu = await loadCommands('contextMenu')
  for (const { command, permission } of contextMenu) {
    if (permission === 'admin') command.data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    client.contextMenuCommands.set(command.data.name, { ...command, permission } as ContextMenuCommandInstance)
  }

  client.once('clientReady', async () => {
    try {
      await deployApplicationCommands(client)
      logger.success('Application commands deployed')
    } catch (error) {
      logger.error('Command deployment failed', {
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
}

async function loadCommands(type: CommandType): Promise<LoadedCommand[]> {
  const baseDir = path.join(__dirname, `../commands/${type}`)
  if (!fs.existsSync(baseDir)) { logger.warn(`No ${type} commands found`); return [] }

  const results: LoadedCommand[] = []
  const errors: LoadError[] = []
  const folders = getFolders(baseDir).filter(f => permissionFolders.includes(f as CommandPermission))
  const total = folders.reduce((acc, f) => acc + getCommandFiles(path.join(baseDir, f)).length, 0)
  let loaded = 0

  for (const folder of folders) {
    const permission = folder as CommandPermission
    await Promise.all(getCommandFiles(path.join(baseDir, folder)).map(async file => {
      const fileName = file.replace(/\.(ts|js)$/, '')
      const filePath = `${type}/${folder}/${fileName}${path.extname(file)}`
      try {
        const { default: command } = await import(pathToFileURL(path.join(baseDir, folder, file)).href)
        const error = validate(command, type, fileName)
        if (error) { errors.push({ file: filePath, reason: error }); return }
        results.push({ fileName, command, permission })
        loaded++
      } catch (error) {
        errors.push({ file: filePath, reason: error instanceof Error ? error.message : 'Unknown error' })
      }
    }))
  }

  errors.forEach(({ file, reason }) => logger.warn(`Failed to load ${type} command`, { file, reason }))

  const label = total === 1 ? 'command' : 'commands'
  if (total === 0) logger.info(`No ${type} commands found`)
  else if (loaded === 0) logger.error(`0/${total} ${type} ${label} loaded`)
  else if (loaded === total) logger.success(`${loaded}/${total} ${type} ${label} loaded`)
  else logger.warn(`${loaded}/${total} ${type} ${label} loaded`)

  return results
}

function validate(command: any, type: CommandType, fileName: string): string | null {
  if (typeof command?.execute !== 'function') return 'Missing execute function'

  if (command.cooldown !== undefined) {
    if (typeof command.cooldown !== 'number') return 'Cooldown must be a number'
    if (command.cooldown <= 0) return 'Cooldown must be greater than 0'
  }

  if (type === 'prefix') {
    if (command.aliases !== undefined) {
      if (!Array.isArray(command.aliases) || command.aliases.length === 0) return 'Aliases must be a non-empty array'
      if (command.aliases.some((a: any) => typeof a !== 'string' || a.trim() === '')) return 'Aliases must be non-empty strings'
    }
  }

  if (type !== 'prefix') {
    if (!command.data) return 'Missing data builder'
    if (typeof command.data.setDefaultMemberPermissions !== 'function') return 'Data is not a valid discord.js builder'

    const normalize = (s: string) =>
      s.replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-\s]/g, '')
      .toLowerCase()

    if (
      (type === 'contextMenu'
        ? normalize(command.data.name) !== normalize(fileName)
        : command.data.name !== fileName)
    ) return 'Name mismatch with file'

    const json = command.data.toJSON()
    if (json.default_member_permissions !== null && json.default_member_permissions !== undefined) {
      return 'Manual permissions detected, use the folder structure instead'
    }
  }

  return null
}

function getFolders(dir: string): string[] {
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory())
}

function getCommandFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter(f => /\.(ts|js)$/.test(f))
}

async function deployApplicationCommands(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(guildId)
  const commands = [
    ...client.slashCommands.values(),
    ...client.contextMenuCommands.values()
  ].map(cmd => cmd.data.toJSON())
  await guild.commands.set(commands)
}