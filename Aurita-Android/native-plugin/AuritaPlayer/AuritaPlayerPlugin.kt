package com.aurita.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
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

    private val executor = Executors.newCachedThreadPool()
    private val offlineDirName = "aurita_offline"

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
            data.put("idle",         pl.playbackState == Player.STATE_IDLE)
            data.put("buffering",    pl.playbackState == Player.STATE_BUFFERING)
            data.put("ready",        pl.playbackState == Player.STATE_READY)
            data.put("mediaItemCount", pl.mediaItemCount)
            instance?.notifyListeners("stateChanged", data)
        }

        fun notifyError(message: String) {
            val data = JSObject()
            data.put("message", message)
            instance?.notifyListeners("playerError", data)
        }
    }

    override fun load() { instance = this }

    private fun getOfflineDir(): File {
        val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC), offlineDirName)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun offlineFilePath(itemId: String): File {
        return File(getOfflineDir(), "${itemId}.mp3")
    }

    @PluginMethod
    fun isDownloaded(call: PluginCall) {
        val itemId = call.getString("itemId") ?: run { call.resolve(JSObject().apply { put("downloaded", false) }); return }
        val file = offlineFilePath(itemId)
        val result = JSObject()
        result.put("downloaded", file.exists())
        result.put("path", file.absolutePath)
        call.resolve(result)
    }

    @PluginMethod
    fun getDownloadedIds(call: PluginCall) {
        val dir = getOfflineDir()
        val files = dir.listFiles() ?: emptyArray()
        val ids = JSArray()
        files.filter { it.extension == "mp3" }.forEach { ids.put(it.nameWithoutExtension) }
        val result = JSObject()
        result.put("ids", ids)
        call.resolve(result)
    }

    @PluginMethod
    fun downloadTrack(call: PluginCall) {
        val url = call.getString("url") ?: run { call.reject("Falta url"); return }
        val itemId = call.getString("itemId") ?: run { call.reject("Falta itemId"); return }
        val onProgress = call.getBoolean("onProgress", false)

        executor.execute {
            try {
                val targetFile = offlineFilePath(itemId)
                if (targetFile.exists()) {
                    call.resolve(JSObject().apply { put("path", targetFile.absolutePath) })
                    return@execute
                }

                val tempFile = File(targetFile.absolutePath + ".tmp")
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 15_000
                connection.readTimeout = 30_000
                connection.instanceFollowRedirects = true
                connection.connect()

                val totalSize = connection.contentLength.toLong()
                val inputStream = connection.inputStream
                val outputStream = FileOutputStream(tempFile)
                val buffer = ByteArray(32_768)
                var bytesRead: Int
                var totalRead = 0L
                var lastProgressPct = -1

                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalRead += bytesRead
                    if (onProgress == true && totalSize > 0) {
                        val pct = ((totalRead * 100) / totalSize).toInt()
                        if (pct != lastProgressPct) {
                            lastProgressPct = pct
                            val progressData = JSObject()
                            progressData.put("itemId", itemId)
                            progressData.put("progress", pct)
                            instance?.notifyListeners("downloadProgress", progressData)
                        }
                    }
                }

                inputStream.close()
                outputStream.close()
                tempFile.renameTo(targetFile)

                val result = JSObject()
                result.put("path", targetFile.absolutePath)
                result.put("size", totalRead)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Error descargando: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun deleteDownload(call: PluginCall) {
        val itemId = call.getString("itemId") ?: run { call.resolve(); return }
        offlineFilePath(itemId).delete()
        call.resolve()
    }

    @PluginMethod
    fun getOfflinePath(call: PluginCall) {
        val itemId = call.getString("itemId") ?: run { call.reject("Falta itemId"); return }
        val file = offlineFilePath(itemId)
        call.resolve(JSObject().apply {
            put("path", file.absolutePath)
            put("exists", file.exists())
        })
    }

    private fun saveQueueToPrefs(items: List<MediaItem>, startIndex: Int) {
        val prefs = context.getSharedPreferences("aurita_player", Context.MODE_PRIVATE)
        val jsonArray = JSONArray()
        for (item in items) {
            val uri = item.localConfiguration?.uri?.toString() ?: ""
            val meta = item.mediaMetadata
            val obj = JSONObject()
            obj.put("url", uri)
            obj.put("title", meta.title?.toString() ?: "")
            obj.put("artist", meta.artist?.toString() ?: "")
            obj.put("album", meta.albumTitle?.toString() ?: "")
            obj.put("artworkUrl", meta.artworkUri?.toString() ?: "")
            jsonArray.put(obj)
        }
        prefs.edit()
            .putString("last_queue_json", jsonArray.toString())
            .putInt("last_queue_index", startIndex)
            .apply()
    }

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
        saveQueueToPrefs(items, safeIndex)

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
        activity.runOnUiThread {
            val p = player ?: run { call.resolve(); return@runOnUiThread }
            if (p.playbackState == Player.STATE_ENDED) {
                p.seekToDefaultPosition()
                p.prepare()
            }
            p.play()
            notifyStateChange(p)
        }
        call.resolve()
    }

    @PluginMethod
    fun next(call: PluginCall) {
        activity.runOnUiThread {
            val p = player ?: return@runOnUiThread
            if (p.hasNextMediaItem()) {
                p.seekToNext()
                p.play()
            }
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
            var added = 0
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
                added++
            }
            if (added > 0) {
                // Actualizar cola guardada con nuevos items
                val currentCount = p.mediaItemCount
                val allItems = mutableListOf<MediaItem>()
                for (i in 0 until currentCount) {
                    val timelineItem = p.getMediaItemAt(i)
                    allItems.add(timelineItem)
                }
                saveQueueToPrefs(allItems, p.currentMediaItemIndex)
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
            result.put("mediaItemCount", pl?.mediaItemCount ?: 0)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun preloadTrack(call: PluginCall) {
        val url   = call.getString("url") ?: run { call.resolve(); return }
        val cache = AuritaMediaService.audioCache  ?: run { call.resolve(); return }

        executor.execute {
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
