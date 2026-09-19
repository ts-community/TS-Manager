# TS-Manager 🤖

Bot oficial de la comunidad de Brawl Stars, **TS Community Brawl**. Gestión de clubes, contratación de servicios con tickets por fases, starboard, postulaciones y utilidades de moderación.

> Hecho a partir de la plantilla [discord.js-bots-template](https://github.com/discord.js-bots-template), creada por el owner de la comunidad, tumonulo.

## ✨ Funcionalidades

### 🏆 Clubes de Brawl Stars
- `/clubes` – alta, baja y edición de clubes con tag y país (top local).
- Panel de clubes autoactualizado (trofeos, miembros, tops) y plantilla de promoción.

### 🎫 Servicios y tickets
- Panel de servicios (bots y webs) con catálogo, términos y preguntas frecuentes.
- Tickets `servicios-N` con fases: Solicitado (sin compromiso) → En curso → En revisión → Entregado → Cerrado.
- Formulario previo del cliente, condiciones acordadas por el staff, transcripción `.txt` al hilo y por MD, y valoraciones guardadas.
- Comandos: `/ticket ver|fijar|cerrar`, `/tickets cerrar`, `/valoraciones` (solo administradores).

### ⭐ Starboard
- Los mensajes con ⭐ suficientes se publican en el canal destacado. Umbral configurable con `/starboard`.

### 📝 Postulaciones y equipo
- Revisión de postulaciones con botones de aceptar/rechazar.
- Sticky de buscar equipo y rol automático por etiqueta del servidor.

### 🛡️ Moderación
- `/staff`, `/purgechannel` y comando `revivirchat`.

## 🚀 Desarrollo

```bash
pnpm install
pnpm dev    # desarrollo con hot-reload
pnpm build  # compilar y verificar tipos
```

Copia `.env.example` a `.env` y rellena los valores. Los tokens e IDs de este repositorio son privados de TS Community: este código se publica como referencia, el despliegue en producción es interno.

Utilidad: `pnpm exec tsx scripts/clear-tickets.ts` vacía tickets y valoraciones (la numeración vuelve a `servicios-1`). Script de un solo uso: eliminarlo después.

## 📁 Estructura

```
src/
├── commands/slash/admin/   # clubes, ticket, tickets, valoraciones, starboard, staff, purgechannel
├── commands/slash/member/  # ping
├── commands/prefix/        # revivirchat, ping
├── events/                 # clientReady, interacciones, reacciones, mensajes
├── interactions/           # botones, modals y selects (fases, briefing, valoración, cierre)
├── models/                 # Guild, Ticket, Review
├── services/               # services (panel), tickets (flujo), clubs, starboard, guild…
├── config/                 # env, países
└── index.ts
```

## 📝 Licencia

MIT. Ver `LICENSE`.
