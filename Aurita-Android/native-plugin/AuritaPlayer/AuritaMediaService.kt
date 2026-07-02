package com.aurita.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
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

    private val progressHandler = Handler(Looper.getMainLooper())
    private val progressRunnable = object : Runnable {
        override fun run() {
            val p = player ?: return
            if (p.isPlaying) {
                AuritaPlayerPlugin.notifyStateChange(p)
                progressHandler.postDelayed(this, 250)
            }
        }
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
            .setConnectTimeoutMs(8_000)
            .setReadTimeoutMs(8_000)

        val cacheDataSourceFactory = CacheDataSource.Factory()
            .setCache(audioCache!!)
            .setUpstreamDataSourceFactory(httpDataSourceFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(2_000, 8_000, 100, 1_000)
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
                    progressHandler.removeCallbacks(progressRunnable)
                    progressHandler.postDelayed(progressRunnable, 250)
                } else {
                    progressHandler.removeCallbacks(progressRunnable)
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                AuritaPlayerPlugin.notifyStateChange(player)
                updateNotification()
            }

            override fun onPlaybackStateChanged(state: Int) {
                AuritaPlayerPlugin.notifyStateChange(player)
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                AuritaPlayerPlugin.notifyError(error.message ?: "Error de reproducción")
            }
        })

        AuritaPlayerPlugin.attachPlayer(player)
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
            .setOngoing(isPlaying)
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
        val p = player ?: return
        val notification = buildNotification()
        if (p.isPlaying) {
            startForeground(NOTIFICATION_ID, notification)
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_DETACH)
            } else {
                @Suppress("DEPRECATION") stopForeground(false)
            }
            notificationManager?.notify(NOTIFICATION_ID, notification)
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = mediaSession

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        when (intent?.action) {
            ACTION_PAUSE  -> player?.pause()
            ACTION_RESUME -> player?.play()
            ACTION_PREV   -> AuritaPlayerPlugin.triggerPrev()
            ACTION_NEXT   -> AuritaPlayerPlugin.triggerNext()
        }

        if (intent?.getBooleanExtra("resume_from_cold_start", false) == true) {
            val url = intent.getStringExtra("resume_url")
            if (!url.isNullOrEmpty()) {
                val metadata = MediaMetadata.Builder()
                    .setTitle(intent.getStringExtra("resume_title") ?: "")
                    .setArtist(intent.getStringExtra("resume_artist") ?: "")
                    .setAlbumTitle(intent.getStringExtra("resume_album") ?: "")
                    .apply {
                        intent.getStringExtra("resume_artwork")
                            ?.takeIf { it.isNotEmpty() }
                            ?.let { setArtworkUri(android.net.Uri.parse(it)) }
                    }
                    .build()
                val item = MediaItem.Builder().setUri(url).setMediaMetadata(metadata).build()
                player?.apply { setMediaItem(item); prepare(); play() }
            }
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (player?.isPlaying != true) stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        progressHandler.removeCallbacks(progressRunnable)
        AuritaPlayerPlugin.detachPlayer()
        notificationManager?.cancel(NOTIFICATION_ID)
        mediaSession?.run { player.release(); release(); mediaSession = null }
        super.onDestroy()
    }
}
