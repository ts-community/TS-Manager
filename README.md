# Discord.js Bot Template 🤖

> **⚠️ En Desarrollo (In Development)** - Esta plantilla se encuentra en desarrollo activo. Las características pueden cambiar y se están añadiendo mejoras continuamente.

Una plantilla profesional, moderna y altamente extensible para crear bots de Discord con Discord.js 14+. Diseñada con las mejores prácticas de desarrollo en TypeScript, esta plantilla ofrece una estructura robusta y escalable que acelera significativamente el desarrollo de bots complejos.

## ✨ Características Innovadoras

### 🏗️ Arquitectura Modular y Escalable
- **Sistema de carga dinámica** de comandos y eventos que permite agregar nuevas funcionalidades sin modificar el código central
- **Separación clara de responsabilidades** con carpetas dedicadas para cada tipo de comando
- **Sistema de tipos TypeScript exhaustivo** que previene errores en tiempo de compilación

### 🔐 Sistema de Permisos Avanzado
- **Control granular de permisos** con tres niveles predefinidos: `admin`, `staff` y `member`
- **Validación automática de permisos** para cada comando basado en roles y permisos de Discord
- **Aplicación de permisos dinámicos** en comandos slash y context menus

### 📡 Soporte Completo para Tipos de Comandos
- **Comandos Prefix**: Comandos tradicionales con prefijo personalizable
- **Slash Commands**: Comandos modernos integrados en Discord con autocompletado y validación
- **Context Menu Commands**: Comandos accesibles mediante menú contextual en usuarios y mensajes
- **Aliases para Prefix Commands**: Permite crear atajos para comandos

### 🎯 Sistema de Validación Automática
- **Validación exhaustiva de comandos** en tiempo de carga
- **Detección de errores temprana** que previene fallos en runtime
- **Reportes detallados** de comandos cargados vs. comandos con errores
- **Validación de cooldowns** para prevenir abuso```

### Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
TOKEN=tu_token_de_bot_aqui
MONGO_URL=mongodb+srv://usuario:contraseña@cluster.mongodb.net/dbname
GUILD_ID=123456789
PREFIX=!
```

### Correr en Desarrollo

```bash
pnpm dev
```

El bot se reiniciará automáticamente cuando hagas cambios en el código (hot-reload).

### Compilar para Producción

```bash
pnpm build
```

### Ejecutar en Producción

```bash
pnpm start
```

El arranque usa PM2 con [`ecosystem.config.cjs`](ecosystem.config.cjs), así que el proceso queda administrado por PM2 desde el inicio.

Si quieres levantarlo manualmente con PM2:

```bash
pnpm build
pnpm start
```

---

## 📚 Guía de Uso

### 🚀 Usar Code Snippets

La plantilla incluye **snippets de VSCode** predefinidos en `.vscode/bot.code-snippets` para agilizar la creación de comandos e interacciones. Los snippets disponibles son:

#### 📖 Cómo Usar Snippets

1. Crea un nuevo archivo TypeScript en la carpeta correspondiente
2. Empieza a escribir el nombre del snippet (ej: `slashCommand`)
3. Presiona `Tab` o `Enter` para generar automáticamente la estructura
4. Completa los campos marcados con `$1`, `$2`, etc.

**Ejemplo:**
```bash
# Crear un nuevo slash command
# Archivo: src/commands/slash/member/mi-comando.ts

# Escribe: slashCommand
# Presiona: Tab
# Se genera automáticamente la estructura completa
```

#### Snippets Disponibles

**Comandos Prefix**
- **`prefixCommand`**: Estructura básica de comando prefix
  - Incluye: aliases, descripción, ejecutor
- **`prefixSubCommand`**: Comando prefix con subcomandos
  - Incluye: lógica de subcomandos automática

**Comandos Slash** 
- **`slashCommand`**: Estructura básica de slash command
  - Incluye: SlashCommandBuilder, execute
- **`slashSubCommand`**: Slash command con subcomandos
  - Incluye: opciones de subcomandos predefinidas

**Comandos Context Menu**
- **`contextMenuCommand`**: Context menu para usuarios o mensajes
  - Incluye: soporte para User/Message automático

**Event Handlers**
- **`event`**: Estructura básica de event listener
  - Incluye: tipado automático del evento

**Interacciones**
- **`buttonHandler`**: Manejador de botones
- **`modalHandler`**: Manejador de modales con inputs
- **`stringSelectHandler`**: Select menu de texto
- **`userSelectHandler`**: Select menu de usuarios (con fetch)
- **`roleSelectHandler`**: Select menu de roles
- **`mentionableSelectHandler`**: Select menu de @mencionables
- **`channelSelectHandler`**: Select menu de canales

---

### 🎛️ Opciones de Comandos

