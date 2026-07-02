package com.aurita.app

import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata

/**
 * A diferencia del receiver dentro de PlaybackService/AuritaPlayerPlugin
 * (que solo existe mientras la app está viva), este se declara en el
 * manifest. Android documenta BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED
 * como una de las pocas excepciones a las restricciones de segundo plano de
 * Android 8+: puede arrancar la app desde cero, aunque el usuario la haya
 * cerrado del todo.
 *
 * Por eso es la pieza que permite "me subo al coche con el móvil en el
 * bolsillo y empieza a sonar sola" sin tener que abrir Aurita primero.
 */
class CarConnectionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED) return

        val state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, BluetoothProfile.STATE_DISCONNECTED)
        if (state != BluetoothProfile.STATE_CONNECTED) return

        val prefs = context.getSharedPreferences("aurita_player", Context.MODE_PRIVATE)
        val url = prefs.getString("last_url", null) ?: return // nunca se reprodujo nada, no hay qué reanudar

        // Arrancamos el servicio en primer plano directamente — sin abrir
        // ninguna pantalla, sin que el usuario vea nada en el móvil.
        val serviceIntent = Intent(context, AuritaMediaService::class.java)
        serviceIntent.putExtra("resume_url", url)
        serviceIntent.putExtra("resume_title", prefs.getString("last_title", ""))
        serviceIntent.putExtra("resume_artist", prefs.getString("last_artist", ""))
        serviceIntent.putExtra("resume_album", prefs.getString("last_album", ""))
        serviceIntent.putExtra("resume_artwork", prefs.getString("last_artwork", ""))
        serviceIntent.putExtra("resume_from_cold_start", true)
        context.startForegroundService(serviceIntent)
    }
}
