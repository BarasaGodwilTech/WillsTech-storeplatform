// video.js — accepts YouTube / Vimeo / direct video links in their common shapes and stores ONE clean form.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(u) {
  let url; try { url = new URL(u); } catch (e) { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else { const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname); if (m) id = m[2]; }
  }
  return id && YT_ID.test(id) ? id : null;
}
function vimeoId(u) {
  let url; try { url = new URL(u); } catch (e) { return null; }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const m = /(?:^|\/)(\d{6,12})(?:$|[/?#])/.exec(url.pathname + '/');
  return m ? m[1] : null;
}

// Returns the cleaned link, or throws an Error with a message an admin can act on.
function normalizeVideo(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^(https?:)?\//i.test(u) && /^[\w.-]+\.[a-z]{2,}\//i.test(u)) u = 'https://' + u;   // "youtube.com/watch?v=…" without https
  const yt = youtubeId(u); if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  const vm = vimeoId(u); if (vm) return `https://vimeo.com/${vm}`;
  if (/^https?:\/\/[^\s]+\.(mp4|webm|mov|m4v)(\?[^\s]*)?$/i.test(u) || /^\/public\/videos\/[^\s]+$/i.test(u)) return u;
  throw new Error(`"${u.slice(0, 60)}" is not a video link we can play. Paste a YouTube or Vimeo link, or a direct .mp4 link.`);
}

function normalizeVideos(list) {
  const arr = Array.isArray(list) ? list : String(list || '').split(/\r?\n/);
  const out = [];
  for (const v of arr) { const n = normalizeVideo(v); if (n && !out.includes(n)) out.push(n); }
  if (out.length > 6) throw new Error('Please keep it to 6 videos per product.');
  return out;
}

module.exports = { youtubeId, vimeoId, normalizeVideo, normalizeVideos };
