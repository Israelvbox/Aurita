import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuthStore } from './store/authStore.js';
import { useFavoritesStore } from './store/favoritesStore.js';
import { usePlaylistMembershipStore } from './store/playlistMembershipStore.js';
import { usePlayerStore } from './store/playerStore.js';
import { warmGenreIndex } from './api/genreIndex.js';
import { service } from './api/service.js';
import { setHomeCache } from './pages/Home.jsx';
import { startSyncPolling, stopSyncPolling, onAppResumed } from './api/cacheManager.js';
import { pruneExpired } from './api/imageCache.js';
import { sendCatalogToNative } from './api/androidAuto.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Library from './pages/Library.jsx';
import Favorites from './pages/Favorites.jsx';
import PlaylistDetail from './pages/PlaylistDetail.jsx';
import ArtistDetail from './pages/ArtistDetail.jsx';
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
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    warmGenreIndex();
    useFavoritesStore.getState().hydrate();
    usePlaylistMembershipStore.getState().hydrate();
    service.refreshLocalIndex().catch(() => {});

    usePlayerStore.getState().restoreQueue();
    pruneExpired();

    service.getStartupData().then((data) => {
      if (!data) return;
      if (data.playlists?.Items) setHomeCache(data.playlists.Items);
      if (data.favorites?.Items) {
        const ids = new Set(data.favorites.Items.map(i => i.Id));
        useFavoritesStore.getState().setFromStartup(ids, data.favorites.Items);
      }
      sendCatalogToNative(data.playlists?.Items);
    }).catch(() => {});

    // Polling de sync: cada 30s comprueba si el servidor tiene datos nuevos
    startSyncPolling();
    return () => stopSyncPolling();
  }, [status]);

  // Cuando el usuario vuelve a la app (desde multitarea, llamada, etc.)
  // revalidamos favoritos silenciosamente, comprobamos sync nueva y re-poblamos cola nativa
  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden && status === 'authenticated') {
        onAppResumed();
        usePlayerStore.getState().restoreQueue();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [status]);

  if (status === 'idle' || status === 'checking') {
    return (
      <div className="boot-screen">
        <img src={logo} alt="" className="boot-screen__icon" />
        <span>Aurita</span>
      </div>
    );
  }

  if (status === 'unauthenticated') return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/"             element={<Home />} />
        <Route path="/buscar"       element={<Search />} />
        <Route path="/biblioteca"   element={<Library />} />
        <Route path="/favoritos"    element={<Favorites />} />
        <Route path="/playlist/:id" element={<PlaylistDetail />} />
        <Route path="/artist/:id"   element={<ArtistDetail />} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