Todos los comandos en esta plantilla soportan opciones configurables que te permiten personalizar su comportamiento. Estas opciones se pasan como parte del objeto exportado.

#### 🔑 Opciones Base (Disponibles en todos los tipos)

```typescript
export default {
  // 📂 Categoría del comando - para organizar y clasificar
  // Personaliza las categorías en src/types/commands.ts
  category?: 'general' | 'moderation' | 'fun' | 'utility',
  
  // ⏱️ Cooldown en segundos - previene spam y abuso
  // Si un usuario ejecuta el comando, debe esperar X segundos antes de usarlo de nuevo
  cooldown?: 5,
  
  // ... resto de opciones específicas del tipo
} satisfies SlashCommand | PrefixCommand | ContextMenuCommand
```

#### 📨 Opciones de Prefix Commands

```typescript
import type { PrefixCommand } from '@/types/commands'

export default {
  // 📛 Aliases - nombres alternativos para invocar el comando
  // El usuario puede escribir !ping, !p, !pong para ejecutar el mismo comando
  aliases: ['p', 'pong'],
  
  // 📝 Descripción del comando - se muestra en el help
  description: 'Responde con pong',
  
  // 📂 Categoría (opcional)
  category: 'general',
  
  // ⏱️ Cooldown en segundos (opcional)
  cooldown: 5,
  
  async execute(message, args, client) {
    const latency = client.ws.ping
    await message.reply(`🏓 Pong! **${latency}ms**`)
  }
} satisfies PrefixCommand
```

#### ⚡ Opciones de Slash Commands

```typescript
import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '@/types/commands'

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde con pong')
    // Discord.js ofrece muchas más opciones:
    // .setDMPermission(false)           // Solo en servidores
    // .addStringOption(...)              // Opciones de usuario
    // .addUserOption(...)                // Menciones de usuario
    // etc...
    ,
  
  // 📂 Categoría (opcional)
  category: 'general',
  
  // ⏱️ Cooldown en segundos - previene spam
  cooldown: 3,
  
  async execute(interaction, client) {
    const latency = client.ws.ping
    await interaction.reply({
      content: `🏓 Pong! **${latency}ms**`,
      ephemeral: true // Solo visible para quien ejecutó el comando
    })
  }
} satisfies SlashCommand
```

#### 🎯 Opciones de Context Menu Commands

```typescript
import { ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js'
import type { ContextMenuCommand } from '@/types/commands'

export default {
  data: new ContextMenuCommandBuilder()
    .setName('User Info')
    .setType(ApplicationCommandType.User), // User o Message
  
  // 📂 Categoría (opcional)
  category: 'utility',
  
  // ⏱️ Cooldown en segundos - previene spam
  cooldown: 3,
  
  async execute(interaction, client) {
    const user = await client.users.fetch(interaction.targetId)
    await interaction.reply({
      content: `👤 Usuario: ${user.username}#${user.discriminator}`,
      ephemeral: true
    })
  }
} satisfies ContextMenuCommand
```

#### 💡 Guía de Opciones

| Opción | Tipo | Descripción | Ejemplo |
|--------|------|-------------|---------|
| `category` | string | Categoría para organizar comandos | `'moderation'` |
| `cooldown` | number | Segundos de espera entre usos | `5` |
| `aliases` | string[] | Nombres alternativos (prefix solo) | `['p', 'ping']` |
| `description` | string | Descripción breve (prefix solo) | `'Comando de ping'` |

#### 🔄 Cómo Funcionan los Cooldowns

El sistema de cooldown previene que los usuarios ejecuten comandos repetidamente. Es por usuario, no global:

```typescript
export default {
  cooldown: 10, // 10 segundos
  
  async execute(interaction) {
    // Usuario A ejecuta el comando
    // Debe esperar 10 segundos antes de ejecutarlo de nuevo
    // Pero Usuario B puede ejecutarlo inmediatamente
    await interaction.reply('Comando ejecutado')
  }
} satisfies SlashCommand
```

---

### ⏲️ Sistema de Intervals

El sistema de intervals permite ejecutar tareas recurrentes de forma segura y confiable. Se configura en `src/events/clientReady/intervals.ts`:

```typescript
import type { Event } from '@/types/events'
import { runInterval } from '@/utils/interval'

