import { registerPlugin } from '@capacitor/core';
import { jellyfin } from './jellyfin.js';
import { service } from './service.js';

const AuritaPlayer = registerPlugin('AuritaPlayer');

async function sendItems(parentId, items) {
  try { await AuritaPlayer.setCatalogItems({ parentId, items }); } catch {}
}

export async function sendCatalogToNative(playlists) {
  await sendItems('__ROOT__', (playlists || []).map((p) => ({
    id: `playlist:${p.Id}`, title: p.Name, subtitle: '',
    artworkUri: jellyfin.imageUrl(p.Id, 'Primary', 300),
  })));
}

export async function requestBluetoothPermission() {
  try { await AuritaPlayer.requestBluetoothPermission(); } catch {}
}

// ── Lazy loading desde Android Auto ──────────────────────────

AuritaPlayer.addListener('loadChildren', async (data) => {
  const parentId = data.parentId;
  if (!parentId) return;

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
    }
  } catch {
    await AuritaPlayer.sendChildren({ parentId, items: [] }).catch(() => {});
  }
});
