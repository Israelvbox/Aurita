# Aurita

Reproductor de música minimalista para Jellyfin. Enfoque web, empaquetado con
Electron para Linux y Windows (Android pendiente vía Capacitor — ver abajo).

## Filosofía del proyecto

La mayoría de clientes de Jellyfin (Finamp, Feishin, etc.) cargan toda la
biblioteca al abrir la app: artistas, álbumes, playlists, todo de golpe.
Aurita hace lo contrario:

1. **Al abrir la app** solo se piden las 4 playlists más recientes y los
   datos mínimos para pintar el Home. Eso es lo "crítico".
2. **En segundo plano** (usando `requestIdleCallback`), sin bloquear la UI,
   se van calculando los mixes de la semana y precargando géneros/artistas.
3. **Bajo demanda**: biblioteca, búsqueda, etc. piden datos solo cuando el
   usuario entra a esa sección, y se cachean en SQLite local para no repetir
   peticiones.

Esto vive en `src/api/priorityQueue.js`: una cola con dos niveles,
`critical` (inmediato) y `background` (idle time, cancelable).

## Estructura

```
electron/
  main.js       proceso principal: ventana, IPC, SQLite
  db.js         esquema SQLite (cache, historial, credenciales)
  preload.js    puente seguro hacia el renderer (contextIsolation)
src/
  api/
    jellyfin.js       cliente de la API de Jellyfin (auth, items, playlists...)
    priorityQueue.js  cola critical/background para la carga progresiva
  db/
    storage.js        abstracción: SQLite en Electron, IndexedDB en web/Android
  store/
    authStore.js      sesión (zustand)
    playerStore.js     reproductor de audio
    mixEngine.js       genera los mixes de la semana y recomendados
  pages/
    Login.jsx, Home.jsx, Search.jsx, Library.jsx
  components/
    Layout.jsx, Row.jsx, PlayerBar.jsx
```

## Mixes inteligentes — cómo funcionan

Jellyfin no genera mixes por sí solo, así que Aurita lleva su propio
historial de escucha en SQLite (`listen_history`: item, artista, géneros,
fecha). Con eso:

- **Mix de la semana**: agrupa por género más escuchado en los últimos 7
  días. Cada mix mezcla ~60% canciones que ya escuchaste de ese género y
  ~40% canciones del mismo género que no has escuchado (vía
  `/Users/{id}/Items?Genres=X`), para que se sienta como "lo tuyo + algo
  nuevo parecido".
- **Recomendados**: mira géneros que escuchaste algo pero no tanto en los
  últimos 30 días, para fomentar descubrimiento real en vez de repetir
  siempre lo mismo.

Esto es un punto de partida razonable con los datos que expone la API
estándar de Jellyfin. Si más adelante quieres similitud más fina (audio
features, etc.), habría que sumar un servicio externo (Last.fm,
ListenBrainz) — no lo metí ahora para no complicar el primer MVP.

## Playlists privadas

`jellyfin.createPlaylist()` crea la playlist asociada solo a tu `UserId` y
sin añadir usuarios a la lista de compartidos — por defecto en Jellyfin esto
la deja privada (no aparece para el resto del servidor). Si tu versión de
Jellyfin maneja esto distinto (algunas tienen un flag explícito de
`OpenAccess` vía `/Playlists/{id}/Users`), revisa esa parte del endpoint con
tu versión concreta y dime la respuesta para ajustar el código si hace falta.

## Cómo correrlo

```bash
npm install

# Desarrollo (web, sin Electron, para iterar rápido en el navegador)
npm run dev

# Desarrollo con Electron (ventana de escritorio real)
npm run electron:dev

# Build de producción + empaquetado Electron (AppImage / NSIS)
npm run electron:build
```

Al abrir la app por primera vez te pedirá la URL del servidor Jellyfin,
usuario y contraseña. Esto se guarda cifrado (vía `safeStorage` de Electron)
en SQLite local; en la versión web cae a IndexedDB sin cifrado nativo (es
local al navegador, pero ten en cuenta que no es lo mismo).

## Pendiente / próximos pasos sugeridos

## Cómo generar el APK de Android

El proyecto ya tiene Capacitor configurado (`capacitor.config.json`). Capacitor
envuelve esta misma app web en un proyecto Android nativo real — no se
reescribe nada de `src/`. `storage.js` ya cae automáticamente a IndexedDB
cuando no detecta Electron, así que funciona igual en Android.

**Necesitas instalar en tu máquina (esto no se puede hacer desde aquí):**
- [Android Studio](https://developer.android.com/studio) (incluye el SDK y Gradle)
- JDK 17 (Android Studio puede instalarlo él mismo la primera vez que lo abres)

**Pasos:**

```bash
npm install                  # instala también @capacitor/core, /cli y /android

npm run build                # genera dist/ (la web compilada)

npm run cap:add:android      # crea la carpeta android/ (proyecto nativo real)

npm run cap:sync             # copia dist/ dentro del proyecto Android

npm run cap:open:android     # abre el proyecto en Android Studio
```

Desde Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk` — cópialo
al móvil y listo (tendrás que permitir "orígenes desconocidos" para instalarlo
sin pasar por Google Play).

**Una cosa importante si tu Jellyfin no tiene HTTPS:** Android bloquea por
defecto las conexiones HTTP sin cifrar. Si tu servidor es `http://` (típico en
red local), después de `cap add android` edita
`android/app/src/main/AndroidManifest.xml` y añade
`android:usesCleartextTraffic="true"` a la etiqueta `<application>`. Si no,
el login fallará solo en el móvil aunque en escritorio funcione.

**Icono real de la app**: Capacitor usa por defecto un icono genérico. Para
poner el de Aurita, la forma más simple es instalar `@capacitor/assets`
(`npm i -D @capacitor/assets`) y correr `npx capacitor-assets generate` con
`build/icon.png` (ya está en el repo) como fuente — genera automáticamente
todos los tamaños de icono y splash screen que pide Android.

Cada vez que cambies código y quieras probarlo en el móvil, solo hace falta
repetir `npm run cap:sync` (no hay que añadir Android otra vez).

## Pendiente / próximos pasos sugeridos

- **Reproductor avanzado**: cola visual arrastrable, shuffle/repeat, control
  de volumen persistente, Media Session API para controles del sistema
  operativo (especialmente importante en Android).
- **Vista de artista/álbum**: ahora mismo el buscador solo lista resultados;
  falta la página de detalle de álbum/artista con su tracklist.
- **Sincronización offline**: descargar canciones para escucha sin conexión.
- **Tests**: no hay tests todavía — el proyecto es un MVP funcional para que
  puedas validar la experiencia real cuanto antes.
