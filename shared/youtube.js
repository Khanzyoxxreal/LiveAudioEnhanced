// Extracts the video / livestream id from a YouTube URL. Returns null for anything else
// (home page, search, channel pages, non-YouTube sites).
const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

export function getYouTubeVideoId(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  } else if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0];
  }
  return id && ID_RE.test(id) ? id : null;
}

// True for youtube.com/shorts/<id> URLs. Shorts are a feed: scrolling to the next Short changes
// the id without leaving the Shorts player, so capture should keep running across them.
export function isYouTubeShort(url) {
  if (!url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  return host === 'youtube.com' && /^\/shorts\/[^/?#]+/.test(u.pathname);
}
