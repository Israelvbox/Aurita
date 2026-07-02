import { secureStore } from '../db/storage.js';

const DEVICE_NAME  = 'Aurita';
const APP_VERSION  = '0.1.0';

// Cada instalación de Aurita necesita su propio DeviceId único — Jellyfin
// identifica y gestiona sesiones por dispositivo. Antes usábamos una
// constante fija ('aurita-client') igual para TODAS las instalaciones del
// mundo, lo cual hacía que Jellyfin viera a usuarios distintos como "el
// mismo dispositivo" reconectándose, invalidando sesiones ajenas sin
// avisar (401 espontáneos). Se genera una vez y se guarda en secureStore.
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

// Campos estándar que necesitamos en todas las consultas de canciones.
// Definirlos en un solo lugar facilita la futura migración al servicio
// intermediario: solo habrá que cambiar esta constante.
const AUDIO_FIELDS = 'Genres,AlbumArtist,ArtistItems,UserData,RunTimeTicks';

function authHeader({ token, userId, deviceId } = {}) {
  let h = `MediaBrowser Client="${DEVICE_NAME}", Device="${DEVICE_NAME}", DeviceId="${deviceId}", Version="${APP_VERSION}"`;
  if (userId) h += `, UserId="${userId}"`;
  return h;
}

export class JellyfinClient {
  constructor() {
    this.baseUrl        = null;  // URL que el usuario escribió (servicio o Jellyfin directo)
    this.jellyfinUrl    = null;  // URL real de Jellyfin para audio/imágenes (enviada por el servicio tras auth)
    this.token          = null;
    this.userId         = null;
    this.deviceId       = null;
    this.connectionMode = 'direct'; // 'direct' | 'service'
  }

  /* ---------- Sesión ---------- */

  async restoreSession() {
    const [baseUrl, token, userId, mode, jellyfinUrl, deviceId] = await Promise.all([
      secureStore.get('jf_baseUrl'),
      secureStore.get('jf_token'),
      secureStore.get('jf_userId'),
      secureStore.get('jf_mode'),
      secureStore.get('jf_jellyfinUrl'),
      getDeviceId(),
    ]);
    if (baseUrl && token && userId) {
      this.baseUrl        = baseUrl;
      this.token          = token;
      this.userId         = userId;
      this.connectionMode = mode || 'direct';
      this.jellyfinUrl    = jellyfinUrl || baseUrl;
      this.deviceId       = deviceId;
      return true;
    }
    return false;
  }

  async login(serverUrl, username, password, mode = 'direct') {
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
    this.baseUrl        = baseUrl;
    this.token          = data.AccessToken;
    this.userId         = data.User.Id;
    this.deviceId        = deviceId;
    this.connectionMode = mode;
    // Si el servidor es el intermediario, devuelve la URL real de Jellyfin
    // para audio e imágenes. En modo directo, es la misma baseUrl.
    this.jellyfinUrl    = data.AuritaJellyfinUrl || baseUrl;

    await Promise.all([
      secureStore.set('jf_baseUrl',     baseUrl),
      secureStore.set('jf_token',       this.token),
      secureStore.set('jf_userId',      this.userId),
      secureStore.set('jf_mode',        mode),
      secureStore.set('jf_jellyfinUrl', this.jellyfinUrl),
    ]);

    return data.User;
  }

  async logout() {
    // El deviceId identifica esta instalación, no esta sesión — lo
    // preservamos para que Jellyfin no vea un "dispositivo nuevo" cada vez
    // que alguien cierra sesión y vuelve a entrar.
    const deviceId = await getDeviceId();
    await secureStore.clear();
    await secureStore.set('jf_deviceId', deviceId);
    this.baseUrl        = null;
    this.jellyfinUrl    = null;
    this.token          = null;
    this.userId         = null;
    this.connectionMode = 'direct';
  }

  get isAuthenticated() {
    return !!(this.baseUrl && this.token && this.userId);
  }

  /* ---------- HTTP base ---------- */

