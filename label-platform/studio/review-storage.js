/* Same-origin storage: native review API, or the user's authenticated Jupyter
   Contents API. Jupyter writes one immutable event per file to avoid lost updates. */
window.ReviewStorage = (() => {
  const outboxKey = 'critic.review.outbox.v1';
  let adapter = null, discovering = null, queue = Promise.resolve();
  const diagnostic = { page: location.href, api: new URL('./api/reviews', location.href).href };
  const signal = () => window.dispatchEvent(new Event('review-storage'));
  function pending() {
    try { return JSON.parse(localStorage.getItem(outboxKey) || '[]'); } catch { return []; }
  }
  function keep(records) {
    try { localStorage.setItem(outboxKey, JSON.stringify(records)); signal(); return true; }
    catch { return false; }
  }
  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok || !body) {
      const error = new Error(body?.err || body?.message || `HTTP ${response.status}`);
      error.status = response.status; error.url = response.url || String(url); throw error;
    }
    return body;
  }
  async function digest(scope) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
    return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function xsrfHeaders() {
    const value = document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('_xsrf='));
    return { 'Content-Type': 'application/json', ...(value ? { 'X-XSRFToken': decodeURIComponent(value.slice(6)) } : {}) };
  }
  async function discoverJupyter() {
    if (discovering) return discovering;
    discovering = (async () => {
      const prefix = location.pathname.match(/^(.*?)\/proxy\/\d+(?:\/|$)/)?.[1];
      if (prefix == null) throw new Error('当前服务未启用写入接口');
      const base = new URL(`${prefix}/api/contents/`, location.origin);
      const api = (path, options = {}) => jsonRequest(new URL(path.split('/').map(encodeURIComponent).join('/') + '?content=1', base), options);
      diagnostic.jupyter = base.href;
      // A failed root authentication check must not be hidden as an empty dataset.
      await api('');
      const prefixes = ['mmu_mllm_hdd_4/viewer/critic-studio', 'viewer/critic-studio', 'critic-studio', ''];
      let project = null;
      for (const candidate of prefixes) {
        try {
          const path = [candidate, 'collapse.html'].filter(Boolean).join('/');
          const file = await api(path);
          if (file.type === 'file' && typeof file.content === 'string' &&
              file.content.includes('PAGE_LOCATOR') && file.content.includes('collapse')) {
            project = candidate; break;
          }
        } catch (e) { if (e.status !== 404) throw e; }
      }
      if (project == null) throw new Error('Jupyter 文件目录中未找到 critic-studio');
      const folder = [project, 'annotations'].filter(Boolean).join('/');
      diagnostic.directory = folder;
      async function optional(path) {
        try { return await api(path); } catch (e) { if (e.status === 404) return null; throw e; }
      }
      async function mkdir(path) {
        const exists = await optional(path);
        if (exists) { if (exists.type !== 'directory') throw new Error(`${path} 不是目录`); return; }
        try { await api(path, { method: 'PUT', headers: xsrfHeaders(), body: JSON.stringify({ type: 'directory' }) }); }
        catch (e) { if ((await optional(path))?.type !== 'directory') throw e; }
      }
      function parse(file) {
        if (file?.format !== 'text' || typeof file.content !== 'string') throw new Error('标注文件不是文本');
        return file.content.trim() ? file.content.trim().split('\n').map(line => JSON.parse(line)) : [];
      }
      return {
        name: 'Jupyter · 已连接共享盘',
        async read(scope) {
          const hash = await digest(scope), records = [];
          const log = await optional(`${folder}/${hash}.jsonl`);
          if (log) records.push(...parse(log));
          const dir = await optional(`${folder}/jupyter/${hash}`);
          if (dir) {
            const files = dir.content.filter(f => f.type === 'file' && f.name.endsWith('.json'));
            // Bound concurrency for large review histories.
            for (let i = 0; i < files.length; i += 8) {
              const batch = await Promise.all(files.slice(i, i + 8).map(f => api(f.path)));
              batch.forEach(f => records.push(...parse(f)));
            }
          }
          return records.filter(r => r.scope === scope).sort((a, b) => a.ts.localeCompare(b.ts));
        },
        async save(rec) {
          const dir = `${folder}/jupyter/${await digest(rec.scope)}`;
          await mkdir(folder); await mkdir(`${folder}/jupyter`); await mkdir(dir);
          const path = `${dir}/${rec.op_id}.json`;
          // Retrying a lost response reuses the same event file.
          await api(path, { method: 'PUT', headers: xsrfHeaders(), body: JSON.stringify({
            type: 'file', format: 'text', content: JSON.stringify(rec) + '\n',
          }) });
          const saved = parse(await api(path))[0];
          if (JSON.stringify(saved) !== JSON.stringify(rec)) throw new Error('写入后校验失败');
          return saved;
        },
      };
    })();
    try { return await discovering; } finally { discovering = null; }
  }
  async function fallback(error) {
    diagnostic.nativeError = `${error.status || ''} ${error.message}`;
    if (![404, 405, 501].includes(error.status)) throw error;
    try { adapter = await discoverJupyter(); signal(); }
    catch (e) {
      diagnostic.error = `${e.message} (${e.url || diagnostic.jupyter || diagnostic.api})`;
      signal(); throw new Error(`写入未连接：${e.message}`);
    }
    return adapter;
  }
  async function read(scope) {
    try {
      if (adapter) return await adapter.read(scope);
      const result = await jsonRequest(new URL(`./api/reviews?scope=${encodeURIComponent(scope)}`, location.href));
      if (!Array.isArray(result.records)) throw new Error('标注接口返回格式错误');
      diagnostic.connected = '标注服务'; signal(); return result.records;
    } catch (e) {
      if (adapter) throw e;
      return (await fallback(e)).read(scope);
    }
  }
  async function transmit(rec) {
    if (adapter) return adapter.save(rec);
    try {
      const result = await jsonRequest(new URL('./api/reviews', location.href), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec),
      });
      if (!result.ok || !result.rec) throw new Error('保存接口返回格式错误');
      return result.rec;
    } catch (e) { return (await fallback(e)).save(rec); }
  }
  async function save(record) {
    const uuid = () => crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    const rec = { ...record, op_id: record.op_id || uuid(), ts: record.ts || new Date().toISOString() };
    const backup = keep([...pending().filter(r => r.op_id !== rec.op_id), rec]);
    const job = queue.then(async () => {
      try {
        const saved = await transmit(rec);
        keep(pending().filter(r => r.op_id !== rec.op_id));
        diagnostic.error = ''; signal(); return saved;
      } catch (e) {
        diagnostic.error = e.message; signal();
        throw new Error(e.message + (backup ? '；已备份本机，未写入共享盘' : '；本机备份也失败，请勿关闭页面'));
      }
    });
    queue = job.catch(() => {}); return job;
  }
  async function retry() { for (const record of pending()) await save(record); }
  function download() {
    const blob = new Blob([pending().map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'critic-review-pending.jsonl'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { read, save, pending, retry, download, diagnostic,
    get status() { return adapter?.name || diagnostic.connected || '未连接共享盘'; } };
})();

