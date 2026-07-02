# Aurita

Reproductor de música minimalista para Jellyfin, rápido y con enfoque mobile-first.  
Tres componentes que pueden usarse juntos o por separado:

| Componente | Plataforma | Tecnologías | Reproduce audio |
|---|---|---|---|
| [`aurita/`](./aurita) | Desktop (Linux, Windows, Web) | React, Electron, Web Audio API | Navegador/Electron |
| [`aurita-android/`](./aurita-android) | Android, Android Auto | Capacitor, React, ExoPlayer (nativo) | ExoPlayer nativo |
| [`aurita-server/`](./aurita-server) | Servidor (Node.js) | Fastify, SQLite (FTS5) | No (solo API/caché) |

---

## ¿Qué hace cada uno?

### `aurita/` — Cliente de escritorio

App web + Electron para Linux y Windows. Se conecta directamente a Jellyfin.

- **Web Audio API** con crossfade, control de ganancia y fade-in al iniciar
- **Carga progresiva**: prioriza lo que ves, cachea el resto en SQLite local
- **Mix inteligente**: genera mixes semanales y recomendados desde tu historial
- **Atajos de teclado** globales y Media Session API
- **Persistencia de cola** en IndexedDB

### `aurita-android/` — Cliente Android

App Android nativa (Capacitor + React con plugins Kotlin). Misma lógica que el escritorio pero con motor de audio nativo.

- **ExoPlayer** para reproducción gapless, audio focus, Bluetooth
- **Android Auto** navegable (artistas, álbumes, playlists, géneros) vía `MediaLibraryService`
- **Auto-resume Bluetooth**: al conectar el coche, reanuda la última canción aunque la app esté cerrada
- **Cola nativa**: next/prev/shuffle/repeat gestionados desde ExoPlayer
- **Caché de imágenes** en IndexedDB con TTL de 7 días

### `aurita-server/` — Intermediario de caché (opcional)

Servidor Node.js que se sienta entre los clientes y Jellyfin. **No es obligatorio** — los clientes pueden conectarse directamente a Jellyfin. Sirve para:

- **Búsqueda rápida**: SQLite + FTS5, tolerante a guiones y tildes
- **Caché de imágenes**: evita servir portadas desde Jellyfin en cada petición
- **Sincronización periódica**: mantiene una copia local del catálogo (artistas, álbumes, pistas, géneros)
- **Cifrado de tokens**: AES-256-GCM para los tokens de sesión de Jellyfin
- **Rate limiting**: 120 req/min por IP

---

## Arquitectura

### Sin intermediario (conexión directa)

```
[Jellyfin] ←── HTTPS ──→ [aurita/aurita-android]
```

Configuración mínima: solo la URL del servidor Jellyfin.

### Con intermediario

```
[Jellyfin] ←── LAN ──→ [aurita-server] ←── HTTPS ──→ [aurita/aurita-android]
```

El cliente se conecta a `aurita-server` en vez de a Jellyfin directamente.  
El servidor cachea y acelera búsquedas e imágenes. La autenticación y el streaming de audio siguen yendo directamente a Jellyfin.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18, React Router, Zustand |
| Desktop | Electron 31, Web Audio API |
| Android | Capacitor, ExoPlayer (Media3), Kotlin |
| Servidor | Node.js, Fastify 5 |
| BBDD | SQLite (better-sqlite3), SQLite FTS5 |
| Estilos | CSS Grid/Flexbox, Lucide icons |
| Build | Vite, electron-builder |

---

## Inicio rápido

### Desktop

```bash
cd aurita
npm install
npm run dev          # Solo web (navegador)
npm run electron:dev # Con ventana Electron
```

### Android

```bash
cd aurita-android
npm install
npm run build
npm run cap:sync
npm run cap:open     # Abre Android Studio
```

### Servidor (opcional)

```bash
cd aurita-server
npm install
cp .env.example .env
# Editar .env con las URLs de Jellyfin
node server.js
```

---

## Licencia

MIT