  async request(path, { method = 'GET', body, query } = {}) {
    if (!this.isAuthenticated) throw new Error('No autenticado');
    // IMPORTANTE: usamos jellyfinUrl (URL real de Jellyfin) para todas las
    // llamadas directas. En modo directo jellyfinUrl === baseUrl. En modo
    // servicio, baseUrl = URL del intermediario y jellyfinUrl = Jellyfin real,
    // así las mutaciones (favoritos, playlists, etc.) llegan al sitio correcto.
    const base = this.jellyfinUrl || this.baseUrl;
    const url = new URL(`${base}${path}`);
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
      throw new Error(`Jellyfin ${method} ${path}: HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---------- URLs de recursos ---------- */

  imageUrl(itemId, type = 'Primary', maxSize = 300, tag = null) {
    if (!itemId) return null;
    // Las imágenes van siempre directo a Jellyfin, no al intermediario
    const base = this.jellyfinUrl || this.baseUrl;
    const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
    return `${base}/Items/${itemId}/Images/${type}?maxWidth=${maxSize}&maxHeight=${maxSize}&quality=85${tagParam}`;
  }

  streamUrl(itemId) {
    // El audio siempre directo a Jellyfin: evita latencia del intermediario
    const base = this.jellyfinUrl || this.baseUrl;
    return `${base}/Audio/${itemId}/universal?UserId=${this.userId}&DeviceId=${this.deviceId}&api_key=${this.token}&Container=opus,mp3,aac,m4a,flac&TranscodingContainer=aac&AudioCodec=aac&MaxStreamingBitrate=320000`;
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
    return this.request('/MusicGenres', {
      query: { UserId: this.userId, SortBy: 'SortName' },
    });
  }

  searchItems(term, limit = 40) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        SearchTerm: term.trim(),
        IncludeItemTypes: 'Audio,MusicArtist',
        Recursive: true,
        Limit: limit,
        Fields: `${AUDIO_FIELDS},ProductionYear`,
      },
    });
  }

  getPlaylistItems(playlistId) {
    return this.request(`/Playlists/${playlistId}/Items`, {
      query: { UserId: this.userId, Fields: AUDIO_FIELDS },
    });
  }

  getAlbumItems(albumId) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: { ParentId: albumId, SortBy: 'IndexNumber', Fields: AUDIO_FIELDS },
    });
  }

  getInstantMix(itemId, limit = 20) {
    return this.request(`/Items/${itemId}/InstantMix`, {
      query: { UserId: this.userId, Limit: limit, Fields: AUDIO_FIELDS },
    });
  }

  // Usado por el motor de mixes para buscar canciones de un género concreto
  // a partir de su nombre de texto (el historial local solo guarda el nombre).
  getItemsByGenre(genre, limit = 50) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Genres: genre,
        Recursive: true,
        Limit: limit,
        SortBy: 'CommunityRating,Random',
        SortOrder: 'Descending',
        Fields: AUDIO_FIELDS,
      },
    });
  }

  // Descarga toda la biblioteca de audio para construir el índice de géneros
  // en el cliente (cuando el servidor no filtra bien por GenreIds/Genres).
  getAllAudio(limit = 5000) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Recursive: true,
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  // Géneros de álbumes: muchas bibliotecas etiquetan el género a nivel de
  // álbum en vez de en cada pista individual; esto lo usamos para heredar.
  getAllAlbumsGenres(limit = 3000) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicAlbum',
        Recursive: true,
        Limit: limit,
        Fields: 'Genres',
      },
    });
  }

  getItemInfo(itemId) {
    return this.request(`/Users/${this.userId}/Items/${itemId}`);
  }

  getArtistAlbums(artistId, limit = 30) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'MusicAlbum',
        ArtistIds: artistId,
        Recursive: true,
        Limit: limit,
        SortBy: 'ProductionYear',
        SortOrder: 'Descending',
        Fields: `${AUDIO_FIELDS},ProductionYear`,
      },
    });
  }

  getArtistTopSongs(artistId, limit = 10) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        ArtistIds: artistId,
        Recursive: true,
        Limit: limit,
        SortBy: 'CommunityRating,PlayCount',
        SortOrder: 'Descending',
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getFavoriteSongs(limit = 500) {
    return this.request(`/Users/${this.userId}/Items`, {
      query: {
        IncludeItemTypes: 'Audio',
        Filters: 'IsFavorite',
        Recursive: true,
        Limit: limit,
        Fields: AUDIO_FIELDS,
      },
    });
  }

  getUserPlaylists() {
    return this.request(`/Users/${this.userId}/Items`, {
      query: { IncludeItemTypes: 'Playlist', Recursive: true, Limit: 100 },
    });
  }

  setFavorite(itemId, isFavorite) {
    return this.request(`/Users/${this.userId}/FavoriteItems/${itemId}`, {
      method: isFavorite ? 'POST' : 'DELETE',
    });
  }

  markPlayed(itemId) {
    return this.request(`/Users/${this.userId}/PlayedItems/${itemId}`, { method: 'POST' });
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
      body: { Name: newName, Ids: ids, Users: [], IsPublic: false },
    });
  }


  deletePlaylist(playlistId) {
    return this.request(`/Items/${playlistId}`, { method: 'DELETE' });
  }

  addToPlaylist(playlistId, itemIds) {
    return this.request(`/Playlists/${playlistId}/Items`, {
      method: 'POST',
      query: { Ids: itemIds.join(','), UserId: this.userId },
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
