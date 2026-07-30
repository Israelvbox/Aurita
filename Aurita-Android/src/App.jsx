import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { useAuthStore } from './store/authStore.js';
import { useFavoritesStore } from './store/favoritesStore.js';
import { usePlaylistMembershipStore } from './store/playlistMembershipStore.js';
import { usePlayerStore, ignoreStateEvents } from './store/playerStore.js';
import { useOfflineStore } from './store/offlineStore.js';
import { useNetworkStatsStore } from './store/networkStatsStore.js';
import { useToastStore } from './store/toastStore.js';
import { warmGenreIndex } from './api/genreIndex.js';
import { service } from './api/service.js';
import { setHomeCache } from './pages/Home.jsx';
import { startSyncPolling, stopSyncPolling, onAppResumed } from './api/cacheManager.js';
import { pruneExpired } from './api/imageCache.js';
import { sendCatalogToNative, requestBluetoothPermission } from './api/androidAuto.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Library from './pages/Library.jsx';
import Favorites from './pages/Favorites.jsx';
import PlaylistDetail from './pages/PlaylistDetail.jsx';
import ArtistDetail from './pages/ArtistDetail.jsx';
import Settings from './pages/Settings.jsx';
import MixDetail from './pages/MixDetail.jsx';
import Downloads from './pages/Downloads.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import logo from './assets/logo.png';

export default function App() {
  const { status, restore, logout } = useAuthStore();

  useEffect(() => { restore(); }, [restore]);

  useEffect(() => {
    function handleUnauthorized() {
      console.warn('[Aurita] Sesión inválida, volviendo al login.');
      logout();
    }
    window.addEventListener('aurita:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('aurita:unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    LocalNotifications.requestPermissions().catch(() => {});
    requestBluetoothPermission();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    Network.getStatus().then((s) => {
      useOfflineStore.getState().setOffline(!s.connected);
      useNetworkStatsStore.getState().setConnectionType(s.connectionType);
    });
    const handler = Network.addListener('networkStatusChange', (s) => {
      const wasOffline = useOfflineStore.getState().isOffline;
      const toast = useToastStore.getState().show;
      useOfflineStore.getState().setOffline(!s.connected);
      useNetworkStatsStore.getState().setConnectionType(s.connectionType);
      if (wasOffline && s.connected) {
        toast('Conexión restablecida', 'success');
        onAppResumed();
        ignoreStateEvents(true);
        usePlayerStore.getState().syncFromPlayer();
        setTimeout(() => ignoreStateEvents(false), 500);
      } else if (!wasOffline && !s.connected) {
        toast('Sin conexión', 'error');
      }
    });
    return () => { handler.remove(); };
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    warmGenreIndex();
    useFavoritesStore.getState().hydrate();
    usePlaylistMembershipStore.getState().hydrate();
    useOfflineStore.getState().hydrate();
    useOfflineStore.getState().startListening();
    service.refreshLocalIndex().catch(() => {});

    usePlayerStore.getState().restoreQueue();
    pruneExpired();

    service.getStartupData().then((data) => {
      if (!data) return;
      if (data.playlists?.Items) setHomeCache(data.playlists.Items, data.genres);
      if (data.favorites?.Items) {
        const ids = new Set(data.favorites.Items.map(i => i.Id));
        useFavoritesStore.getState().setFromStartup(ids, data.favorites.Items);
      }
      sendCatalogToNative(data.playlists?.Items);
    }).catch(() => {});

    // Polling de sync: cada 30s comprueba si el servidor tiene datos nuevos
    startSyncPolling();
    return () => {
      stopSyncPolling();
      useOfflineStore.getState().stopListening();
    };
  }, [status]);

  // Cuando el usuario vuelve a la app (desde multitarea, llamada, etc.)
  // revalidamos favoritos silenciosamente, comprobamos sync nueva y re-poblamos cola nativa
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && status === 'authenticated') {
        usePlayerStore.getState().persistNow();
      } else if (!document.hidden && status === 'authenticated') {
        onAppResumed();
        ignoreStateEvents(true);
        usePlayerStore.getState().syncFromPlayer();
        setTimeout(() => ignoreStateEvents(false), 500);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [status]);

  if (status === 'idle' || status === 'checking') {
    return (
      <div className="boot-screen">
        <img src={logo} alt="" className="boot-screen__icon" />
        <div className="boot-screen__title">Aurita</div>
        <div className="boot-screen__sub">Cargando tu música…</div>
      </div>
    );
  }

  if (status === 'unauthenticated') return <Login />;

  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/"             element={<Home />} />
          <Route path="/buscar"       element={<Search />} />
          <Route path="/biblioteca"   element={<Library />} />
          <Route path="/favoritos"    element={<Favorites />} />
          <Route path="/playlist/:id" element={<PlaylistDetail />} />
          <Route path="/artist/:id"   element={<ArtistDetail />} />
          <Route path="/ajustes"      element={<Settings />} />
          <Route path="/mix"          element={<MixDetail />} />
          <Route path="/descargas"    element={<Downloads />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      <ToastContainer />
    </Layout>
  );
}