export default {
  once: true,
  
  async execute(client) {
    runInterval(
      [
        // Array de funciones a ejecutar en paralelo
        async () => {
          // Tarea 1: Actualizar estado del bot cada 15 minutos
          await client.user?.setActivity('con usuarios', { type: 2 })
        },
        async () => {
          // Tarea 2: Verificar conexión a BD cada 15 minutos
          console.log('Verificando conexión...')
        },
        () => {
          // Tarea 3: Limpiar caché cada 15 minutos
          console.log('Limpiando caché...')
        }
      ],
      1000 * 60 * 15 // Intervalo: 15 minutos en milisegundos
    )
  }
} satisfies Event<'clientReady'>
```

**Características del sistema de intervals:**

- ✅ **Ejecución paralela**: Todas las tareas se ejecutan simultáneamente con `Promise.allSettled`
- ✅ **Manejo de errores**: Si una tarea falla, las otras continúan ejecutándose
- ✅ **Logging automático**: Los errores se registran automáticamente en el logger
- ✅ **Re-ejecución automática**: Las tareas se ejecutan nuevamente después del intervalo especificado
- ✅ **Sin bloqueo**: Las tareas no interfieren con el resto del bot

**Ejemplos de uso común:**

```typescript
// Actualizar status cada hora
runInterval([
  async () => {
    const userCount = client.users.cache.size
    await client.user?.setActivity(`${userCount} usuarios`, { type: 0 })
  }
], 1000 * 60 * 60) // 1 hora

// Backup de datos cada 6 horas
runInterval([
  async () => {
    // Realizar backup de base de datos
    console.log('Backup realizado')
  }
], 1000 * 60 * 60 * 6) // 6 horas

// Tareas múltiples cada 30 minutos
runInterval([
  async () => { /* Tarea 1 */ },
  async () => { /* Tarea 2 */ },
  () => { /* Tarea 3 */ }
], 1000 * 60 * 30) // 30 minutos
```

**Tiempos comunes (en milisegundos):**
- `1000` = 1 segundo
- `1000 * 60` = 1 minuto
- `1000 * 60 * 5` = 5 minutos
- `1000 * 60 * 15` = 15 minutos
- `1000 * 60 * 60` = 1 hora
- `1000 * 60 * 60 * 6` = 6 horas
- `1000 * 60 * 60 * 24` = 1 día

---

## 🔧 Configuración Avanzada

### 🔐 Sistema de Permisos

Los comandos se organizan automáticamente por nivel de permiso:

```
commands/
├── admin/        # Solo administradores
├── staff/        # Staff y administradores
└── member/       # Todos los miembros
```

El sistema valida automáticamente los permisos al ejecutar comandos. Los comandos en la carpeta `admin/` requieren permisos de administrador, mientras que los de `staff/` requieren ser staff o admin.

**Nota**: Los permisos se aplican automáticamente a slash commands y context menus. Para prefix commands, la validación depende de tu lógica personalizada.

### 📂 Agregar Nuevas Categorías de Comandos

Las categorías se definen en `src/types/commands.ts` y sirven para organizar y clasificar los comandos:

```typescript
export type CommandCategory = 'general' | 'moderation' | 'fun' | 'utility' | 'admin'
```

Luego úsalas en tus comandos:

```typescript
export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario'),
  
  category: 'moderation', // Nueva categoría
  cooldown: 3,
  
  async execute(interaction) {
    // ...
  }
} satisfies SlashCommand
```

### 🧩 Crear Servicios Personalizados

Usa la carpeta `src/services/` para centralizar lógica reutilizable y mantener comandos limpios:

```typescript
// src/services/userService.ts
export const getUserInfo = async (userId: string) => {
  // Lógica de obtención de información
  return userInfo
}

export const banUser = async (userId: string, reason: string) => {
  // Lógica de ban
  return success
}
```

Luego úsalo en tus comandos:

```typescript
import { banUser } from '@/services/userService'

export default {
  // ... configuración
  async execute(interaction) {
    await banUser(interaction.targetId, 'Spam')
  }
} satisfies ContextMenuCommand
```

### 🔧 Extender el Cliente

Los tipos personalizados en `src/types/client.d.ts` permiten agregar propiedades al cliente de Discord:

```typescript
declare module 'discord.js' {
  interface Client {
    prefixCommands: Collection<string, PrefixCommandInstance>
    slashCommands: Collection<string, SlashCommandInstance>
    contextMenuCommands: Collection<string, ContextMenuCommandInstance>
    // Agrega tus propias propiedades aquí
    myCustomProperty?: string
    databaseCache?: Map<string, any>
  }
}
```

Luego úsalas en cualquier parte del bot:

```typescript
// En un comando
client.databaseCache?.set('key', value)

