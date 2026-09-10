'use strict';

module.exports = async (req, res) => {
  const q = String(req.query?.q || '').trim();

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

  if (!q) {
    return res.status(200).json({
      ok: true,
      suggestions: []
    });
  }

  try {
    const url =
      'https://suggestqueries.google.com/complete/search' +
      '?client=firefox&ds=yt&hl=en&q=' +
      encodeURIComponent(q);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    let upstream;

    try {
      upstream = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return res.status(200).json({
        ok: true,
        suggestions: []
      });
    }

    const data = await upstream.json().catch(() => null);

    const suggestions =
      Array.isArray(data) && Array.isArray(data[1])
        ? data[1]
            .filter(x => typeof x === 'string')
            .slice(0, 10)
        : [];

    return res.status(200).json({
      ok: true,
      suggestions
    });

  } catch (err) {
    console.error('[music/suggest]', err?.message || err);

    return res.status(200).json({
      ok: true,
      suggestions: []
    });
  }
};
