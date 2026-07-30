import { registerPlugin } from '@capacitor/core';
import { jellyfin } from './jellyfin.js';
import { service } from './service.js';
import { useSettingsStore } from '../store/settingsStore.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

async function sendItems(parentId, items) {
  try { await AuritaPlayer.setCatalogItems({ parentId, items }); } catch {}
}

export async function sendCatalogToNative(playlists) {
  const rootItems = [
    { id: 'artists', title: 'Artistas', subtitle: '', artworkUrl: '' },
    { id: 'albums', title: 'Álbumes', subtitle: '', artworkUrl: '' },
    ...(playlists || []).map((p) => ({
      id: `playlist:${p.Id}`, title: p.Name, subtitle: '',
      artworkUrl: jellyfin.imageUrl(p.Id, 'Primary', 300),
    })),
  ];
  await sendItems('__ROOT__', rootItems);
}

export async function requestBluetoothPermission() {
  try { await AuritaPlayer.requestBluetoothPermission(); } catch {}
}

// ── Lazy loading desde Android Auto ──────────────────────────

AuritaPlayer.addListener('loadChildren', async (data) => {
  const parentId = data.parentId;
  if (!parentId) return;

  try {
    if (parentId === '__ROOT__') {
      const rootItems = [
        { id: 'artists', title: 'Artistas', subtitle: '', artworkUrl: '' },
        { id: 'albums', title: 'Álbumes', subtitle: '', artworkUrl: '' },
      ];
      const res = await jellyfin.getPlaylists();
      for (const p of (res.Items || [])) {
        rootItems.push({
          id: `playlist:${p.Id}`, title: p.Name, subtitle: '',
          artworkUrl: jellyfin.imageUrl(p.Id, 'Primary', 300),
        });
      }
      await AuritaPlayer.sendChildren({ parentId, items: rootItems });
    } else if (parentId.startsWith('playlist:')) {
      const id = parentId.slice(9);
      let res;
      try {
        res = await service.getPlaylistItems(id);
      } catch {
        res = await jellyfin.getPlaylistItems(id);
      }
      const items = (res.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id, useSettingsStore.getState().audioBitrate),
        artworkUrl: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });
    } else if (parentId.startsWith('artist:')) {
      const id = parentId.slice(7);
      const res = await jellyfin.getArtistAlbums(id);
      const items = (res.Items || []).map((a) => ({
        id: `album:${a.Id}`, title: a.Name,
        subtitle: a.AlbumArtist || '',
        artworkUrl: jellyfin.imageUrl(a.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });
    } else if (parentId.startsWith('album:')) {
      const id = parentId.slice(6);
      const res = await jellyfin.getAlbumItems(id);
      const items = (res.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id, useSettingsStore.getState().audioBitrate),
        artworkUrl: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });
    } else if (parentId === 'artists') {
      const res = await jellyfin.request(`/Users/${jellyfin.userId}/Items`, {
        query: {
          IncludeItemTypes: 'MusicArtist',
          Recursive: true,
          SortBy: 'SortName',
          Limit: 200,
          Fields: 'PrimaryImageAspectRatio',
        },
      });
      const items = (res.Items || []).map((a) => ({
        id: `artist:${a.Id}`, title: a.Name, subtitle: '',
        artworkUrl: jellyfin.imageUrl(a.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });
    } else if (parentId === 'albums') {
      const res = await jellyfin.request(`/Users/${jellyfin.userId}/Items`, {
        query: {
          IncludeItemTypes: 'MusicAlbum',
          Recursive: true,
          SortBy: 'SortName',
          Limit: 200,
          Fields: 'PrimaryImageAspectRatio,AlbumArtist',
        },
      });
      const items = (res.Items || []).map((a) => ({
        id: `album:${a.Id}`, title: a.Name,
        subtitle: a.AlbumArtist || '',
        uri: '',
        artworkUrl: jellyfin.imageUrl(a.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });
    }
  } catch {
    await AuritaPlayer.sendChildren({ parentId, items: [] }).catch(() => {});
  }
});
