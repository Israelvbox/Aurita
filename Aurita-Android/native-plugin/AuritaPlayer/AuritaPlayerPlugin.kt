package com.aurita.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.SettableFuture
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@CapacitorPlugin(
    name = "AuritaPlayer",
    permissions = [
        Permission(
            alias = "bluetooth",
            strings = [Manifest.permission.BLUETOOTH_CONNECT]
        )
    ]
)
class AuritaPlayerPlugin : Plugin() {

    private val preloadExecutor = Executors.newSingleThreadExecutor()

    companion object {
        private var player: ExoPlayer? = null
        var instance: AuritaPlayerPlugin? = null
        private var pendingQueue: List<MediaItem>? = null
        private var pendingStartIndex: Int = 0
        private var pendingAutoPlay: Boolean = true

        private val catalog = ConcurrentHashMap<String, List<MediaItem>>()
        val pendingFutures = ConcurrentHashMap<String, Pair<SettableFuture<LibraryResult<ImmutableList<MediaItem>>>, MediaLibraryService.LibraryParams?>>()

        fun getCatalogChildren(parentId: String): List<MediaItem>? = catalog[parentId]

        fun getCatalogItem(mediaId: String): MediaItem? {
            for (items in catalog.values) {
                items.find { it.mediaId == mediaId }?.let { return it }
            }
            return null
        }

        fun notifyLoadChildren(parentId: String) {
            val data = JSObject()
            data.put("parentId", parentId)
            instance?.notifyListeners("loadChildren", data)
        }

        fun resolvePending(parentId: String, items: List<MediaItem>) {
            pendingFutures.remove(parentId)?.let { (future, params) ->
                future.set(LibraryResult.ofItemList(items, params))
            }
        }

        fun attachPlayer(p: ExoPlayer?) {
            player = p
            pendingQueue?.let { items ->
                p?.apply {
                    setMediaItems(items, pendingStartIndex, C.TIME_UNSET)
                    prepare()
                    if (pendingAutoPlay) play()
                }
                pendingQueue = null
            }
        }

        fun detachPlayer() { player = null }

        fun triggerPrev() { instance?.notifyListeners("prevTrack", JSObject()) }
        fun triggerNext() { instance?.notifyListeners("nextTrack", JSObject()) }

        fun notifyStateChange(p: ExoPlayer?) {
            val pl = p ?: return
            val data = JSObject()
            data.put("isPlaying",    pl.isPlaying)
            data.put("duration",     if (pl.duration > 0) pl.duration / 1000.0 else 0.0)
            val pos = pl.currentPosition
            data.put("position",     if (pos > 0) pos / 1000.0 else 0.0)
            data.put("currentIndex", pl.currentMediaItemIndex)
            data.put("ended",        pl.playbackState == Player.STATE_ENDED)
            instance?.notifyListeners("stateChanged", data)
        }

        fun notifyError(message: String) {
            val data = JSObject()
            data.put("message", message)
            instance?.notifyListeners("playerError", data)
        }
    }

    override fun load() { instance = this }

