import { secureStore } from '../db/storage.js';

const DEVICE_NAME  = 'Aurita';
const APP_VERSION  = '0.1.0';

let _deviceId = null;

async function getDeviceId() {
  if (_deviceId) return _deviceId;
  let stored = await secureStore.get('jf_deviceId');
  if (!stored) {
    stored = `aurita-${crypto.randomUUID()}`;
    await secureStore.set('jf_deviceId', stored);
  }
  _deviceId = stored;
  return stored;
}

const AUDIO_FIELDS = 'Genres,AlbumArtist,ArtistItems,UserData,RunTimeTicks';

function authHeader({ token, userId, deviceId } = {}) {
  let h = `MediaBrowser Client="${DEVICE_NAME}", Device="${DEVICE_NAME}", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
  if (userId) h += `, UserId="${userId}"`;
  return h;
}

export class JellyfinClient {
  constructor() {
    this.baseUrl  = null;
    this.token    = null;
    this.userId   = null;
    this.deviceId = null;
  }

  /* ---------- Sesión ---------- */

  async restoreSession() {
    const [baseUrl, token, userId, deviceId] = await Promise.all([
      secureStore.get('jf_baseUrl'),
      secureStore.get('jf_token'),
      secureStore.get('jf_userId'),
      getDeviceId(),
    ]);
    if (baseUrl && token && userId) {
      this.baseUrl  = baseUrl;
      this.token    = token;
      this.userId   = userId;
      this.deviceId = deviceId;
      return true;
    }
    return false;
  }

  async login(serverUrl, username, password) {
    const baseUrl = serverUrl.replace(/\/+$/, '');
    const deviceId = await getDeviceId();
    const res = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': authHeader({ deviceId }),
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('Usuario o contraseña incorrectos');
      throw new Error(`No se pudo conectar al servidor (HTTP ${res.status})`);
    }

    const data = await res.json();
    this.baseUrl  = baseUrl;
    this.token    = data.AccessToken;
    this.userId   = data.User.Id;
    this.deviceId = deviceId;

    await Promise.all([
      secureStore.set('jf_baseUrl', baseUrl),
      secureStore.set('jf_token',   this.token),
      secureStore.set('jf_userId',  this.userId),
    ]);

    return data.User;
  }

  async logout() {
    const deviceId = await getDeviceId();
    await secureStore.clear();
    await secureStore.set('jf_deviceId', deviceId);
    this.baseUrl  = null;
    this.token    = null;
    this.userId   = null;
  }

  get isAuthenticated() {
    return !!(this.baseUrl && this.token && this.userId);
  }

  /* ---------- HTTP base ---------- */

  async request(path, { method = 'GET', body, query } = {}) {
    if (!this.isAuthenticated) throw new Error('No autenticado');
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': authHeader({ token: this.token, userId: this.userId, deviceId: this.deviceId }),
        'X-Emby-Token': this.token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent('aurita:unauthorized'));
      throw new Error(`Aurita ${method} ${path}: HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---------- URLs de recursos ---------- */

  imageUrl(itemId, type = 'Primary', maxSize = 300, tag = null) {
    if (!itemId) return null;
    const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
    return `${this.baseUrl}/images/${itemId}/${type}?maxWidth=${maxSize}&maxHeight=${maxSize}&quality=85${tagParam}`;
  }

  streamUrl(itemId) {
    return `${this.baseUrl}/audio/${itemId}/stream.mp3?UserId=${this.userId}&DeviceId=${this.deviceId}&api_key=${this.token}&Static=true`;
  }

  /* ---------- Consultas ---------- */

  getRecentPlaylists(limit = 4) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Playlist',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: limit,
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
      },
    });
  }

  getGenres() {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicGenre',
        Recursive: true,
        SortBy: 'SortName',
      },
    });
  }

  getPopularArtists(limit = 50) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicArtist',
        Recursive: true,
        SortBy: 'CommunityRating',
        SortOrder: 'Descending',
        Limit: limit,
        Fields: 'PrimaryImageAspectRatio,SortName',
        ImageTypeLimit: 1,
      },
    });
  }

  getPlaylists() {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Playlist',
        Recursive: true,
        SortBy: 'SortName',
        Fields: 'PrimaryImageAspectRatio,SortName',
      },
    });
  }

  searchItems(term, limit = 40) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        SearchTerm: term.trim(),
        IncludeItemTypes: 'Audio,MusicArtist',
        Recursive: true,
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getInstantMix(itemId, limit = 20) {
    return this.request(`/Items/${itemId}/InstantMix`, {
      query: {
        UserId: this.userId,
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getUserViews() {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'CollectionFolder',
        SortBy: 'SortName',
        Recursive: true,
      },
    });
  }

  getAlbumItems(albumId) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        ParentId: albumId,
        IncludeItemTypes: 'Audio',
        SortBy: 'SortName',
        Recursive: true,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getPlaylistItems(playlistId) {
    return this.request(`/Playlists/${playlistId}/Items`, {
      query: {
        UserId: this.userId,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getItemInfo(itemId) {
    return this.request(`/Users/${this.userId}/Items/${itemId}`);
  }

  getFavoriteSongs(limit = 500) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        Filters: 'IsFavorite',
        IncludeItemTypes: 'Audio',
        Recursive: true,
        SortBy: 'SortName',
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getAllAudio(limit = 5000) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Recursive: true,
        SortBy: 'SortName',
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getAllAlbumsGenres(limit = 3000) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicAlbum,MusicGenre',
        Recursive: true,
        SortBy: 'SortName',
        Limit: limit,
        Fields: 'Genres,AlbumArtist,ArtistItems,PrimaryImageAspectRatio',
      },
    });
  }

  getItemsByGenre(genre, limit = 50) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Recursive: true,
        SortBy: 'SortName',
        Limit: limit,
        GenreIds: genre,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getArtistAlbums(artistId, limit = 30) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicAlbum',
        Recursive: true,
        SortBy: 'ProductionYear,SortName',
        SortOrder: 'Descending',
        Limit: limit,
        ArtistIds: artistId,
        Fields: 'PrimaryImageAspectRatio,ProductionYear',
      },
    });
  }

  getArtistTopSongs(artistId, limit = 10) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Recursive: true,
        SortBy: 'CommunityRating',
        SortOrder: 'Descending',
        Limit: limit,
        ArtistIds: artistId,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  async markPlayed(itemId) {
    await this.request(`/Users/${this.userId}/PlayedItems/${itemId}`, { method: 'POST' });
  }

  async addFavorite(itemId) {
    await this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, { method: 'POST' });
  }

  async removeFavorite(itemId) {
    await this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, { method: 'DELETE' });
  }

  async setFavorite(itemId, isFavorite) {
    if (isFavorite) return this.addFavorite(itemId);
    return this.removeFavorite(itemId);
  }

  /* ---------- Playlists ---------- */

  createPlaylist(name, itemIds = []) {
    return this.request('/Playlists', {
      method: 'POST',
      body: {
        Name: name,
        Ids: itemIds,
        UserId: this.userId,
        MediaType: 'Audio',
        Users: [],
        IsPublic: false,
      },
    });
  }

  async renamePlaylist(playlistId, newName) {
    const itemsRes = await this.getPlaylistItems(playlistId);
    const ids = (itemsRes.Items || []).map((i) => i.Id);
    return this.request(`/Playlists/${playlistId}`, {
      method: 'POST',
      body: { Name: newName, Ids: ids, IsPublic: false, Users: [] },
    });
  }

  deletePlaylist(playlistId) {
    return this.request(`/Items/${playlistId}`, { method: 'DELETE' });
  }

  addToPlaylist(playlistId, itemIds) {
    const idsStr = itemIds.map(id => `Ids=${encodeURIComponent(id)}`).join('&');
    return this.request(`/Playlists/${playlistId}/Items?${idsStr}`, {
      method: 'POST',
      query: { UserId: this.userId },
    });
  }

  removeFromPlaylist(playlistId, entryIds) {
    return this.request(`/Playlists/${playlistId}/Items`, {
      method: 'DELETE',
      query: { EntryIds: entryIds.join(',') },
    });
  }
}

export const jellyfin = new JellyfinClient();
