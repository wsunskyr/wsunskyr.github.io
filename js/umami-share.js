(function (global) {
  const promises = new Map();
  const keys = new Set();
  global.getUmamiShareData = function (baseUrl, shareId) {
    const key = `umami-share:${baseUrl}:${shareId}`;
    keys.add(key);
    if (!promises.has(key)) {
      promises.set(key, (async () => {
        try {
          const cached = JSON.parse(localStorage.getItem(key) || 'null');
          if (cached && Date.now() - cached.timestamp < 3600000) return cached.value;
        } catch { /* Analytics remains usable when browser storage is disabled. */ }
        const response = await fetch(`${baseUrl}/api/share/${encodeURIComponent(shareId)}`, {signal: AbortSignal.timeout(10000)});
        if (!response.ok) throw new Error(`Analytics share unavailable (${response.status})`);
        const value = await response.json();
        if (!value.websiteId || !value.token) throw new Error('Invalid analytics response');
        try { localStorage.setItem(key, JSON.stringify({timestamp: Date.now(), value})); } catch {}
        return value;
      })().catch(error => { promises.delete(key); throw error; }));
    }
    return promises.get(key);
  };
  global.clearUmamiShareCache = function () {
    keys.forEach(key => { try { localStorage.removeItem(key); } catch {} });
    promises.clear();
  };
})(window);
