package com.aurita.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import androidx.media3.common.Timeline
import androidx.media3.common.PlaybackException
import android.support.v4.media.session.PlaybackStateCompat
import android.support.v4.media.session.MediaSessionCompat
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.io.File

class AuritaMediaService : MediaLibraryService() {

    companion object {
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID      = "aurita_playback"
        const val CACHE_SIZE_MB   = 300L
        const val ROOT_ID         = "__ROOT__"

        const val ACTION_PAUSE  = "com.aurita.app.PAUSE"
        const val ACTION_RESUME = "com.aurita.app.RESUME"
        const val ACTION_PREV   = "com.aurita.app.PREV"
        const val ACTION_NEXT   = "com.aurita.app.NEXT"

        @Volatile var audioCache: SimpleCache? = null
    }

    private var player: ExoPlayer? = null
    private var mediaSession: MediaLibrarySession? = null
    private var notificationManager: NotificationManager? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var retryCount = 0
    private var retryHandler = Handler(Looper.getMainLooper())
    private var hasNetwork = true

    private val progressHandler = Handler(Looper.getMainLooper())
    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            if (p.isPlaying) {
                AuritaPlayerPlugin.notifyStateChange(p)
                updateBluetoothPlaybackState(p)
                savePosition(p.currentPosition)
                progressHandler.postDelayed(this, 250)
            }
        }
    }

    private fun updateBluetoothPlaybackState(p: ExoPlayer) {
        val s = mediaSession ?: return
        val posMs = p.currentPosition
        if (posMs <= 0) return
        try {
            val compatField = MediaSession::class.java.getDeclaredField("sessionCompat")
            compatField.isAccessible = true
            val sessionCompat = compatField.get(s) as? MediaSessionCompat ?: return
            sessionCompat.setPlaybackState(
                PlaybackStateCompat.Builder()
                    .setState(PlaybackStateCompat.STATE_PLAYING, posMs, 1.0f, SystemClock.elapsedRealtime())
                    .setActions(
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_SEEK_TO
                    )
                    .build()
            )
        } catch (_: Exception) {}
    }

    private fun prefs() = getSharedPreferences("aurita_player", MODE_PRIVATE)

    private fun savePosition(posMs: Long) {
        if (posMs > 0) {
            prefs().edit().putLong("last_position", posMs).apply()
        }
    }

    private fun restorePlayback() {
        val p = player ?: return
        if (p.mediaItemCount > 0) return

        val queueJson = prefs().getString("last_queue_json", null)
        if (queueJson != null) {
            try {
                val orgJson = org.json.JSONArray(queueJson)
                val items = mutableListOf<MediaItem>()
                for (i in 0 until orgJson.length()) {
                    val obj = orgJson.getJSONObject(i)
                    val url = obj.optString("url", ""); if (url.isEmpty()) continue
                    val meta = MediaMetadata.Builder()
                        .setTitle(obj.optString("title", ""))
                        .setArtist(obj.optString("artist", ""))
                        .setAlbumTitle(obj.optString("album", ""))
                        .apply {
                            val art = obj.optString("artworkUrl", "")
                            if (art.isNotEmpty()) setArtworkUri(android.net.Uri.parse(art))
                        }
                        .build()
                    items.add(MediaItem.Builder().setUri(url).setMediaMetadata(meta).build())
                }
                if (items.isNotEmpty()) {
                    val idx = prefs().getInt("last_queue_index", 0).coerceIn(0, items.size - 1)
                    val pos = prefs().getLong("last_position", 0L)
                    p.setMediaItems(items, idx, if (pos > 0) pos else C.TIME_UNSET)
                    p.prepare()
                    return
                }
            } catch (_: Exception) {}
        }

        // Fallback: legacy individual prefs
        val len = prefs().getInt("last_queue_length", 0)
        if (len == 0) return
        val items = mutableListOf<MediaItem>()
        for (i in 0 until len) {
            val url = prefs().getString("last_queue_${i}_url", null) ?: continue
            val meta = MediaMetadata.Builder()
                .setTitle(prefs().getString("last_queue_${i}_title", "") ?: "")
                .setArtist(prefs().getString("last_queue_${i}_artist", "") ?: "")
                .setAlbumTitle(prefs().getString("last_queue_${i}_album", "") ?: "")
                .apply {
                    prefs().getString("last_queue_${i}_artwork", null)
                        ?.takeIf { it.isNotEmpty() }
                        ?.let { setArtworkUri(android.net.Uri.parse(it)) }
                }
                .build()
            items.add(MediaItem.Builder().setUri(url).setMediaMetadata(meta).build())
        }
        if (items.isEmpty()) return
        val idx = prefs().getInt("last_queue_index", 0).coerceIn(0, items.size - 1)
        val pos = prefs().getLong("last_position", 0L)
        p.setMediaItems(items, idx, if (pos > 0) pos else C.TIME_UNSET)
        p.prepare()
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "Aurita:MusicPlayback"
            ).apply { setReferenceCounted(false) }
        }
        if (!wakeLock!!.isHeld) {
            wakeLock!!.acquire(4 * 60 * 60 * 1000L) // 4 hours max
        }
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock!!.release()
        }
    }

    private val retryRunnable = Runnable {
        retryPlayback()
    }

    private fun retryPlayback() {
        val p = player ?: return
        if (p.playbackState != Player.STATE_IDLE && p.playbackState != Player.STATE_ENDED) return
        if (!hasNetwork) {
            retryCount++
            val delay = (retryCount.coerceAtMost(10) * 2000L).coerceAtMost(30_000L)
            retryHandler.postDelayed(retryRunnable, delay)
            return
        }
        retryCount = 0
        p.prepare()
        p.play()
    }

    private fun setupNetworkMonitor() {
        val mainHandler = Handler(Looper.getMainLooper())
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                hasNetwork = true
                retryCount = 0
                mainHandler.post { retryPlayback() }
            }

            override fun onLost(network: Network) {
                hasNetwork = false
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                val wasOffline = !hasNetwork
                hasNetwork = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                if (wasOffline && hasNetwork) {
                    retryCount = 0
                    mainHandler.post { retryPlayback() }
                }
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager?.registerNetworkCallback(request, networkCallback!!)
    }

    private val libraryCallback = object : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: MediaLibraryService.LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val root = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle("Aurita")
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .build()
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(root, params))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentMediaId: String,
            page: Int,
            pageSize: Int,
            params: MediaLibraryService.LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val children = AuritaPlayerPlugin.getCatalogChildren(parentMediaId)
            if (children != null) {
                return Futures.immediateFuture(LibraryResult.ofItemList(children, params))
            }

            val future: SettableFuture<LibraryResult<ImmutableList<MediaItem>>> = SettableFuture.create()
            AuritaPlayerPlugin.pendingFutures[parentMediaId] = Pair(future, params)
            AuritaPlayerPlugin.notifyLoadChildren(parentMediaId)
            Handler(Looper.getMainLooper()).postDelayed({
                val pending = AuritaPlayerPlugin.pendingFutures.remove(parentMediaId)
                if (pending != null && !pending.first.isDone) {
                    pending.first.set(LibraryResult.ofItemList(ImmutableList.of(), pending.second))
                }
            }, 5000)
            return future
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val item = AuritaPlayerPlugin.getCatalogItem(mediaId)
            return if (item != null) {
                Futures.immediateFuture(LibraryResult.ofItem(item, null))
            } else {
                Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_NOT_SUPPORTED))
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onCreate() {
        super.onCreate()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            notificationManager = getSystemService(NotificationManager::class.java)
        }
        createNotificationChannel()

        if (audioCache == null) {
            val cacheDir = File(cacheDir, "aurita_audio")
            val evictor  = LeastRecentlyUsedCacheEvictor(CACHE_SIZE_MB * 1024 * 1024)
            val dbProvider = androidx.media3.database.StandaloneDatabaseProvider(this)
            audioCache = SimpleCache(cacheDir, evictor, dbProvider)
        }

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(30_000)

        val upstreamFactory = DefaultDataSource.Factory(this, httpDataSourceFactory)
        val cacheDataSourceFactory = CacheDataSource.Factory()
            .setCache(audioCache!!)
            .setUpstreamDataSourceFactory(upstreamFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(5_000, 15_000, 200, 1_000)
            .build()

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(cacheDataSourceFactory))
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .setLoadControl(loadControl)
            .build()

        val activityIntent = packageManager
            .getLaunchIntentForPackage(packageName)
            ?.let { intent ->
                PendingIntent.getActivity(
                    this, 0, intent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            }

        mediaSession = MediaLibrarySession.Builder(this, player!!, libraryCallback)
            .apply { activityIntent?.let { setSessionActivity(it) } }
            .build()

        player?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                AuritaPlayerPlugin.notifyStateChange(player)
                updateNotification()
                if (isPlaying) {
                    acquireWakeLock()
                    progressHandler.removeCallbacks(progressRunnable)
                    progressHandler.postDelayed(progressRunnable, 250)
                } else {
                    releaseWakeLock()
                    progressHandler.removeCallbacks(progressRunnable)
                    player?.let { savePosition(it.currentPosition) }
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                AuritaPlayerPlugin.notifyStateChange(player)
                updateNotification()
            }

            override fun onPlaybackStateChanged(state: Int) {
                AuritaPlayerPlugin.notifyStateChange(player)
                if (state == Player.STATE_ENDED) {
                    releaseWakeLock()
                }
            }

            override fun onTimelineChanged(timeline: Timeline, reason: Int) {
                AuritaPlayerPlugin.notifyStateChange(player)
                updateNotification()
            }

            override fun onPlayerError(error: PlaybackException) {
                AuritaPlayerPlugin.notifyError(error.message ?: "Error de reproducción")
                retryCount++
                val delay = (retryCount.coerceAtMost(10) * 2000L).coerceAtMost(30_000L)
                retryHandler.removeCallbacks(retryRunnable)
                retryHandler.postDelayed(retryRunnable, delay)
            }
        })

        AuritaPlayerPlugin.attachPlayer(player)
        setupNetworkMonitor()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Reproducción de música",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Controles de reproducción de Aurita"
                setShowBadge(false)
            }
            notificationManager?.createNotificationChannel(channel)
        }
    }

    @Suppress("DEPRECATION")
    private fun buildNotification(): Notification {
        val p      = player
        val meta   = p?.currentMediaItem?.mediaMetadata
        val title  = meta?.title?.toString()  ?: "Aurita"
        val artist = meta?.artist?.toString() ?: ""
        val isPlaying = p?.isPlaying ?: false

        val contentIntent = packageManager
            .getLaunchIntentForPackage(packageName)
            ?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE) }

        fun actionPi(action: String, req: Int): PendingIntent =
            PendingIntent.getService(
                this, req,
                Intent(this, AuritaMediaService::class.java).setAction(action),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_previous, "Anterior", actionPi(ACTION_PREV, 1))
            .addAction(
                if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (isPlaying) "Pausa" else "Play",
                actionPi(if (isPlaying) ACTION_PAUSE else ACTION_RESUME, 2)
            )
            .addAction(android.R.drawable.ic_media_next, "Siguiente", actionPi(ACTION_NEXT, 3))
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(mediaSession?.sessionCompatToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
    }

    private fun updateNotification() {
        if (player == null) return
        val notification = buildNotification()
        try {
            startForeground(NOTIFICATION_ID, notification)
        } catch (_: Exception) {
            notificationManager?.notify(NOTIFICATION_ID, notification)
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = mediaSession

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        when (intent?.action) {
            ACTION_PAUSE  -> {
                player?.let { savePosition(it.currentPosition); it.pause() }
            }
            ACTION_RESUME -> {
                val p = player
                if (p != null && p.mediaItemCount > 0) {
                    if (p.playbackState == Player.STATE_ENDED) {
                        p.seekToDefaultPosition()
                        p.prepare()
                    }
                    p.play()
                } else {
                    restorePlayback()
                }
            }
            ACTION_PREV   -> {
                player?.let {
                    if (it.hasPreviousMediaItem()) it.seekToPrevious() else it.seekTo(0)
                    it.play()
                }
            }
            ACTION_NEXT   -> {
                player?.let {
                    it.seekToNext()
                    it.play()
                }
            }
            null -> {
                // Recreación del proceso: restaurar playback
                if (player?.mediaItemCount == 0) {
                    restorePlayback()
                }
            }
        }
        return START_STICKY
    }

    @Suppress("DEPRECATION")
    override fun onTaskRemoved(rootIntent: Intent?) {
        player?.let { savePosition(it.currentPosition) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        progressHandler.removeCallbacks(progressRunnable)
        retryHandler.removeCallbacks(retryRunnable)
        networkCallback?.let { connectivityManager?.unregisterNetworkCallback(it) }
        releaseWakeLock()
        AuritaPlayerPlugin.detachPlayer()
        notificationManager?.cancel(NOTIFICATION_ID)
        mediaSession?.run { player.release(); release(); mediaSession = null }
        super.onDestroy()
    }
}
