#!/usr/bin/env bash
# ============================================================
#  install-native-plugin.sh
# ============================================================
#  Instala el motor de audio nativo de Aurita (ExoPlayer + MediaSession +
#  receptor de coche) en el proyecto android/ generado por `cap add`.
#  Es necesario porque android/ se regenera localmente y no viaja dentro
#  del zip del proyecto.
#
#  Hace, cada paso seguro de repetir sin duplicar:
#  1. Copia los .kt al paquete Java/Kotlin de la app
#  2. Añade las dependencias de media3 (ExoPlayer) a build.gradle
#  3. Añade los permisos necesarios al manifest
#  4. Registra el servicio PlaybackService y el receiver CarConnectionReceiver
#     en el manifest
#  5. Registra AuritaPlayerPlugin en MainActivity
# ============================================================
set -e

ANDROID_DIR="android"
PACKAGE_PATH="$ANDROID_DIR/app/src/main/java/com/aurita/app"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
MAIN_ACTIVITY="$PACKAGE_PATH/MainActivity.java"
BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
ROOT_BUILD_GRADLE="$ANDROID_DIR/build.gradle"

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "✗ No existe la carpeta android/. Ejecuta primero: npm run cap:add"
  exit 1
fi
if [[ ! -f "$MAIN_ACTIVITY" ]]; then
  echo "✗ No se encuentra $MAIN_ACTIVITY (¿cambió el appId?)"
  exit 1
fi

# ---- 1. Copiar los .kt y MainActivity.java ----
mkdir -p "$PACKAGE_PATH"
cp native-plugin/AuritaPlayer/AuritaMediaService.kt "$PACKAGE_PATH/AuritaMediaService.kt"
cp native-plugin/AuritaPlayer/AuritaPlayerPlugin.kt "$PACKAGE_PATH/AuritaPlayerPlugin.kt"
cp native-plugin/CarConnectionReceiver/CarConnectionReceiver.kt "$PACKAGE_PATH/CarConnectionReceiver.kt"
cp native-plugin/AuritaPlayer/MainActivity.java "$PACKAGE_PATH/MainActivity.java"
echo "✓ Archivos Kotlin + MainActivity copiados a $PACKAGE_PATH"

# ---- 2. Activar Kotlin en el proyecto (Capacitor genera Java puro) ----
# Sin esto, Gradle simplemente IGNORA los .kt — ni da error de compilación
# ni los incluye, así que MainActivity no encuentra las clases al intentar
# registrarlas. Es justo lo que pasaba antes de este paso.
if grep -q "kotlin-gradle-plugin" "$ROOT_BUILD_GRADLE"; then
  echo "✓ El plugin de Gradle de Kotlin ya estaba presente (build.gradle raíz)."
else
  python3 - "$ROOT_BUILD_GRADLE" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

content = re.sub(
    r'(dependencies\s*\{)',
    "\\1\\n        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24\"",
    content,
    count=1
)

with open(path, 'w') as f:
    f.write(content)
PYEOF
  echo "✓ Plugin de Gradle de Kotlin añadido a $ROOT_BUILD_GRADLE"
fi

if grep -q "kotlin-android" "$BUILD_GRADLE"; then
  echo "✓ El plugin kotlin-android ya estaba aplicado."
else
  python3 - "$BUILD_GRADLE" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

content = re.sub(
    r"(apply plugin: 'com\.android\.application')",
    r"\1\napply plugin: 'kotlin-android'",
    content,
    count=1
)

with open(path, 'w') as f:
    f.write(content)
PYEOF
  echo "✓ Plugin kotlin-android aplicado en $BUILD_GRADLE"
fi

# ---- 3. Dependencias media3 (ExoPlayer) + kotlin-stdlib en build.gradle ----
if grep -q "media3-exoplayer" "$BUILD_GRADLE" && grep -q "androidx.media:media" "$BUILD_GRADLE"; then
  echo "✓ Dependencias de media3 ya estaban presentes."
else
  python3 - "$BUILD_GRADLE" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

media3_deps = (
    "    implementation \"org.jetbrains.kotlin:kotlin-stdlib:1.9.24\"\n"
    "    implementation \"androidx.media3:media3-exoplayer:1.4.1\"\n"
    "    implementation \"androidx.media3:media3-session:1.4.1\"\n"
    "    implementation \"androidx.media3:media3-datasource:1.4.1\"\n"
    "    implementation \"androidx.media3:media3-database:1.4.1\"\n"
    "    implementation \"androidx.media:media:1.7.0\"\n"
)

