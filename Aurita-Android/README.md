# Aurita Android

App móvil de Aurita (Capacitor + React), misma lógica que el cliente de escritorio.

## Generar el APK

```bash
npm install
npm run build
npm run cap:add        # solo la primera vez: crea la carpeta android/
npm run cap:sync
npm run cap:open        # abre Android Studio
```

Desde Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

**Si ya tenías la carpeta `android/` de una versión anterior**, no hace falta
borrarla ni repetir `cap:add` — con `npm install` (para traer el nuevo
plugin de Media Session) seguido de `npm run cap:sync`, Capacitor detecta el
plugin nuevo y actualiza el proyecto Android automáticamente.

## Icono real del APK (no genérico)

Capacitor usa un icono de relleno hasta que generas los assets reales:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```

Esto usa `resources/icon.png` (cópialo ahí desde `src/assets/logo.png` en alta resolución,
idealmente 1024×1024) y genera automáticamente todos los tamaños de icono
y el splash screen para Android. Vuelve a correr `cap:sync` después.

## HTTP sin cifrar (Jellyfin en red local sin HTTPS)

Si tu servidor es `http://`, añade en `android/app/src/main/AndroidManifest.xml`,
dentro de la etiqueta `<application>`:

```xml
android:usesCleartextTraffic="true"
```

## Motor de audio nativo (ExoPlayer) — no el `<audio>` de la WebView

Aurita Android ya no usa el elemento `<audio>` del navegador para reproducir
música. Usa un motor de audio **100% nativo**: `ExoPlayer` + `MediaSession`
de la librería `androidx.media3`, controlado desde JavaScript a través de
un plugin propio (`AuritaPlayer`).

**Por qué este cambio (no es solo "rendimiento"):**
- El `<audio>` de un WebView depende de que la app esté viva y la página
  cargada — no puede sonar con la app totalmente cerrada.
- ExoPlayer gestiona el **audio focus** y el **"se perdió la salida de
  sonido"** (`AUDIO_BECOMING_NOISY`, p.ej. Bluetooth del coche caído) de
  forma **oficial e integrada** — esto es justo lo que antes intentábamos
  parchear a mano desde JavaScript sin poder garantizarlo del todo.
- Es la misma base que exige Android Auto (ver más abajo): un `MediaSession`
  real sobre un reproductor real, no una página web.
- La notificación con carátula/controles y el servicio en primer plano ya
  vienen incluidos en `media3` — ya no hace falta el plugin
  `@jofr/capacitor-media-session` que usábamos antes, se ha retirado.

**Piezas que lo componen** (todas en `native-plugin/`, instaladas
automáticamente por `npm run cap:add`):
- `PlaybackService.kt` — el servicio en primer plano con el `ExoPlayer` y el
  `MediaSession` reales.
- `AuritaPlayerPlugin.kt` — el puente entre JavaScript y ese servicio
  (`play`, `pause`, `resume`, `seekTo`...).
- `CarConnectionReceiver.kt` — ver siguiente sección.

## Reproducir solo al conectar el coche, sin tocar el móvil

Esta es la pieza que permite "me subo al coche con el móvil en el bolsillo,
sin haber abierto Aurita, y empieza a sonar la última canción sola".

Funciona porque Android **exime explícitamente** ciertos eventos Bluetooth
de las restricciones de segundo plano de Android 8+ — están en la lista
oficial de excepciones, documentado por Android: `BluetoothA2dp.
ACTION_CONNECTION_STATE_CHANGED` puede despertar una app **completamente
cerrada**, cosa que la mayoría de eventos ya no pueden hacer desde hace
años.

`CarConnectionReceiver.kt` es un receptor **declarado en el manifest** (no
en tiempo de ejecución) para ese evento. Cuando el coche se conecta:
1. Si Aurita nunca ha reproducido nada, no pasa nada (no hay qué reanudar).
2. Si sí, lee de `SharedPreferences` nativo (no depende de que JavaScript
   esté cargado) la última canción reproducida — guardada ahí cada vez que
   se llama a `AuritaPlayer.play()` — y arranca `PlaybackService`
   directamente con esa canción. Sin abrir ninguna pantalla.

Al **desconectar** el coche (limpio o de golpe), `ExoPlayer` se pausa solo
gracias a `setHandleAudioBecomingNoisy(true)` — ya no hace falta ningún
receiver adicional para esto, es gestión oficial de `media3`.

**Límite honesto:** algunos fabricantes con gestores de batería muy
agresivos (Xiaomi, Huawei, ciertos Samsung) pueden matar igualmente el
proceso en según qué circunstancias, pese al servicio en primer plano. Si
pasa, se soluciona desactivando la "optimización de batería" para Aurita en
Ajustes → Batería → Aurita → Sin restricciones.

## Cómo (re)instalar el motor nativo

**`npm run cap:add` ya lo instala todo automáticamente** — copia los `.kt`,
añade las dependencias de `media3` a `build.gradle`, los permisos al
manifest, registra el servicio y el receiver, y registra el plugin en
`MainActivity`. No hace falta tocar nada a mano si usas ese comando.

Si en algún momento `android/` se queda en un estado raro y quieres
reinstalar todo esto sin recrear la carpeta entera (es seguro repetirlo,
no duplica nada si ya está instalado):

```bash
npm run install-native-plugin
npm run cap:sync
```

**Importante:** todo esto vive dentro de `android/`, que se genera
localmente con `cap:add` y **no viaja dentro del zip del proyecto**. Si
borras esa carpeta y la recreas desde cero, hace falta volver a correr
`cap:add` (que ya incluye este paso) o `install-native-plugin` a mano.

## Reinstalación limpia (evita sesiones viejas "fantasma")

Al ejecutar desde Android Studio con el botón ▶️, por defecto se actualiza
la app **sin borrar sus datos** (como una actualización normal). Esto está
bien la mayoría de las veces, pero si vienes de probar versiones antiguas
del código, puede quedar una sesión guardada vieja que cause errores raros
(401, etc.) sin que sea un bug nuevo — simplemente datos de pruebas
anteriores.

Si algo se comporta raro tras actualizar el código, antes de investigar
más a fondo, prueba primero a desinstalar la app del dispositivo/emulador
por completo y volver a instalarla desde cero — descarta de un plumazo
cualquier dato viejo como causa.

## Android Auto — Fase 2, más cerca de lo que parece

Con el motor `ExoPlayer` + `MediaSession` ya construido (Fase 1, arriba),
lo que falta para Android Auto es más acotado de lo que sería sin esa base:
`PlaybackService` tendría que pasar de `MediaSessionService` a
`MediaLibraryService` e implementar la jerarquía de navegación
(`onGetLibraryRoot` / `onGetChildren`) que Android Auto usa para mostrar
playlists/géneros/artistas en la pantalla del coche. El motor de audio en
sí (lo más grande del trabajo) ya está hecho — esto sería extender el
mismo servicio, no construir uno nuevo desde cero.

Pendiente de abordar cuando la Fase 1 esté probada y estable en uso real.