    @PluginMethod
    fun play(call: PluginCall) {
        val tracksArray = call.getArray("tracks") ?: run { call.reject("Falta tracks"); return }
        val startIndex  = call.getInt("startIndex") ?: 0
        val autoPlay    = call.getBoolean("autoPlay") ?: true

        val items = mutableListOf<MediaItem>()
        for (i in 0 until tracksArray.length()) {
            val t = tracksArray.getJSONObject(i) ?: continue
            val url = t.optString("url", ""); if (url.isEmpty()) continue
            val meta = MediaMetadata.Builder()
                .setTitle(t.optString("title", ""))
                .setArtist(t.optString("artist", ""))
                .setAlbumTitle(t.optString("album", ""))
                .apply {
                    val art = t.optString("artworkUrl", "")
                    if (art.isNotEmpty()) setArtworkUri(Uri.parse(art))
                }
                .build()
            items.add(MediaItem.Builder().setUri(Uri.parse(url)).setMediaMetadata(meta).build())
        }
        if (items.isEmpty()) { call.reject("No hay tracks válidos"); return }

        val safeIndex = startIndex.coerceIn(0, items.size - 1)
        val current = items[safeIndex]

        val cm = current.mediaMetadata
        context.getSharedPreferences("aurita_player", Context.MODE_PRIVATE).edit()
            .putString("last_url",     current.localConfiguration?.uri?.toString() ?: "")
            .putString("last_title",   cm.title?.toString() ?: "")
            .putString("last_artist",  cm.artist?.toString() ?: "")
            .putString("last_album",   cm.albumTitle?.toString() ?: "")
            .putString("last_artwork", cm.artworkUri?.toString() ?: "")
            .apply()

        activity.runOnUiThread {
            val p = player
            if (p != null) {
                p.setMediaItems(items, safeIndex, C.TIME_UNSET)
                p.prepare()
                if (autoPlay) p.play()
            } else {
                pendingQueue = items
                pendingStartIndex = safeIndex
                pendingAutoPlay = autoPlay
                context.startService(Intent(context, AuritaMediaService::class.java))
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        activity.runOnUiThread { player?.apply { pause(); notifyStateChange(this) } }
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        activity.runOnUiThread { player?.apply { play(); notifyStateChange(this) } }
        call.resolve()
    }

    @PluginMethod
    fun next(call: PluginCall) {
        activity.runOnUiThread {
            val p = player ?: return@runOnUiThread
            p.seekToNext()
            p.play()
        }
        call.resolve()
    }

    @PluginMethod
    fun prev(call: PluginCall) {
        activity.runOnUiThread {
            val p = player ?: return@runOnUiThread
            if (p.hasPreviousMediaItem()) p.seekToPrevious() else p.seekTo(0)
            p.play()
        }
        call.resolve()
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        val seconds = call.getDouble("seconds") ?: 0.0
        activity.runOnUiThread {
            val p = player ?: return@runOnUiThread
            p.seekTo((seconds * 1000L).toLong())
        }
        call.resolve()
    }

    @PluginMethod
    fun addToQueue(call: PluginCall) {
        val tracksArray = call.getArray("tracks") ?: run { call.resolve(); return }
        activity.runOnUiThread {
            val p = player ?: run { call.resolve(); return@runOnUiThread }
            for (i in 0 until tracksArray.length()) {
                val t = tracksArray.getJSONObject(i) ?: continue
                val url = t.optString("url", ""); if (url.isEmpty()) continue
                val meta = MediaMetadata.Builder()
                    .setTitle(t.optString("title", ""))
                    .setArtist(t.optString("artist", ""))
                    .setAlbumTitle(t.optString("album", ""))
                    .apply {
                        val art = t.optString("artworkUrl", "")
                        if (art.isNotEmpty()) setArtworkUri(Uri.parse(art))
                    }
                    .build()
                p.addMediaItem(MediaItem.Builder().setUri(Uri.parse(url)).setMediaMetadata(meta).build())
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun setShuffle(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        activity.runOnUiThread { player?.setShuffleModeEnabled(enabled) }
        call.resolve()
    }

    @PluginMethod
    fun setRepeatMode(call: PluginCall) {
        val mode = call.getString("mode") ?: "off"
        val code = when (mode) {
            "all" -> Player.REPEAT_MODE_ALL
            "one" -> Player.REPEAT_MODE_ONE
            else  -> Player.REPEAT_MODE_OFF
        }
        activity.runOnUiThread { player?.repeatMode = code }
        call.resolve()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        activity.runOnUiThread {
            val pl = player
            val result = JSObject()
            result.put("isPlaying",    pl?.isPlaying ?: false)
            result.put("duration",     if ((pl?.duration ?: 0) > 0) pl!!.duration / 1000.0 else 0.0)
            result.put("position",     pl?.currentPosition?.div(1000.0) ?: 0.0)
            result.put("currentIndex", pl?.currentMediaItemIndex ?: -1)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun preloadTrack(call: PluginCall) {
        val url   = call.getString("url") ?: run { call.resolve(); return }
        val cache = AuritaMediaService.audioCache  ?: run { call.resolve(); return }

        preloadExecutor.execute {
            val factory = CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(
                    DefaultHttpDataSource.Factory()
                        .setAllowCrossProtocolRedirects(true)
                        .setConnectTimeoutMs(10_000)
                )
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

            val dataSource = factory.createDataSource()
            val dataSpec = DataSpec(Uri.parse(url), 0L, 2_000_000L)
            try {
                dataSource.open(dataSpec)
                val buffer = ByteArray(65_536)
                while (true) {
                    val read = dataSource.read(buffer, 0, buffer.size)
                    if (read == C.RESULT_END_OF_INPUT) break
                }
            } catch (_: Exception) {
            } finally {
                try { dataSource.close() } catch (_: Exception) {}
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun requestBluetoothPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve()
            return
        }
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) {
            call.resolve()
            return
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback")
    }

    @PermissionCallback
    fun bluetoothPermissionCallback(call: PluginCall) {
        call.resolve()
    }

    private fun buildMediaItem(obj: JSONObject): MediaItem? {
        val id = obj.optString("id", ""); if (id.isEmpty()) return null
        val uri = obj.optString("uri", "")
        val hasUri = uri.isNotEmpty()
        val builder = MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(obj.optString("title", ""))
                    .setArtist(obj.optString("subtitle", ""))
                    .setIsBrowsable(!hasUri)
                    .setIsPlayable(hasUri)
                    .apply {
                        val art = obj.optString("artworkUri", "")
                        if (art.isNotEmpty()) setArtworkUri(Uri.parse(art))
                    }
                    .build()
            )
        if (hasUri) {
            builder.setUri(Uri.parse(uri))
        }
        return builder.build()
    }

    @PluginMethod
    fun setCatalogItems(call: PluginCall) {
        val itemsArray = call.getArray("items") ?: run { call.resolve(); return }
        val parentId = call.getString("parentId") ?: "__ROOT__"
        val list = mutableListOf<MediaItem>()
        for (i in 0 until itemsArray.length()) {
            val obj = itemsArray.getJSONObject(i) ?: continue
            buildMediaItem(obj)?.let { list.add(it) }
        }
        catalog[parentId] = list
        call.resolve()
    }

    @PluginMethod
    fun sendChildren(call: PluginCall) {
        val parentId = call.getString("parentId") ?: run { call.resolve(); return }
        val itemsArray = call.getArray("items") ?: run {
            resolvePending(parentId, emptyList()); call.resolve(); return
        }
        val list = mutableListOf<MediaItem>()
        for (i in 0 until itemsArray.length()) {
            val obj = itemsArray.getJSONObject(i) ?: continue
            buildMediaItem(obj)?.let { list.add(it) }
        }
        catalog[parentId] = list
        resolvePending(parentId, list)
        call.resolve()
    }
}
