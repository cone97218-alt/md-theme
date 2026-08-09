/**
 * Morandi Theme Studio — app.js v6
 * Supports App UI Theme (应用界面美化) & Reader Typesetting (阅读界面排版美化)
 * Responsive Mobile UI: Segmented Tab Switcher, Zero Horizontal Overflow, Pure Direct Layout
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── State ──────────────────────────────────────────────────────
  const state = {
    appTheme: 'light',   // 'light' | 'dark'
    mockupMode: 'light', // 'light' | 'dark'
    activeTab: 'preview',
    mobileTab: 'controls', // 'controls' | 'preview'
    queue: [],           // Array of QueueItem
    activeId: null
  };

  // ── DOM Refs ────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  const themeToggleBtn     = $('themeToggleBtn');
  const themeIcon          = $('themeIcon');
  const themeLabel         = $('themeLabel');

  const workspace          = $('workspace');
  const mobileTabSwitcher  = $('mobileTabSwitcher');

  const dropZone           = $('dropZone');
  const fileInput          = $('fileInput');
  const queueList          = $('queueList');
  const queueCount         = $('queueCount');
  
  const convertBtn         = $('convertBtn');
  const splitExportButtons = $('splitExportButtons');
  const exportUiBtn        = $('exportUiBtn');
  const exportReaderBtn    = $('exportReaderBtn');

  const themeNameInput     = $('themeNameInput');

  const mockupModeBtn      = $('mockupModeBtn');
  const mockupModeIcon     = $('mockupModeIcon');
  const mockupModeLabel    = $('mockupModeLabel');

  const phoneScreen        = $('phoneScreen');
  const phoneTopbar        = $('phoneTopbar');
  const phoneNavBar        = $('phoneNavBar');
  const previewTitle       = $('previewTitle');
  const galleryGrid        = $('galleryGrid');

  // Reader Screen Elements
  const readerScreen       = $('readerScreen');
  const readerBody         = $('readerBody');
  const readerBookName     = $('readerBookName');
  const readerTitleText    = $('readerTitleText');

  const navWrappers = {
    home:      $('navHome'),
    bookshelf: $('navBookshelf'),
    explore:   $('navExplore'),
    rss:       $('navRss'),
    my:        $('navMy')
  };

  // Set initial workspace state for mobile
  if (workspace) workspace.setAttribute('data-m-active', 'controls');

  // ── Mobile Main Tab Switcher ─────────────────────────────────────
  $$('.m-switcher-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.m-switcher-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mTab = btn.getAttribute('data-m-tab');
      state.mobileTab = mTab;
      if (workspace) workspace.setAttribute('data-m-active', mTab);
    });
  });

  // ── IndexedDB 10-Minute Persistent Caching ────────────────────────
  const DB_NAME = 'MorandiStudioDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'appCache';
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async function saveCacheState() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const itemsToCache = state.queue.map(item => ({
        id: item.id,
        name: item.name,
        rawType: item.rawType,
        customName: item.customName,
        fileBlob: item.file
      }));

      const cacheData = {
        id: 'current_session',
        timestamp: Date.now(),
        activeId: state.activeId,
        themeName: themeNameInput ? themeNameInput.value : '',
        items: itemsToCache
      };

      store.put(cacheData);
    } catch(e) {
      console.warn('[Cache Save Error]', e);
    }
  }

  async function loadCacheState() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('current_session');

      req.onsuccess = async () => {
        const cache = req.result;
        if (!cache || !cache.timestamp) return;

        const age = Date.now() - cache.timestamp;
        if (age > CACHE_TTL_MS || !cache.items || !cache.items.length) {
          clearCacheState();
          state.queue = [];
          state.activeId = null;
          if (themeNameInput) themeNameInput.value = '';
          resetPreview();
          renderQueue();
          return;
        }

        state.queue = [];
        for (const cachedItem of cache.items) {
          if (!cachedItem.fileBlob) continue;
          const item = {
            id: cachedItem.id,
            file: cachedItem.fileBlob,
            name: cachedItem.name,
            rawType: cachedItem.rawType,
            customName: cachedItem.customName,
            hasUi: false,
            hasReader: false,
            parsedUi: null,
            parsedReader: null,
            status: 'parsing'
          };
          state.queue.push(item);
          try {
            await parseFile(item);
          } catch(err) {
            console.warn('[Cache Re-parse Failed]', item.name, err);
          }
        }

        if (cache.themeName && themeNameInput) themeNameInput.value = cache.themeName;
        state.activeId = cache.activeId || (state.queue[0] ? state.queue[0].id : null);

        renderQueue();
        if (state.activeId) selectItem(state.activeId);

        showCacheRestoredToast(Math.ceil((CACHE_TTL_MS - age) / 60000));
      };
    } catch(e) {
      console.warn('[Cache Load Error]', e);
    }
  }

  async function clearCacheState() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('current_session');
    } catch(e){}
  }

  function showCacheRestoredToast(remainingMins) {
    const tipBox = $('importTipBox');
    if (tipBox) {
      tipBox.style.display = 'block';
      tipBox.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color: var(--sage);"></i> <b>已自动恢复离开前的编辑状态</b><br>退出页面或切换应用自动保留（剩余约 ${remainingMins} 分钟有效缓存）。`;
    }
  }

  // Load cache on startup
  loadCacheState();

  // ── Helpers ─────────────────────────────────────────────────────

  function hexToArgbInt(hex) {
    if (!hex || typeof hex !== 'string') return 0;
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = 'FF' + h.split('').map(c => c + c).join('');
    else if (h.length === 4) h = h.split('').map(c => c + c).join('');
    else if (h.length === 6) h = 'FF' + h;
    if (h.length !== 8) return 0;
    let v = parseInt(h, 16);
    if (v > 0x7FFFFFFF) v -= 0x100000000;
    return v;
  }

  function typeLabel(item) {
    const parts = [];
    if (item.hasUi) parts.push('界面');
    if (item.hasReader) parts.push('排版');
    const label = parts.length ? parts.join('+') : '美化包';
    return `${item.rawType === 'red' ? 'Reeden' : 'Zip'} (${label})`;
  }

  // ── App Day/Night Toggle ─────────────────────────────────────────
  themeToggleBtn.addEventListener('click', () => {
    state.appTheme = state.appTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.appTheme);
    if (state.appTheme === 'dark') {
      themeIcon.className = 'fa-solid fa-moon';
      themeLabel.textContent = '夜间';
    } else {
      themeIcon.className = 'fa-solid fa-sun';
      themeLabel.textContent = '日间';
    }
  });

  // ── Mockup Day/Night Toggle ──────────────────────────────────────
  mockupModeBtn.addEventListener('click', () => {
    state.mockupMode = state.mockupMode === 'light' ? 'dark' : 'light';
    phoneScreen.setAttribute('data-mockup-mode', state.mockupMode);
    if (state.mockupMode === 'dark') {
      mockupModeIcon.className = 'fa-solid fa-moon';
      mockupModeLabel.textContent = '夜间视图';
    } else {
      mockupModeIcon.className = 'fa-solid fa-sun';
      mockupModeLabel.textContent = '日间视图';
    }

    const activeItem = state.queue.find(q => q.id === state.activeId);
    if (activeItem) applyPreview(activeItem);
  });

  // ── Tab Switcher inside Inspector ───────────────────────────────
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      state.activeTab = tab;

      $$('.tab-pane').forEach(p => p.style.display = 'none');
      const pane = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
      if (pane) pane.style.display = 'block';

      // Hide Phone Statusbar, TopBar & Bottom NavBar when viewing Reader Typesetting Preview tab
      const phoneStatusbar = $('phoneStatusbar');
      if (tab === 'reader') {
        if (phoneStatusbar) phoneStatusbar.style.display = 'none';
        phoneTopbar.style.display = 'none';
        phoneNavBar.style.display = 'none';
      } else {
        if (phoneStatusbar) phoneStatusbar.style.display = 'flex';
        phoneTopbar.style.display = 'flex';
        phoneNavBar.style.display = 'flex';
      }
    });
  });

  // ── File Drag & Drop ─────────────────────────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFiles(e.target.files); });

  async function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['red', 'zip'].includes(ext);
    });

    if (!validFiles.length) return;

    const newItems = [];
    for (let idx = 0; idx < validFiles.length; idx++) {
      const file = validFiles[idx];
      const ext = file.name.split('.').pop().toLowerCase();
      const item = {
        id: 'item_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        rawType: ext === 'red' ? 'red' : 'zip',
        hasUi: false,
        hasReader: false,
        status: 'parsing',
        parsedUi: null,
        parsedReader: null
      };
      state.queue.push(item);
      newItems.push(item);
    }

    renderQueue();

    for (const item of newItems) {
      try {
        await parseFile(item);
      } catch (err) {
        console.error('[handleFiles parse error]', item.name, err);
        item.status = 'error';
      }
    }

    if (newItems.length > 0) {
      const firstReady = newItems.find(i => i.status === 'ready') || newItems[0];
      if (!state.activeId || !state.queue.find(q => q.id === state.activeId)) {
        selectItem(firstReady.id);
      } else {
        renderQueue();
      }
    } else {
      renderQueue();
    }

    saveCacheState();
  }

  const clearAllBtn = $('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      state.queue = [];
      state.activeId = null;
      if (themeNameInput) themeNameInput.value = '';
      resetPreview();
      clearCacheState();
      renderQueue();
    });
  }

  // ── Queue UI Rendering ────────────────────────────────────────────
  function renderQueue() {
    queueCount.textContent = `${state.queue.length} 个文件`;
    if (clearAllBtn) {
      clearAllBtn.style.display = state.queue.length > 0 ? 'inline-flex' : 'none';
    }
    queueList.innerHTML = '';

    state.queue.forEach(item => {
      const isSelected = state.activeId === item.id;
      const el = document.createElement('div');
      el.className = 'queue-item' + (isSelected ? ' active' : '');
      
      const displayName = item.customName || (item.parsedUi ? item.parsedUi.name : item.parsedReader ? item.parsedReader.name : item.name);

      el.innerHTML = `
        <div class="qi-icon"><i class="fa-solid ${item.hasUi && item.hasReader ? 'fa-layer-group' : item.hasReader ? 'fa-book-open-reader' : 'fa-palette'}"></i></div>
        <div class="qi-info">
          <div class="qi-name" title="${displayName}">${displayName}</div>
          <div class="qi-meta">${typeLabel(item)}</div>
        </div>
        <span class="qi-status status-${item.status}">
          ${item.status === 'ready' ? '就绪' : item.status === 'done' ? '已导出' : item.status === 'error' ? '失败' : '转换中'}
        </span>
        <button class="qi-remove" title="移除"><i class="fa-solid fa-xmark"></i></button>
      `;
      el.addEventListener('click', e => {
        if (!e.target.closest('.qi-remove')) selectItem(item.id);
      });
      el.querySelector('.qi-remove').addEventListener('click', e => {
        e.stopPropagation();
        state.queue = state.queue.filter(q => q.id !== item.id);
        if (state.activeId === item.id) {
          state.activeId = state.queue.length ? state.queue[0].id : null;
          if (state.activeId) {
            selectItem(state.activeId);
          } else {
            resetPreview();
          }
        }
        renderQueue();
      });
      queueList.appendChild(el);
    });

    const activeItem = state.queue.find(q => q.id === state.activeId);
    if (activeItem) {
      convertBtn.disabled = false;
      if (activeItem.hasUi && activeItem.hasReader) {
        splitExportButtons.style.display = 'flex';
      } else {
        splitExportButtons.style.display = 'none';
      }
    } else {
      convertBtn.disabled = state.queue.length === 0;
      splitExportButtons.style.display = 'none';
    }
    const batchExportBtn = $('batchExportBtn');
    const batchExportLabel = $('batchExportLabel');
    if (batchExportBtn && batchExportLabel) {
      if (state.queue.length > 1) {
        batchExportBtn.style.display = 'block';
        batchExportLabel.textContent = `📦 批量导出队列中全部美化包 (${state.queue.length}个)`;
      } else {
        batchExportBtn.style.display = 'none';
      }
    }

    if (state.queue.length === 0) {
      clearCacheState();
      resetPreview();
    } else {
      saveCacheState();
    }
  }

  function selectItem(id) {
    // Save custom theme name for previously active item before switching
    if (state.activeId) {
      const prev = state.queue.find(q => q.id === state.activeId);
      if (prev && themeNameInput) {
        prev.customName = themeNameInput.value.trim();
      }
    }

    state.activeId = id;
    const item = state.queue.find(q => q.id === id);
    if (item && themeNameInput) {
      themeNameInput.value = item.customName !== undefined ? item.customName : (item.parsedUi ? item.parsedUi.name : item.parsedReader ? item.parsedReader.name : item.name);
    }

    renderQueue();
    if (item) applyPreview(item);
    saveCacheState();
  }

  // ── Parse Theme Files ─────────────────────────────────────────────
  async function parseFile(item) {
    try {
      // Check if file starts with RED\x10 magic bytes (Reeden v2 binary container)
      const headerBuffer = await item.file.slice(0, 8).arrayBuffer();
      const headerBytes = new Uint8Array(headerBuffer);
      const isRedV2 = headerBytes[0] === 0x52 && headerBytes[1] === 0x45 && headerBytes[2] === 0x44 && headerBytes[3] === 0x10;

      if (isRedV2) {
        await parseRedV2(item);
        return;
      }

      const zip = await JSZip.loadAsync(item.file);
      const names = Object.keys(zip.files);

      // Check App UI components
      if (names.includes('theme.json')) {
        item.hasUi = true;
        const meta = JSON.parse(await zip.file('theme.json').async('text'));
        item.parsedUi = await extractRedUi(zip, meta);
      } else if (names.includes('appearance_kit.json')) {
        item.hasUi = true;
        const meta = JSON.parse(await zip.file('appearance_kit.json').async('text'));
        item.parsedUi = await extractArcUi(zip, meta);
      } else if (names.includes('manifest.json')) {
        item.hasUi = true;
        const meta = JSON.parse(await zip.file('manifest.json').async('text'));
        item.parsedUi = { name: meta.name || 'MD3 Theme', type: 'md3_ui' };
      }

      // Check Reader Typesetting components
      const schemaFile = names.find(n => n.endsWith('schema.json') && n.includes('reader_schema'));
      if (schemaFile) {
        item.hasReader = true;
        const schemaMeta = JSON.parse(await zip.file(schemaFile).async('text'));
        item.parsedReader = await extractRedReader(zip, schemaMeta);
      } else if (names.includes('readConfig.json')) {
        item.hasReader = true;
        const readCfg = JSON.parse(await zip.file('readConfig.json').async('text'));
        item.parsedReader = await extractZipReader(zip, readCfg);
      }

      renderQueue();
    } catch (err) {
      console.warn('[JSZip parse failed, trying RED v2 fallback]', err);
      try {
        await parseRedV2(item);
      } catch (fallbackErr) {
        console.error('[RED v2 fallback failed]', fallbackErr);
        item.status = 'error';
        renderQueue();
      }
    }
  }

  // Fallback parser for Reeden v2 RED\x10 binary container files
  async function parseRedV2(item) {
    const arrayBuffer = await item.file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // 1. Parse JSON schemas using robust brace matching
    const schemas = [];
    let pos = 0;
    while (true) {
      const idx = text.indexOf('{"name":', pos);
      if (idx === -1) break;
      let braceCount = 0;
      let inString = false;
      let escape = false;
      let endIdx = -1;
      for (let i = idx; i < Math.min(idx + 100000, text.length); i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{') braceCount++;
          else if (ch === '}') {
            braceCount--;
            if (braceCount === 0) { endIdx = i + 1; break; }
          }
        }
      }
      if (endIdx !== -1) {
        try {
          const jsonStr = text.substring(idx, endIdx);
          schemas.push(JSON.parse(jsonStr));
          pos = endIdx;
        } catch(e) { pos = idx + 8; }
      } else {
        pos = idx + 8;
      }
    }

    let themeMeta = null;
    let readerMeta = null;
    schemas.forEach(s => {
      if (s && typeof s === 'object') {
        if (s.light && typeof s.light === 'object' && s.light.primaryColor) {
          themeMeta = s;
        } else if (s.backgroundColor && s.textColor && s.layoutConfig) {
          readerMeta = s;
        }
      }
    });

    // 2. Scan for JPEG images
    const jpegs = [];
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0xFF && bytes[i+1] === 0xD8 && bytes[i+2] === 0xFF) {
        let end = -1;
        for (let j = i + 2; j < Math.min(i + 5000000, bytes.length - 1); j++) {
          if (bytes[j] === 0xFF && bytes[j+1] === 0xD9) { end = j + 2; break; }
        }
        if (end !== -1 && (end - i) > 2000) {
          const imgBytes = bytes.subarray(i, end);
          const blob = new Blob([imgBytes], { type: 'image/jpeg' });
          jpegs.push({ blob, url: URL.createObjectURL(blob) });
          i = end - 1;
        }
      }
    }

    // 3. Scan for PNG images
    const pngs = [];
    for (let i = 0; i < bytes.length - 8; i++) {
      if (bytes[i] === 0x89 && bytes[i+1] === 0x50 && bytes[i+2] === 0x4E && bytes[i+3] === 0x47) {
        let end = -1;
        for (let j = i + 8; j < Math.min(i + 5000000, bytes.length - 4); j++) {
          if (bytes[j] === 0x49 && bytes[j+1] === 0x45 && bytes[j+2] === 0x4E && bytes[j+3] === 0x48) {
            end = j + 8;
            break;
          }
        }
        if (end !== -1 && (end - i) > 200) {
          const imgBytes = bytes.subarray(i, end);
          const blob = new Blob([imgBytes], { type: 'image/png' });
          pngs.push({ blob, url: URL.createObjectURL(blob) });
          i = end - 1;
        }
      }
    }

    const themeName = (themeMeta ? themeMeta.name : item.name.replace(/\.red$/i, '')).replace(/[\r\n\t]/g, '').trim();
    const light = themeMeta ? (themeMeta.light || {}) : {};
    const dark  = themeMeta ? (themeMeta.dark || {})  : {};
    const uiData = newParsedUi(themeName, 'red', light.primaryColor || '#FF8909', dark.primaryColor, light.cardColor, dark.cardColor);

    if (jpegs.length > 0) {
      uiData.bgBlob = jpegs[0].blob;
      uiData.bgBlobUrl = jpegs[0].url;
    }

    const navKeys = ['home', 'bookshelf', 'explore', 'rss', 'my'];
    pngs.slice(0, 5).forEach((p, idx) => {
      if (idx < navKeys.length) {
        uiData.navIconsBlobs[navKeys[idx]] = { blob: p.blob, url: p.url };
      }
    });

    jpegs.slice(1, 10).forEach(j => {
      uiData.coversBlobs.push({ blob: j.blob, url: j.url });
    });

    item.hasUi = true;
    item.parsedUi = uiData;

    let layoutCfg = {};
    if (readerMeta && readerMeta.layoutConfig) {
      if (typeof readerMeta.layoutConfig === 'string') {
        try { layoutCfg = JSON.parse(readerMeta.layoutConfig); } catch(e){}
      } else {
        layoutCfg = readerMeta.layoutConfig;
      }
    }

    const readerData = {
      name: readerMeta ? readerMeta.name : themeName,
      textColor: readerMeta ? readerMeta.textColor : '#3E3D3B',
      backgroundColor: readerMeta ? readerMeta.backgroundColor : '#F4F1EC',
      bgBlob: jpegs.length > 1 ? jpegs[1].blob : (jpegs.length > 0 ? jpegs[0].blob : null),
      bgBlobUrl: jpegs.length > 1 ? jpegs[1].url : (jpegs.length > 0 ? jpegs[0].url : null),
      layoutConfig: layoutCfg,
      extraFiles: {}
    };

    item.hasReader = true;
    item.parsedReader = readerData;
    item.status = 'ready';
    renderQueue();
  }

  // Extract App UI from Redden (.red)
  async function extractRedUi(zip, meta) {
    const light = meta.light || {};
    const dark  = meta.dark  || {};
    const name  = meta.name  || 'Redden Theme';
    const d     = newParsedUi(name, 'red', light.primaryColor, dark.primaryColor, light.cardColor, dark.cardColor);

    for (const p of ['light/theme_bg.img', 'light/theme_bg.jpg', 'light/theme_bg.png']) {
      if (zip.file(p)) {
        const blob = await zip.file(p).async('blob');
        d.bgBlob = blob;
        d.bgBlobUrl = URL.createObjectURL(blob);
        break;
      }
    }

    const packId = light.navbarPackId;
    const NAV_MAP = {
      home:      ['home_normal.png'],
      bookshelf: ['bookshelf_normal.png'],
      explore:   ['feature_normal.png', 'discovery_normal.png'],
      rss:       ['notes_normal.png', 'rss_normal.png'],
      my:        ['statistics_normal.png', 'my_normal.png', 'settings_normal.png']
    };
    if (packId) {
      for (const [key, fns] of Object.entries(NAV_MAP)) {
        for (const fn of fns) {
          const f = zip.file(`navbar_pack/${packId}/${fn}`);
          if (f) {
            const blob = await f.async('blob');
            d.navIconsBlobs[key] = { blob, url: URL.createObjectURL(blob) };
            break;
          }
        }
      }
    }

    const galleryId = light.coverGalleryId;
    if (galleryId) {
      const coverFiles = Object.keys(zip.files)
        .filter(n => n.startsWith(`cover_gallery/${galleryId}/`) && /\.(jpg|jpeg|png)$/i.test(n));
      for (const fn of coverFiles) {
        const blob = await zip.file(fn).async('blob');
        d.coversBlobs.push({ blob, url: URL.createObjectURL(blob) });
      }
    }

    // Extract Bookshelf Carousel Banner images
    const carouselFiles = Object.keys(zip.files).filter(n => n.includes('bookshelf_carousel') && (n.endsWith('.img') || n.endsWith('.jpg') || n.endsWith('.png')));
    for (const fn of carouselFiles) {
      const blob = await zip.file(fn).async('blob');
      d.carouselBlobs.push({ blob, url: URL.createObjectURL(blob) });
    }

    for (const fn of Object.keys(zip.files)) {
      if (/\.(ttf|otf)$/i.test(fn)) { d.fontBlob = await zip.file(fn).async('blob'); break; }
    }

    return d;
  }

  // Extract App UI from Arc Archive
  async function extractArcUi(zip, meta) {
    const name = meta.name || 'Arc Theme';
    const d    = newParsedUi(name, 'arc');

    for (const comp of (meta.components || [])) {
      if (!zip.file(comp.path)) continue;
      const bytes   = await zip.file(comp.path).async('arraybuffer');
      const subZip  = await JSZip.loadAsync(bytes);
      const subNames = Object.keys(subZip.files);

      if (comp.type === 'THEME' && !comp.isNight) {
        const tjFile = subNames.find(n => n.endsWith('theme.json'));
        if (tjFile) {
          const tj = JSON.parse(await subZip.file(tjFile).async('text'));
          const cfg = tj.config || {};
          if (cfg.themeName) d.name = cfg.themeName;
          d.primaryColor = cfg.primaryColor || d.primaryColor;
          d.cardColor    = cfg.cardColor    || d.cardColor;

          if (cfg.backgroundImgPath) {
            const bgFile = subNames.find(n => n.endsWith(cfg.backgroundImgPath));
            if (bgFile) {
              const blob = await subZip.file(bgFile).async('blob');
              d.bgBlob = blob;
              d.bgBlobUrl = URL.createObjectURL(blob);
            }
          }
        }
        for (const fn of subNames) {
          if (/\.(ttf|otf)$/i.test(fn)) { d.fontBlob = await subZip.file(fn).async('blob'); break; }
        }

      } else if (comp.type === 'NAVIGATION_BAR' && !comp.isNight) {
        const NAV_MAP = {
          home:      ['home_normal.png'],
          bookshelf: ['bookshelf_normal.png'],
          explore:   ['discovery_normal.png', 'feature_normal.png'],
          rss:       ['rss_normal.png', 'readRecord_normal.png'],
          my:        ['my_normal.png']
        };
        for (const [key, fns] of Object.entries(NAV_MAP)) {
          const match = subNames.find(n => fns.some(fn => n.endsWith(fn)));
          if (match) {
            const blob = await subZip.file(match).async('blob');
            d.navIconsBlobs[key] = { blob, url: URL.createObjectURL(blob) };
          }
        }
      } else if (comp.type === 'COVER_COLLECTION') {
        const imgs = subNames.filter(n => n.includes('cover_') && /\.(jpg|jpeg|png)$/i.test(n));
        for (const fn of imgs) {
          const blob = await subZip.file(fn).async('blob');
          d.coversBlobs.push({ blob, url: URL.createObjectURL(blob) });
        }
      }
    }

    return d;
  }

  // Extract Reader Typesetting from RED
  async function extractRedReader(zip, schemaMeta) {
    let layoutCfg = {};
    if (schemaMeta.layoutConfig) {
      if (typeof schemaMeta.layoutConfig === 'string') {
        try { layoutCfg = JSON.parse(schemaMeta.layoutConfig); } catch(e){}
      } else if (typeof schemaMeta.layoutConfig === 'object') {
        layoutCfg = schemaMeta.layoutConfig;
      }
    }

    const r = {
      name: schemaMeta.name || 'Redden 排版',
      textColor: schemaMeta.textColor || '#3E3D3B',
      backgroundColor: schemaMeta.backgroundColor || '#F4F1EC',
      bgBlob: null,
      bgBlobUrl: null,
      layoutConfig: layoutCfg,
      extraFiles: {}
    };

    const bgFile = Object.keys(zip.files).find(n => n.includes('reader_schema') && (n.endsWith('.img') || n.endsWith('.jpg') || n.endsWith('.png')));
    if (bgFile) {
      const blob = await zip.file(bgFile).async('blob');
      r.bgBlob = blob;
      r.bgBlobUrl = URL.createObjectURL(blob);
    }

    return r;
  }

  // Extract Reader Typesetting from Arc / MD3 Zip
  async function extractZipReader(zip, readCfg) {
    const r = {
      name: readCfg.name || '排版美化',
      textColor: readCfg.textColor || '#3E3D3B',
      readConfig: readCfg,
      bgBlob: null,
      bgBlobUrl: null,
      extraFiles: {}
    };

    const bgStr = readCfg.bgStr || '';
    const bgFilename = bgStr.split('/').pop().split('\\').pop();

    for (const fn of Object.keys(zip.files)) {
      if (fn !== 'readConfig.json' && !zip.files[fn].dir) {
        const baseFn = fn.split('/').pop().split('\\').pop();
        const blob = await zip.files[fn].async('blob');
        if (baseFn === bgFilename) {
          r.bgBlob = blob;
          r.bgBlobUrl = URL.createObjectURL(blob);
        } else {
          r.extraFiles[baseFn] = blob;
        }
      }
    }

    return r;
  }

  function newParsedUi(name, type, primaryColor = '#FF8909', primaryColorDark = '#F5F5F5', cardColor = '#FFFFFF', cardColorDark = '#171719') {
    return { name, type, primaryColor, primaryColorDark, cardColor, cardColorDark,
             bgBlobUrl: null, bgBlob: null, navIconsBlobs: {}, coversBlobs: [], carouselBlobs: [], fontBlob: null };
  }

  // ── Apply Preview to Phone Mockup ─────────────────────────────────
  function applyPreview(item) {
    const uiData = item.parsedUi;
    const readerData = item.parsedReader;
    const displayName = themeNameInput.value.trim() || (uiData ? uiData.name : readerData ? readerData.name : item.name);

    previewTitle.textContent = '书架';
    if (!themeNameInput.value) {
      themeNameInput.value = displayName;
    }

    // App UI Preview
    if (uiData && uiData.bgBlobUrl) {
      phoneScreen.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.08), rgba(0,0,0,0.08)), url('${uiData.bgBlobUrl}')`;
    } else {
      phoneScreen.style.backgroundImage = 'none';
    }

    // Nav icons
    Object.keys(navWrappers).forEach(key => {
      const wrap = navWrappers[key];
      if (uiData && uiData.navIconsBlobs[key]) {
        wrap.innerHTML = `<img src="${uiData.navIconsBlobs[key].url}" alt="${key}" style="width:22px;height:22px;object-fit:contain;border-radius:4px;">`;
      } else {
        const FA_MAP = { home: 'fa-house', bookshelf: 'fa-book-bookmark', explore: 'fa-compass', rss: 'fa-rss', my: 'fa-circle-user' };
        wrap.innerHTML = `<i class="fa-solid ${FA_MAP[key]}"></i>`;
      }
    });

    // Cover gallery
    galleryGrid.innerHTML = '';
    if (uiData && uiData.coversBlobs.length) {
      uiData.coversBlobs.forEach(c => {
        const img = document.createElement('img');
        img.className = 'gallery-item';
        img.src = c.url;
        galleryGrid.appendChild(img);
      });
      injectCoverIntoCard('cover0Wrap', uiData.coversBlobs[0]);
      if (uiData.coversBlobs.length > 1) injectCoverIntoCard('cover1Wrap', uiData.coversBlobs[1]);
    } else {
      galleryGrid.innerHTML = `<div class="gallery-empty"><i class="fa-regular fa-image"></i><span>暂无书单封面</span></div>`;
    }

    // Reader Screen Typesetting Live Preview (Pure Direct Layout)
    if (readerData) {
      readerBookName.textContent = displayName;
      readerTitleText.textContent = '第一章 序章';

      if (readerData.bgBlobUrl) {
        readerScreen.style.backgroundImage = `url('${readerData.bgBlobUrl}')`;
      } else if (readerData.readConfig && readerData.readConfig.bgStrNight && state.mockupMode === 'dark') {
        readerScreen.style.backgroundImage = 'none';
        readerScreen.style.backgroundColor = readerData.readConfig.bgStrNight;
      } else {
        readerScreen.style.backgroundImage = 'none';
        readerScreen.style.backgroundColor = readerData.backgroundColor || (state.mockupMode === 'dark' ? '#1e2428' : '#f4f1ec');
      }

      let textColor = readerData.textColor || '#3E3D3B';
      if (state.mockupMode === 'dark') {
        textColor = (readerData.readConfig && readerData.readConfig.textColorNight) || '#ADADAD';
      }
      readerScreen.style.color = textColor;

      const layout = readerData.layoutConfig || (readerData.readConfig || {});
      const fontSize = layout.fontSize || layout.textSize || 11;
      const lineSpacing = layout.lineSpacing || layout.lineSpacingExtra || 14;

      readerBody.style.fontSize = Math.min(Math.max(fontSize, 10), 16) + 'px';
      readerBody.style.lineHeight = (1.4 + lineSpacing / 30).toFixed(2);
      
      const pIndent = layout.paragraphIndent !== undefined ? layout.paragraphIndent : '2em';

      // Accent Color, Underline & Text Shadow
      const accentColor = (readerData.readConfig && readerData.readConfig.textAccentColor) || '#8a9e8b';
      const underlineColor = (readerData.readConfig && readerData.readConfig.underlineColor) || textColor;
      const dialogue = $('readerDialogue');
      if (dialogue) {
        dialogue.style.borderColor = accentColor;
      }
      const underlineEl = $('readerUnderlineText');
      if (underlineEl) {
        underlineEl.style.textDecorationColor = underlineColor;
      }
      if (readerData.readConfig && readerData.readConfig.textShadow) {
        readerBody.style.textShadow = '1px 1px 2px rgba(0,0,0,0.35)';
      } else {
        readerBody.style.textShadow = 'none';
      }

      // Check Highlight Rule Background Images
      let hasHighlightImage = false;
      if (readerData.extraFiles) {
        const hlBgKey = Object.keys(readerData.extraFiles).find(fn => fn.includes('highlight_rule_bg') && /\.(png|jpg|jpeg)$/i.test(fn));
        if (hlBgKey) {
          hasHighlightImage = true;
          const hlUrl = URL.createObjectURL(readerData.extraFiles[hlBgKey]);
          if (dialogue) {
            dialogue.style.backgroundImage = `url('${hlUrl}')`;
            dialogue.style.backgroundSize = 'cover';
          }
        }
      }

      // Check custom font loading
      let hasCustomFont = false;
      if (readerData.extraFiles) {
        const fontKey = Object.keys(readerData.extraFiles).find(fn => /\.(ttf|otf)$/i.test(fn));
        if (fontKey) {
          hasCustomFont = true;
          const fontBlob = readerData.extraFiles[fontKey];
          const fontUrl = URL.createObjectURL(fontBlob);
          const fontFace = new FontFace('CustomReaderFont', `url(${fontUrl})`);
          fontFace.load().then(loadedFont => {
            document.fonts.add(loadedFont);
            readerScreen.style.fontFamily = 'CustomReaderFont, var(--font)';
          }).catch(e => console.warn('[CustomFont load failed]', e));
        }
      }
      if (!hasCustomFont) {
        readerScreen.style.fontFamily = 'var(--font)';
      }

      updateSwatch('swatchReaderText', textColor);
      $('metaReaderText').textContent = textColor;
      $('metaReaderBg').textContent = (readerData.bgBlobUrl ? '背景图' : '基础色') + (hasCustomFont ? ' + 提取字体' : '');
      const metaHl = $('metaHighlights');
      if (metaHl) metaHl.textContent = (hasHighlightImage ? '已提取' : '无');
    }

    // Metadata
    const typeParts = [];
    if (item.hasUi) typeParts.push('界面美化');
    if (item.hasReader) typeParts.push('阅读排版');
    $('metaType').textContent = typeParts.join(' + ') || '未载入';

    if (uiData) {
      updateSwatch('swatchPrimary', uiData.primaryColor);
      $('metaPrimary').textContent = uiData.primaryColor;
      updateSwatch('swatchPrimaryDark', uiData.primaryColorDark);
      $('metaPrimaryDark').textContent = uiData.primaryColorDark;
      updateSwatch('swatchCard', uiData.cardColor);
      $('metaCard').textContent = uiData.cardColor;
      $('metaBg').textContent = uiData.bgBlobUrl ? '已提取' : '无';
      $('metaNavIcons').textContent = `${Object.keys(uiData.navIconsBlobs).length}/5`;
      $('metaCovers').textContent = `${uiData.coversBlobs.length} 张`;
    }
  }

  function updateSwatch(id, hex) {
    const el = $(id);
    if (!el) return;
    let cssHex = hex;
    if (cssHex && cssHex.length === 9 && cssHex.startsWith('#')) {
      cssHex = '#' + cssHex.slice(3);
    }
    el.style.background = cssHex || '#ccc';
  }

  function injectCoverIntoCard(wrapId, cover) {
    const wrap = $(wrapId);
    if (!wrap) return;
    wrap.innerHTML = `<img src="${cover.url}" alt="Cover">`;
  }

  function resetPreview() {
    previewTitle.textContent = '阅读 MD3';
    themeNameInput.value = '';
    phoneScreen.style.backgroundImage = 'none';
    galleryGrid.innerHTML = `<div class="gallery-empty"><i class="fa-regular fa-image"></i><span>暂无书单封面</span></div>`;
    const FA_MAP = { home: 'fa-house', bookshelf: 'fa-book-bookmark', explore: 'fa-compass', rss: 'fa-rss', my: 'fa-circle-user' };
    Object.keys(navWrappers).forEach(key => {
      navWrappers[key].innerHTML = `<i class="fa-solid ${FA_MAP[key]}"></i>`;
    });
    $('cover0Wrap').innerHTML = `<i class="fa-solid fa-book-open"></i>`;
    $('cover1Wrap').innerHTML = `<i class="fa-solid fa-book"></i>`;
    $('bookTitle0').textContent = '示例图书 A';
    $('bookAuthor0').textContent = '示例作者 A';
    $('bookTitle1').textContent = '示例图书 B';
    $('bookAuthor1').textContent = '示例作者 B';
    $('metaType').textContent = '未载入';
  }

  // ── Convert & Export Actions ──────────────────────────────────────
  convertBtn.addEventListener('click', async () => {
    if (!state.queue.length) return;
    const activeItem = state.queue.find(q => q.id === state.activeId) || state.queue[0];
    if (!activeItem) return;

    convertBtn.disabled = true;
    convertBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>正在导出中…</span>';

    try {
      if (activeItem.hasUi) {
        await exportMd3Ui(activeItem);
      }
      if (activeItem.hasReader) {
        if (activeItem.hasUi) await new Promise(res => setTimeout(res, 600));
        await exportMd3Reader(activeItem);
      }
      activeItem.status = 'done';
      const tipBox = $('importTipBox');
      if (tipBox) tipBox.style.display = 'block';
    } catch (err) {
      console.error('[Export error]', err);
      activeItem.status = 'error';
    } finally {
      renderQueue();
      convertBtn.disabled = false;
      convertBtn.innerHTML = '<i class="fa-solid fa-box-archive"></i><span>导出 MD3 美化包 (.zip)</span>';
    }
  });

  exportUiBtn.addEventListener('click', async () => {
    const activeItem = state.queue.find(q => q.id === state.activeId);
    if (!activeItem || !activeItem.hasUi) return;

    exportUiBtn.disabled = true;
    exportUiBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中…';
    try {
      await exportMd3Ui(activeItem);
      activeItem.status = 'done';
      const tipBox = $('importTipBox');
      if (tipBox) tipBox.style.display = 'block';
    } catch (err) {
      console.error('[exportUiBtn error]', err);
    } finally {
      renderQueue();
      exportUiBtn.disabled = false;
      exportUiBtn.innerHTML = '<i class="fa-solid fa-mobile"></i> 仅界面美化';
    }
  });

  if (themeNameInput) {
    themeNameInput.addEventListener('input', () => saveCacheState());
  }

  exportReaderBtn.addEventListener('click', async () => {
    const activeItem = state.queue.find(q => q.id === state.activeId);
    if (!activeItem || !activeItem.hasReader) return;

    exportReaderBtn.disabled = true;
    exportReaderBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中…';
    try {
      await exportMd3Reader(activeItem);
      activeItem.status = 'done';
      const tipBox = $('importTipBox');
      if (tipBox) tipBox.style.display = 'block';
    } catch (err) {
      console.error('[exportReaderBtn error]', err);
    } finally {
      renderQueue();
      exportReaderBtn.disabled = false;
      exportReaderBtn.innerHTML = '<i class="fa-solid fa-book-open-reader"></i> 仅排版美化';
    }
  });

  const batchExportBtn = $('batchExportBtn');
  const batchExportLabel = $('batchExportLabel');
  if (batchExportBtn) {
    batchExportBtn.addEventListener('click', async () => {
      const itemsToExport = state.queue.filter(q => q.hasUi || q.hasReader);
      if (!itemsToExport.length) return;

      batchExportBtn.disabled = true;
      let count = 0;
      for (const item of itemsToExport) {
        count++;
        if (batchExportLabel) {
          batchExportLabel.textContent = `正在批量导出 (${count}/${itemsToExport.length})…`;
        }
        try {
          if (item.hasUi) {
            await exportMd3Ui(item);
            await new Promise(res => setTimeout(res, 500));
          }
          if (item.hasReader) {
            await exportMd3Reader(item);
            await new Promise(res => setTimeout(res, 500));
          }
          item.status = 'done';
        } catch (err) {
          console.error('[Batch Export Error]', item.name, err);
          item.status = 'error';
        }
      }

      batchExportBtn.disabled = false;
      renderQueue();

      const tipBox = $('importTipBox');
      if (tipBox) {
        tipBox.style.display = 'block';
        tipBox.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--sage);"></i> <b>批量导出完成！</b><br>已成功导出了 ${itemsToExport.length} 个 MD3 美化包，直接在【阅读】App 中点击导入即可。`;
      }
    });
  }

  function wakeLegadoApp(targetType = 'all') {
    const tipBox = $('importTipBox');
    if (tipBox) tipBox.style.display = 'block';

    const activeItem = state.queue.find(q => q.id === state.activeId);
    if (targetType === 'all' && activeItem) {
      if (activeItem.hasReader && !activeItem.hasUi) targetType = 'reader';
      else if (activeItem.hasUi && !activeItem.hasReader) targetType = 'ui';
    }

    const schemes = [];
    if (targetType === 'ui') {
      schemes.push(
        'legado://import/theme',
        'legado://theme/import',
        'intent://import/theme#Intent;scheme=legado;package=io.legado.app.md3;end',
        'intent://import/theme#Intent;scheme=legado;package=com.gedoor.app.book;end',
        'legado://import/online',
        'legado://'
      );
    } else if (targetType === 'reader') {
      schemes.push(
        'legado://import/readConfig',
        'legado://readConfig/import',
        'intent://import/readConfig#Intent;scheme=legado;package=io.legado.app.md3;end',
        'intent://import/readConfig#Intent;scheme=legado;package=com.gedoor.app.book;end',
        'legado://import/online',
        'legado://'
      );
    } else {
      schemes.push(
        'legado://import/theme',
        'legado://import/readConfig',
        'legado://import/online',
        'intent://import/online#Intent;scheme=legado;package=io.legado.app.md3;end',
        'legado://'
      );
    }

    let idx = 0;
    function tryNext() {
      if (idx < schemes.length) {
        window.location.href = schemes[idx++];
        setTimeout(tryNext, 350);
      }
    }
    tryNext();
  }

  const wakeAppBtn = $('wakeAppBtn');
  if (wakeAppBtn) {
    wakeAppBtn.addEventListener('click', () => {
      wakeLegadoApp('all');
    });
  }

  // Export MD3 App UI Theme (.md3.zip)
  async function exportMd3Ui(item) {
    const d         = item.parsedUi;
    if (!d) return;

    const zip       = new JSZip();
    const name      = item.customName || (themeNameInput ? themeNameInput.value.trim() : '') || d.name;
    const assetsMap = {};

    if (d.bgBlob) {
      zip.file('assets/background/light.jpg', d.bgBlob);
      assetsMap['background.light'] = 'assets/background/light.jpg';
    }

    Object.keys(d.navIconsBlobs).forEach(key => {
      const p = `assets/navigation/${key}.png`;
      zip.file(p, d.navIconsBlobs[key].blob);
      assetsMap[`navigation.${key}`] = p;
    });

    if (d.fontBlob) {
      zip.file('assets/fonts/app.ttf', d.fontBlob);
      assetsMap['font.app'] = 'assets/fonts/app.ttf';
    }

    const coverAlbums = [];
    if (d.coversBlobs.length) {
      const lightImages = [];
      d.coversBlobs.forEach((c, i) => {
        const p = `cover-albums/album_0/light/image_${i}.png`;
        zip.file(p, c.blob);
        lightImages.push({ path: p });
      });
      coverAlbums.push({ darkImages: [], lightImages, name, ref: 'album_0' });
    }

    const manifest = {
      assets: assetsMap,
      config: buildUiConfig(d, name),
      coverAlbums,
      coverSelection: coverAlbums.length ? { albumRef: 'album_0' } : {},
      formatVersion: 1,
      name
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${name}_界面美化.md3.zip`);
  }

  // Export MD3 Reader Typesetting Theme (.md3.zip)
  async function exportMd3Reader(item) {
    const r = item.parsedReader;
    if (!r) return;

    const zip = new JSZip();
    const name = item.customName || (themeNameInput ? themeNameInput.value.trim() : '') || r.name;
    let bgFilename = '';

    if (r.bgBlob) {
      bgFilename = 'bg_reader.jpg';
      zip.file(bgFilename, r.bgBlob);
    }

    if (r.extraFiles) {
      Object.keys(r.extraFiles).forEach(fn => {
        zip.file(fn, r.extraFiles[fn]);
      });
    }

    let readConfig = {};
    if (r.readConfig) {
      readConfig = { ...r.readConfig };
      readConfig.name = name;
      if (bgFilename) readConfig.bgStr = bgFilename;
    } else {
      const l = r.layoutConfig || {};
      readConfig = {
        "applyHeaderStyle": true,
        "bgAlpha": 100,
        "bgStr": bgFilename,
        "bgStrEInk": "#FFFFFF",
        "bgStrNight": "#000000",
        "bgType": bgFilename ? 2 : 0,
        "bgTypeEInk": 0,
        "bgTypeNight": 0,
        "customTipFooterLeft": "",
        "customTipFooterMiddle": "",
        "customTipFooterRight": "",
        "customTipHeaderLeft": "",
        "customTipHeaderMiddle": "",
        "customTipHeaderRight": "",
        "darkStatusIcon": true,
        "darkStatusIconEInk": true,
        "darkStatusIconNight": false,
        "dottedBase": 6.0,
        "dottedLine": true,
        "dottedRatio": 6.0,
        "footerFont": "",
        "footerFontSize": 12,
        "footerMode": 0,
        "footerPaddingBottom": parseInt(l.footerPaddingBottom || 14),
        "footerPaddingLeft": parseInt(l.footerPaddingLeft || 21),
        "footerPaddingRight": parseInt(l.footerPaddingRight || 20),
        "footerPaddingTop": parseInt(l.footerPaddingTop || 0),
        "headerFont": "",
        "headerFontSize": 13,
        "headerMode": 0,
        "headerPaddingBottom": parseInt(l.headerPaddingBottom || 0),
        "headerPaddingLeft": parseInt(l.headerPaddingLeft || 29),
        "headerPaddingRight": parseInt(l.headerPaddingRight || 7),
        "headerPaddingTop": parseInt(l.headerPaddingTop || 64),
        "highlightRules": [],
        "letterSpacing": parseFloat(l.letterSpacing || 0.1),
        "lineSpacingExtra": parseInt(l.lineSpacing || 16),
        "name": name,
        "paddingBottom": parseInt(l.paddingBottom || 17),
        "paddingLeft": parseInt(l.paddingLeft || 30),
        "paddingRight": parseInt(l.paddingRight || 30),
        "paddingTop": parseInt(l.paddingTop || 26),
        "pageAnim": 0,
        "pageAnimEInk": 4,
        "paragraphIndent": "　",
        "paragraphSpacing": parseInt(l.paragraphSpacing || 2),
        "shadowColor": "#3E3D3B",
        "shadowColorN": "#3E3D3B",
        "shadowDx": 1.0,
        "shadowDy": 1.0,
        "shadowRadius": 16.0,
        "showFooterLine": false,
        "showHeaderLine": false,
        "textAccentColor": "#834E00",
        "textAccentColorEInk": "#000000",
        "textAccentColorNight": "#FE4D55",
        "textBold": 0,
        "textColor": r.textColor || "#3E3D3B",
        "textColorEInk": "#000000",
        "textColorNight": "#ADADAD",
        "textFont": "",
        "textItalic": false,
        "textShadow": false,
        "textSize": parseInt(l.fontSize || 16),
        "tipDividerColor": -1,
        "tipFooterColor": 0,
        "tipFooterColorNight": 0,
        "tipFooterLeft": 7,
        "tipFooterMiddle": 0,
        "tipFooterRight": 6,
        "tipHeaderColor": -1,
        "tipHeaderColorNight": 0,
        "tipHeaderLeft": 1,
        "tipHeaderMiddle": 0,
        "tipHeaderRight": 0,
        "titleBold": 500,
        "titleBottomSpacing": parseInt(l.titlePaddingBottom || 28),
        "titleColor": 0,
        "titleColorNight": 0,
        "titleFont": "",
        "titleLineSpacingExtra": 18,
        "titleLineSpacingSub": -7,
        "titleMode": 0,
        "titleSegDistance": 4,
        "titleSegFlag": "[章节卷]",
        "titleSegScaling": 1.2,
        "titleSegType": 3,
        "titleSize": 16,
        "titleTopSpacing": parseInt(l.titleMarginTop || 0),
        "underline": true,
        "underlineColor": "#3E3D3B",
        "underlineColorNight": "#ADADAD",
        "underlineExtend": false,
        "underlineHeight": 2,
        "underlinePadding": 10
      };
    }

    zip.file('readConfig.json', JSON.stringify(readConfig, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${name}_阅读排版.md3.zip`);
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  function buildUiConfig(d, name) {
    return {
      appColumnBackgroundOpacity: 100,
      appTheme: '12',
      baseCardBorderColor: 0,
      baseCardBorderColorNight: 0,
      baseCardBorderWidth: 1.0,
      baseCardCornerRadius: 16.0,
      bgImageBlurring: 3,
      bgImageNBlurring: 0,
      bookInfoBackgroundBlur: 'on',
      bookInfoDefaultCoverBackground: 'on',
      bookInfoFollowCoverColor: true,
      bookInfoInputColor: 0,
      bookInfoNetworkCoverBackground: 'on',
      bookshelfCardColor: hexToArgbInt(d.cardColor),
      bookshelfCardColorDark: hexToArgbInt(d.cardColorDark),
      bottomBarBlurAlpha: 40,
      bottomBarBlurRadius: 10,
      bottomBarLensRadius: 24.0,
      bottomBarOpacity: 94,
      cNPrimary: hexToArgbInt(d.primaryColorDark),
      cPrimary:  hexToArgbInt(d.primaryColor),
      composeEngine: 'material',
      containerOpacity: 74,
      coverDefaultColor: true,
      coverDefaultImage: '',
      coverDefaultImageDark: '',
      coverInfoOrientation: '0',
      coverLoadOnlyWifi: false,
      coverShadowColor: -16777216,
      coverShadowColorN: -1,
      coverShowAuthor: true,
      coverShowAuthorN: true,
      coverShowName: false,
      coverShowNameN: false,
      coverShowShadow: false,
      coverShowStroke: true,
      coverTextColor: -16777216,
      coverTextColorN: -1,
      coverUseDefault: true,
      customContrast: 'Default',
      customMode: 'tonalSpot',
      defaultHomePage: 'bookshelf',
      disableSplicedColumnGroupCornerRadius: true,
      enableBlur: true,
      enableContainerBackgroundImage: !!d.bgBlob,
      enableCustomTagColors: true,
      enableDeepPersonalization: false,
      enableItemDivider: false,
      enableProgressiveBlur: true,
      fontScale: 10,
      glassCardBackgroundOpacity: 74,
      isPredictiveBackEnabled: true,
      isPureBlack: false,
      itemDividerColor: 0,
      itemDividerLength: 80.0,
      itemDividerWidth: 1.0,
      labelContainerColor: 0,
      labelContainerColorNight: 0,
      labelVisibilityMode: 'auto',
      launcherIcon: 'launcherw',
      mainNavigationOrder: 'home,bookshelf,explore,rss,my',
      materialVersion: 'material3',
      navIconBookshelf: '',
      navIconExplore: '',
      navIconHome: '',
      navIconMy: '',
      navIconRss: '',
      overrideBaseCardBorder: false,
      overrideBaseCardCornerRadius: true,
      paletteStyle: 'tonalSpot',
      primaryTextColor: -16777216,
      primaryTextColorNight: -1,
      secondaryTextColor: -12948802,
      secondaryTextColorNight: -7566194,
      secondaryThemeColor: 0,
      secondaryThemeColorNight: 0,
      showBottomView: true,
      showDiscovery: true,
      showHome: true,
      showRss: true,
      showStatusBar: true,
      swipeAnimation: true,
      tabletInterface: 'auto',
      themeBackgroundColor: -855051,
      themeBackgroundColorNight: -16777216,
      themeColor: 0,
      themeColorNight: 0,
      themeMode: '1',
      topBarBlurAlpha: 73,
      topBarBlurRadius: 29,
      topBarOpacity: 100,
      useFlexibleTopAppBar: false,
      useFloatingBottomBar: true,
      useFloatingBottomBarLiquidGlass: true,
      useMiuixMonet: false
    };
  }

});
