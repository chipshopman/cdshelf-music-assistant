export const albumKey = album => `${album.provider || 'library'}:${album.item_id}`;
export const artistName = album => (album.artists || []).map(artist => artist.name).filter(Boolean).join(', ') || 'Unknown artist';

// Fetch every page, rather than silently truncating at the original 300 albums.
export async function loadAlbumLibrary(client, { onProgress = () => {}, cancelled = () => false, pageSize = 200 } = {}) {
  const albums = new Map();
  for (let offset = 0; ; offset += pageSize) {
    if (cancelled()) return null;
    const page = await client.albumPage(offset, pageSize);
    if (cancelled()) return null;
    if (!Array.isArray(page)) throw new Error('Unexpected album response from Music Assistant.');
    let added = 0;
    for (const album of page) {
      if (album.item_id == null) continue;
      const key = albumKey(album); if (!albums.has(key)) added++;
      albums.set(key, album);
    }
    onProgress(albums.size);
    if (page.length < pageSize) break;
    if (!added) throw new Error('Music Assistant repeated an album page. Refresh the library and try again.');
  }
  return [...albums.values()];
}

export function filterAlbums(albums, search = '', sort = 'artist') {
  const needle = search.trim().toLocaleLowerCase();
  return albums.filter(album => `${artistName(album)} ${album.name || ''} ${album.version || ''}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => {
      const firstA = sort === 'title' ? a.name || '' : artistName(a);
      const firstB = sort === 'title' ? b.name || '' : artistName(b);
      return firstA.localeCompare(firstB, undefined, { numeric: true, sensitivity: 'base' }) || (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }) || albumKey(a).localeCompare(albumKey(b));
    });
}

export function artworkUrl(album, address, size = 512) {
  const image = album.image || album.metadata?.images?.find(image => image.type === 'thumb') || album.metadata?.images?.[0];
  if (!image) return '';
  const base = new URL(address); base.protocol = ['https:', 'wss:'].includes(base.protocol) ? 'https:' : 'http:';
  base.pathname = '/'; base.search = ''; base.hash = '';
  if (image.proxy_id && /^[a-f0-9]{64}$/i.test(image.proxy_id)) {
    return new URL(`imageproxy/${image.proxy_id}?size=${size}`, base).href;
  }
  const path = typeof image === 'string' ? image : image.path;
  if (!path) return '';
  // Only load safe remote artwork directly. Local NAS paths need a server proxy ID.
  try { const url = new URL(path, base); if (/^https?:$/.test(url.protocol) && (path.startsWith('/imageproxy/') || (typeof image !== 'string' && image.remotely_accessible) || /^https?:\/\//.test(path))) return url.href; } catch {}
  return '';
}

export function durationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