content = re.sub(
    r'(dependencies\s*\{)',
    r'\1\n' + media3_deps,
    content,
    count=1
)

with open(path, 'w') as f:
    f.write(content)
PYEOF
  echo "✓ Dependencias de media3 añadidas a build.gradle"
fi

# ---- 4. Permisos en el manifest ----
add_permission() {
  local perm="$1"
  if grep -q "$perm" "$MANIFEST"; then
    echo "✓ Permiso $perm ya estaba presente."
  else
    python3 - "$MANIFEST" "$perm" << 'PYEOF'
import sys, re
path, perm = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()
content = re.sub(
    r'(<manifest[^>]*>)',
    r'\1\n    <uses-permission android:name="android.permission.' + perm + '" />',
    content,
    count=1
)
with open(path, 'w') as f:
    f.write(content)
PYEOF
    echo "✓ Permiso $perm añadido."
  fi
}
add_permission "BLUETOOTH_CONNECT"
add_permission "FOREGROUND_SERVICE"
add_permission "FOREGROUND_SERVICE_MEDIA_PLAYBACK"
# Android 13+ exige este permiso para cualquier notificación, incluidas las
# de reproducción de Media3. Sin él, la notificación del reproductor
# simplemente no aparece en la bandeja.
add_permission "POST_NOTIFICATIONS"
# WakeLock para evitar que la CPU duerma durante reproducción
add_permission "WAKE_LOCK"
# Monitoreo de red para reconectar automáticamente
add_permission "ACCESS_NETWORK_STATE"

# ---- 5. Eliminar PlaybackService antiguo si existe ----
if grep -q "PlaybackService" "$MANIFEST"; then
  echo "→ Eliminando PlaybackService antiguo del manifest..."
  python3 - "$MANIFEST" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()
content = re.sub(
    r'\s*<service[^>]*android:name="\.PlaybackService"[^>]*>.*?</service>',
    '',
    content,
    flags=re.DOTALL
)
with open(path, 'w') as f:
    f.write(content)
PYEOF
  echo "✓ PlaybackService eliminado."
fi

# ---- 6. Crear res/xml/automotive_app_desc.xml para Android Auto ----
AUTO_XML_DIR="$ANDROID_DIR/app/src/main/res/xml"
AUTO_XML="$AUTO_XML_DIR/automotive_app_desc.xml"
mkdir -p "$AUTO_XML_DIR"
if [[ -f "$AUTO_XML" ]]; then
  echo "✓ automotive_app_desc.xml ya existía."
else
  cat > "$AUTO_XML" << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="media" />
</automotiveApp>
XMLEOF
  echo "✓ automotive_app_desc.xml creado."
fi

# ---- 7. Servicio + receiver + meta-data Android Auto en el manifest ----
if grep -q "AuritaMediaService" "$MANIFEST" && grep -q "com.google.android.gms.car.application" "$MANIFEST"; then
  echo "✓ AuritaMediaService, CarConnectionReceiver y meta-data Android Auto ya estaban registrados."
else
  python3 - "$MANIFEST" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    content = f.read()

components = '''
    <meta-data
        android:name="com.google.android.gms.car.application"
        android:resource="@xml/automotive_app_desc" />

    <service
        android:name=".AuritaMediaService"
        android:foregroundServiceType="mediaPlayback"
        android:exported="true">
        <intent-filter>
            <action android:name="androidx.media3.session.MediaLibraryService" />
        </intent-filter>
        <intent-filter>
            <action android:name="android.media.browse.MediaBrowserService" />
        </intent-filter>
    </service>

    <receiver
        android:name=".CarConnectionReceiver"
        android:exported="true">
        <intent-filter>
            <action android:name="android.bluetooth.a2dp.profile.action.CONNECTION_STATE_CHANGED" />
        </intent-filter>
    </receiver>
</application>'''

content = content.replace('</application>', components, 1)

with open(path, 'w') as f:
    f.write(content)
PYEOF
  echo "✓ AuritaMediaService, CarConnectionReceiver y meta-data Android Auto registrados."
fi

# ---- 8. MainActivity ya se copia en el paso 1 ----
echo "✓ MainActivity.java copiado desde native-plugin/ (paso 1)."

echo ""
echo "Listo. Ahora ejecuta: npm run cap:sync"
