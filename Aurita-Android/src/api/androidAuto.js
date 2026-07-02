import { registerPlugin } from '@capacitor/core';
import { jellyfin } from './jellyfin.js';
import { service } from './service.js';
import { getGenreIndex } from './genreIndex.js';
import { getServiceUrl } from './config.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

async function sendItems(parentId, items) {
  try { await AuritaPlayer.setCatalogItems({ parentId, items }); } catch {}
}

export async function sendCatalogToNative(playlists) {
  await sendItems('__ROOT__', [
    { id: 'playlists', title: 'Playlists' },
    { id: 'artists',   title: 'Artistas' },
    { id: 'albums',    title: 'Álbumes' },
    { id: 'genres',    title: 'Géneros' },
  ]);

  // Siempre poblar playlists (aunque sea vacío) para evitar futures colgados
  await sendItems('playlists', (playlists || []).map((p) => ({
    id: `playlist:${p.Id}`, title: p.Name, subtitle: 'Playlist',
    artworkUri: jellyfin.imageUrl(p.Id, 'Primary', 300),
  })));

  // Siempre poblar géneros
  let genres = [];
  if (getServiceUrl()) {
    try {
      const res = await service.getGenres();
      genres = res.Items || [];
    } catch {}
  } else {
    const idx = await getGenreIndex({ forceRefresh: false });
    genres = Object.keys(idx).map((name) => ({ Name: name }));
  }
  await sendItems('genres', genres.map((g) => ({
    id: `genre:${g.Name}`, title: g.Name,
  })));
}

// ── Lazy loading desde Android Auto ──────────────────────────

AuritaPlayer.addListener('loadChildren', async (data) => {
  const parentId = data.parentId;
  if (!parentId) return;

  if (parentId === '__ROOT__') {
    await AuritaPlayer.sendChildren({ parentId: '__ROOT__', items: [
      { id: 'playlists', title: 'Playlists' },
      { id: 'artists',   title: 'Artistas' },
      { id: 'albums',    title: 'Álbumes' },
      { id: 'genres',    title: 'Géneros' },
    ]});
    return;
  }

  try {
    if (parentId.startsWith('playlist:')) {
      const id = parentId.slice(9);
      const res = await service.getPlaylistItems(id);
      const items = (res.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id),
        artworkUri: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });

    } else if (parentId.startsWith('artist:')) {
      const id = parentId.slice(7);
      const [albumsRes, songsRes] = await Promise.all([
        service.getArtistAlbums(id, 20),
        service.getArtistTopSongs(id, 10),
      ]);
      const albums = (albumsRes.Items || []).map((a) => ({
        id: `album:${a.Id}`, title: a.Name, subtitle: `${a.ProductionYear || ''}`,
        artworkUri: jellyfin.imageUrl(a.Id, 'Primary', 300),
      }));
      const songs = (songsRes.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id),
        artworkUri: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items: [
        { id: `${parentId}::top`, title: 'Populares', subtitle: '' },
        { id: `${parentId}::albums`, title: 'Álbumes', subtitle: '' },
      ]});
      await AuritaPlayer.setCatalogItems({ parentId: `${parentId}::top`, items: songs });
      await AuritaPlayer.setCatalogItems({ parentId: `${parentId}::albums`, items: albums });

    } else if (parentId.startsWith('album:')) {
      const id = parentId.slice(6);
      const res = await service.getAlbumItems(id);
      const items = (res.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id),
        artworkUri: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });

    } else if (parentId.startsWith('genre:')) {
      const name = parentId.slice(6);
      const res = await service.getItemsByGenre(name, 200);
      const items = (res.Items || []).map((t) => ({
        id: `track:${t.Id}`, title: t.Name,
        subtitle: t.AlbumArtist || (t.Artists || []).join(', '),
        uri: jellyfin.streamUrl(t.Id),
        artworkUri: jellyfin.imageUrl(t.AlbumId || t.Id, 'Primary', 300),
      }));
      await AuritaPlayer.sendChildren({ parentId, items });

    } else if (parentId === 'playlists' || parentId === 'genres') {
      await AuritaPlayer.sendChildren({ parentId, items: [] });

    } else if (parentId === 'artists' || parentId === 'albums') {
      // Pedir artistas/álbumes destacados
      try {
        const res = await jellyfin.request(`/Users/${jellyfin.userId}/Items`, {
          query: {
            IncludeItemTypes: parentId === 'artists' ? 'MusicArtist' : 'MusicAlbum',
            Recursive: true,
            Limit: 100,
            SortBy: 'SortName',
            SortOrder: 'Ascending',
            Fields: 'Genres,ProductionYear',
          },
        });
        const items = (res.Items || []).map((x) => ({
          id: parentId === 'artists' ? `artist:${x.Id}` : `album:${x.Id}`,
          title: x.Name,
          subtitle: parentId === 'albums' ? `${x.ProductionYear || ''}` : '',
          artworkUri: jellyfin.imageUrl(x.Id, 'Primary', 300),
        }));
        await AuritaPlayer.sendChildren({ parentId, items });
      } catch {
        await AuritaPlayer.sendChildren({ parentId, items: [] });
      }
    }
  } catch {
    await AuritaPlayer.sendChildren({ parentId, items: [] }).catch(() => {});
  }
});
