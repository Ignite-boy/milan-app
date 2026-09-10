'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

function collectVideos(node, out, seen) {
  if (!node || typeof node !== 'object' || out.length >= 24) return;

  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, out, seen);
    return;
  }

  const v = node.videoRenderer;

  if (v && v.videoId && !seen.has(v.videoId)) {
    seen.add(v.videoId);

    const title =
      (v.title && v.title.runs && v.title.runs[0] && v.title.runs[0].text) ||
      (v.title && v.title.simpleText) ||
      '';

    const channel =
      (v.ownerText &&
        v.ownerText.runs &&
        v.ownerText.runs[0] &&
        v.ownerText.runs[0].text) ||
      (v.longBylineText &&
        v.longBylineText.runs &&
        v.longBylineText.runs[0] &&
        v.longBylineText.runs[0].text) ||
      '';

    if (title) {
      out.push({
        id: v.videoId,
        title,
        channel,
        thumb:
          'https://i.ytimg.com/vi/' +
          v.videoId +
          '/mqdefault.jpg'
      });
    }
  }

  for (const key of Object.keys(node)) {
    if (key !== 'videoRenderer') {
      collectVideos(node[key], out, seen);
    }
  }
}

function extractInitialData(html) {
  const markers = [
    'ytInitialData = ',
    'ytInitialData"] = '
  ];

  for (const marker of markers) {
    const i = html.indexOf(marker);
    if (i === -1) continue;

    let start = i + marker.length;

    while (start < html.length && html[start] !== '{') start++;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = start; j < html.length; j++) {
      const c = html[j];

      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') {
        inString = true;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;

        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, j + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  const q = String(req.query?.q || '').trim();

  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
  );

  if (!q) {
    return res.status(200).json({
      ok: true,
      source: 'youtube-free',
      items: []
    });
  }

  try {
    const url =
      'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(q) +
      '&hl=en&gl=US';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    let response;

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'CONSENT=YES+cb; SOCS=CAI;'
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: 'youtube_search_unavailable',
        items: []
      });
    }

    const html = await response.text();
    const data = extractInitialData(html);

    const items = [];

    if (data) {
      collectVideos(data, items, new Set());
    }

    return res.status(200).json({
      ok: true,
      source: 'youtube-free',
      items: items.slice(0, 24)
    });

  } catch (error) {
    console.error('[music/search]', error?.message || error);

    return res.status(502).json({
      ok: false,
      error: 'youtube_search_failed',
      items: []
    });
  }
};
