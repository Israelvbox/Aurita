# Aurita

Reproductor de música minimalista para [Jellyfin](https://jellyfin.org), rápido y con enfoque mobile-first.  
Tres componentes que funcionan juntos o por separado:

| Componente | Plataforma | Tecnologías | Reproduce audio |
|---|---|---|---|
| [`aurita/`](./aurita) | Desktop (Linux, Windows, Web) | React, Electron, Web Audio API | Navegador / Electron |
| [`aurita-android/`](./aurita-android) | Android, Android Auto | Capacitor, React, ExoPlayer nativo (Media3) | ExoPlayer nativo |
| [`aurita-server/`](./aurita-server) | Servidor (Node.js) | Fastify, SQLite (FTS5) | No (solo API / caché) |

---

## ¿Qué hace cada uno?

### `aurita/` — Cliente de escritorio

App web + Electron para Linux y Windows. Se conecta directamente a Jellyfin.

- **Web Audio API** con crossfade, control de ganancia y fade-in al iniciar
- **Carga progresiva**: prioriza lo que ves, cachea el resto en SQLite local
- **Mix inteligente**: genera mixes semanales y recomendados desde tu historial
- **Atajos de teclado** globales y Media Session API
- **Persistencia de cola** en IndexedDB
- **Búsqueda rápida** con debounce
- **Modo oscuro / claro**
- **Soporte para servidores HTTP** en red local

### `aurita-android/` — Cliente Android

App Android nativa (Capacitor + React con plugins Kotlin). Misma lógica que el escritorio pero con motor de audio nativo.

**Motor de audio (ExoPlayer Media3):**
- Reproducción gapless, audio focus, Bluetooth A2DP
- **Android Auto** navegable (artistas, álbumes, playlists, géneros) vía `MediaLibraryService`
- Cola nativa con next/prev/shuffle/repeat gestionados desde ExoPlayer
- **Notificación persistente** con carátula y controles (anterior, play/pausa, siguiente)
- **Auto-resume Bluetooth**: al conectar el coche reanuda la última canción aunque la app esté cerrada
- **WakeLock**: evita que el dispositivo duerma durante la reproducción
- **Auto-reconexión**: cuando vuelve la red después de una pérdida, reintenta la reproducción automáticamente

**Descarga offline:**
- Descarga de canciones para reproducción sin conexión
- Progreso de descarga por track
- Almacenamiento en directorio privado de la app (`Android/data/com.aurita.app/files/Music/aurita_offline/`)
- Las canciones descargadas se reproducen desde el archivo local en lugar de streaming
- Gestión de descargas: listar, comprobar estado, eliminar

**Plugins nativos (Kotlin):**
| Archivo | Función |
|---|---|
| `AuritaMediaService.kt` | Servicio en primer plano con ExoPlayer + MediaLibraryService |
| `AuritaPlayerPlugin.kt` | Puente Capacitor ↔ ExoPlayer (play, pause, seek, cola, descargas) |
| `CarConnectionReceiver.kt` | Receptor Bluetooth para auto-resume |
| `MainActivity.java` | Registro del plugin en Capacitor |

**Permisos usados:**
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — reproducción en segundo plano
- `WAKE_LOCK` — evitar suspensión del dispositivo
- `POST_NOTIFICATIONS` — notificación de reproducción (Android 13+)
- `BLUETOOTH_CONNECT` — detección de conexión Bluetooth del coche
- `ACCESS_NETWORK_STATE` — monitorización de red para auto-reconexión

### `aurita-server/` — Intermediario de caché (opcional)

Servidor Node.js que se sienta entre los clientes y Jellyfin. **No es obligatorio** — los clientes pueden conectarse directamente a Jellyfin. Sirve para:

- **Búsqueda rápida**: SQLite + FTS5, tolerante a guiones y tildes
- **Caché de imágenes**: evita servir portadas desde Jellyfin en cada petición
- **Proxy de imágenes** con caché en disco
- **Sincronización periódica**: mantiene una copia local del catálogo (artistas, álbumes, pistas, géneros) con limpieza de huérfanos
- **Cifrado de tokens**: AES-256-GCM para los tokens de sesión de Jellyfin
- **Rate limiting**: 120 req/min por IP
- **Compresión Gzip** en todas las respuestas JSON

**Endpoints de la API:**

| Endpoint | Descripción |
|---|---|
| `POST /api/auth/login` | Login con usuario/contraseña |
| `GET /api/startup` | Comprobar conectividad |
| `GET /api/items/search?q=` | Búsqueda FTS5 |
| `GET /api/genres` | Listar géneros |
| `GET /api/artists` | Listar artistas |
| `GET /api/playlists` | Listar playlists |
| `GET /api/items/:type/:id` | Obtener elemento por tipo e ID |
| `GET /api/images/:id/:type` | Proxy de imágenes con caché |
| `GET /api/instantmix/:id` | Mix instantáneo para una canción |
| `GET /api/favorites` | Elementos favoritos |
| `GET /api/localindex` | Índice de búsqueda local |
| `GET /api/syncstatus` | Estado de sincronización |

---

## Arquitectura

### Sin intermediario (conexión directa)

```
[Jellyfin] ←── HTTPS ──→ [aurita / aurita-android]
```

Configuración mínima: solo la URL del servidor Jellyfin.

### Con intermediario

```
[Jellyfin] ←── LAN ──→ [aurita-server] ←── HTTPS ──→ [aurita / aurita-android]
```

El cliente se conecta a `aurita-server` en vez de a Jellyfin directamente.  
El servidor cachea y acelera búsquedas e imágenes. La autenticación y el streaming de audio siguen yendo directamente a Jellyfin.

### Flujo de reproducción (Android)

```
JavaScript (React) → Capacitor Plugin (Kotlin) → ExoPlayer (Media3)
                                                      │
                                               ┌──────┴──────┐
                                               │  Cache      │
                                               │  (SimpleCache│
                                               │   300 MB)   │
                                               └──────┬──────┘
                                                      │
                                          ┌───────────┴───────────┐
                                          │  Streaming (HTTP)     │
                                          │  o Local (file://)    │
                                          │  si está descargado   │
                                          └───────────────────────┘
```

### Flujo de descarga offline (Android)

```
JavaScript → downloadTrack(url, itemId)
                  │
          ExecutorService (hilo secundario)
                  │
          HttpURLConnection → GET url
                  │
          Escritura en archivo temporal (.tmp)
                  │
          Renombrar a {itemId}.mp3
                  │
          Notificar progreso (opcional)
                  │
          Resolver promesa con ruta del archivo
```

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18, React Router, Zustand |
| Desktop | Electron 31, Web Audio API |
| Android | Capacitor, ExoPlayer (Media3 1.4.1), Kotlin 1.9.24 |
| Servidor | Node.js, Fastify 5 |
| BBDD | SQLite (better-sqlite3), SQLite FTS5 |
| Estilos | CSS Grid / Flexbox, Lucide icons |
| Build | Vite, electron-builder, Gradle (AGP 8.2.1) |

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

Desde Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

La primera vez (o si borras `android/`) necesitas `npm run cap:add` para crearla.
Después, con `npm run cap:sync` basta.

### Servidor (opcional)

```bash
cd aurita-server
npm install
cp .env.example .env
# Editar .env con las URLs de Jellyfin
node server.js
```

O con instalación systemd:

```bash
sudo bash install.sh
```

---

## Notas importantes

- El `android/` se genera localmente con `cap:add` y **no viaja en el repositorio**.
  Si se borra, hay que regenerarlo (`npm run cap:add` o `bash scripts/install-native-plugin.sh`).
- Las canciones descargadas se almacenan en el directorio privado de la app
  (`Android/data/com.aurita.app/files/Music/aurita_offline/`). No son accesibles
  desde el explorador de archivos ni desde otras apps.
- Algunos fabricantes con gestión de batería agresiva (Xiaomi, Huawei) pueden
  matar el proceso pese al servicio en primer plano. Solución: desactivar la
  optimización de batería para Aurita en Ajustes → Batería.

---

## Licencia

MIT
