package com.aurita.app

import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Detecta conexión Bluetooth A2DP y reanuda la reproducción automáticamente.
 * Declarado en el manifest para que Android pueda arrancar la app aunque
 * esté cerrada (excepción a las restricciones de segundo plano de Android 8+).
 */
class CarConnectionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED) return

        val state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, BluetoothProfile.STATE_DISCONNECTED)
        if (state != BluetoothProfile.STATE_CONNECTED) return

        val prefs = context.getSharedPreferences("aurita_player", Context.MODE_PRIVATE)
        val hasQueue = prefs.getInt("last_queue_index", -1) >= 0
        if (!hasQueue) return // nunca se reprodujo nada

        val serviceIntent = Intent(context, AuritaMediaService::class.java)
        serviceIntent.action = AuritaMediaService.ACTION_RESUME
        context.startForegroundService(serviceIntent)
    }
}