// En un evento
const cachedData = client.databaseCache?.get('key')
```

### ⏰ Controlar Cooldowns

El sistema de cooldown previene que los usuarios spammen comandos. Define el cooldown en segundos:

```typescript
export default {
  data: new SlashCommandBuilder()
    .setName('slowcommand')
    .setDescription('Comando que se puede usar cada 10 segundos'),
  
  cooldown: 10, // 10 segundos entre ejecuciones por usuario
  
  async execute(interaction) {
    // Este comando solo se puede ejecutar 1 vez cada 10 segundos por usuario
    await interaction.reply('Se ejecutó exitosamente')
  }
} satisfies SlashCommand
```

**Nota**: El cooldown se aplica por usuario, no es global. Esto significa que si el usuario A ejecuta el comando, debe esperar el cooldown especificado. El usuario B puede ejecutarlo inmediatamente.

---

## 📊 Características Técnicas

| Característica | Descripción |
|---|---|
| ✅ TypeScript Strict Mode | Tipado completo y seguro |
| ✅ ESM Modules | Usando import/export modernos |
| ✅ Source Maps | Fácil debugging en producción |
| ✅ Path Aliases | Imports limpios y organizados |
| ✅ Validación en Carga | Previene errores silenciosos |
| ✅ Logging Centralizado | Todas las salidas organizadas |
| ✅ Hot Reload en Dev | Reinicia automáticamente |
| ✅ MongoDB Integration | Persistencia de datos lista |
| ✅ Permission-based System | Control granular de acceso |
| ✅ Global Error Handlers | Captura de errores global |

---

## 📁 Estructura del Proyecto

```
discord.js-bots-template/
├── src/
│   ├── commands/              # Todos los comandos
│   │   ├── prefix/            # Comandos con prefijo
│   │   │   ├── admin/
│   │   │   ├── staff/
│   │   │   └── member/
│   │   ├── slash/             # Slash commands
│   │   │   ├── admin/
│   │   │   ├── staff/
│   │   │   └── member/
│   │   └── contextMenu/        # Context menu commands
│   │       ├── admin/
│   │       ├── staff/
│   │       └── member/
│   ├── events/                # Event listeners
│   │   ├── clientReady/        # Al iniciar el bot
│   │   ├── interactionCreate/  # Interacciones
│   │   └── messageCreate/      # Mensajes
│   ├── handlers/              # Cargadores dinámicos
│   │   ├── commands.ts        # Cargador de comandos
│   │   └── events.ts          # Cargador de eventos
│   ├── interactions/          # Componentes interactivos
│   │   ├── buttons/
│   │   ├── contextMenus/
│   │   ├── modals/
│   │   └── selectMenus/
│   ├── models/                # Modelos de Mongoose
│   │   └── Guild.ts
│   ├── services/              # Lógica de negocio
│   │   ├── guild.ts
│   │   └── permissions.ts
│   ├── config/                # Configuración
│   │   └── env.ts
│   ├── types/                 # Definiciones TypeScript
│   │   ├── client.d.ts
│   │   ├── commands.ts
│   │   ├── events.ts
│   │   └── interactions.ts
│   ├── utils/                 # Utilidades
│   │   ├── interval.ts
│   │   └── logger.ts
│   └── index.ts               # Punto de entrada
├── dist/                      # Build compilado (generado)
├── .env                       # Variables de entorno
├── .env.example               # Plantilla de variables
├── package.json               # Dependencias
├── tsconfig.json              # Configuración TypeScript
├── tsup.config.ts             # Configuración de compilación
└── README.md                  # Este archivo
```

---

## 🎯 Casos de Uso Recomendados

Esta plantilla es ideal para:

- ✅ Bots de servidor comunitarios
- ✅ Bots administrativos y moderación
- ✅ Bots de utilidad y diversión
- ✅ Bots con base de datos persistente
- ✅ Proyectos de mediano a gran tamaño
- ✅ Equipos que necesitan un código mantenible

---

## 🐛 Troubleshooting

### El bot no se conecta
- Verifica que el TOKEN sea correcto
- Comprueba que el bot tiene permisos en el servidor
- Asegúrate de que GUILD_ID sea el correcto

### Los comandos no aparecen
- Ejecuta primero `pnpm build` en producción
- Verifica que los archivos de comando están en la carpeta correcta
- Revisa los logs para errores de carga

### Errores de TypeScript
- Ejecuta `npm install` o `pnpm install` para actualizar tipos
- Verifica que los tipos satisfacen la interfaz correcta

### MongoDB no conecta
- Verifica que MONGO_URL es correcto
- Comprueba credenciales y IP whitelist
- Asegúrate de tener conexión a internet

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama para tu característica (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.

---

## 💬 Soporte

Si encuentras problemas o tienes preguntas:

- 📖 Consulta la [documentación de Discord.js](https://discord.js.org)
- 🔍 Abre un [issue](../../issues)
- 💬 Participa en [discussions](../../discussions)

---

## 🙌 Agradecimientos

Esta plantilla fue creada con amor para desarrolladores de bots de Discord que buscan una base sólida y profesional para sus proyectos.

---

**Made with ❤️ for Discord Bot Developers**

> **Nota de Desarrollo**: Esta plantilla está en desarrollo activo. Se esperan cambios y mejoras continuas. Las contribuciones y feedback son más que bienvenidos.
