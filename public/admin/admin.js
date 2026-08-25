(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const state = {
    settingsLoaded: false,
    articlesLoaded: false,
    imagesLoaded: false,
    statusLoaded: false,
    articles: [],
    currentArticle: null,
    articleCoverFile: null,
    imageUploads: new Map(),
  };

  const loginScreen = byId('login-screen');
  const adminApp = byId('admin-app');
  const loadingOverlay = byId('loading-overlay');
  const loadingMessage = byId('loading-message');
  const pageTitle = byId('page-title');
  const pageDescription = byId('page-description');
  const deployIndicator = byId('deploy-indicator');

  function setLoading(active, message = '處理中…') {
    loadingMessage.textContent = message;
    loadingOverlay.hidden = !active;
  }

  function toast(message, type = 'success') {
    const item = document.createElement('div');
    item.className = `toast${type === 'error' ? ' error' : ''}`;
    item.textContent = message;
    byId('toast-region').append(item);
    window.setTimeout(() => item.remove(), 5200);
  }

  function markDeploymentPending() {
    deployIndicator.classList.add('pending');
    deployIndicator.querySelector('span:last-child').textContent = '網站更新處理中';
  }

  function showLogin(message = '') {
    adminApp.hidden = true;
    loginScreen.hidden = false;
    byId('login-error').textContent = message;
    byId('login-password').focus();
  }

  function showApp() {
    loginScreen.hidden = true;
    adminApp.hidden = false;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/admin/${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { message: '伺服器回傳了無法辨識的內容。' };
    if (!response.ok) {
      if (response.status === 401 && path !== 'login') showLogin('登入已失效，請重新登入。');
      const error = new Error(payload.message || payload.error || '操作失敗，請稍後再試。');
      error.details = payload.details;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setSelectOptions(select, options) {
    select.replaceChildren();
    options.forEach((option) => {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      select.append(element);
    });
  }

  function createLockedCard(label, value) {
    const card = document.createElement('div');
    card.className = 'locked-card';
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    const valueElement = document.createElement('strong');
    valueElement.textContent = value;
    valueElement.title = value;
    card.append(labelElement, valueElement);
    return card;
  }

  function renderHours(days, values) {
    const list = byId('hours-list');
    list.replaceChildren();
    days.forEach((day) => {
      const row = document.createElement('div');
      row.className = 'hours-row';
      row.dataset.day = day.key;

      const dayLabel = document.createElement('span');
      dayLabel.textContent = day.label;
      const start = document.createElement('input');
      start.type = 'time';
      start.className = 'hours-start';
      start.setAttribute('aria-label', `${day.label}開始時間`);
      const separator = document.createElement('span');
      separator.textContent = '—';
      separator.setAttribute('aria-hidden', 'true');
      const end = document.createElement('input');
      end.type = 'time';
      end.className = 'hours-end';
      end.setAttribute('aria-label', `${day.label}結束時間`);
      const closedLabel = document.createElement('label');
      closedLabel.className = 'closed-toggle';
      const closed = document.createElement('input');
      closed.type = 'checkbox';
      closed.className = 'hours-closed';
      const closedText = document.createElement('span');
      closedText.textContent = '公休';
      closedLabel.append(closed, closedText);

      const current = values[day.key];
      if (current === '公休') {
        closed.checked = true;
        start.disabled = true;
        end.disabled = true;
      } else {
        const [startValue, endValue] = String(current || '09:00 - 21:00').split(' - ');
        start.value = startValue || '09:00';
        end.value = endValue || '21:00';
      }
      closed.addEventListener('change', () => {
        start.disabled = closed.checked;
        end.disabled = closed.checked;
        if (!closed.checked && !start.value) start.value = '09:00';
        if (!closed.checked && !end.value) end.value = '21:00';
      });
      row.append(dayLabel, start, separator, end, closedLabel);
      list.append(row);
    });
  }

  function updateSettingsPreview(derived) {
    byId('preview-phone').textContent = derived.phoneDisplay;
    byId('preview-hours').textContent = `${derived.hoursLabel}｜${derived.bookingLabel}`;
    byId('preview-notice').textContent = derived.businessNotice;
  }

  async function loadSettings(force = false) {
    if (state.settingsLoaded && !force) return;
    const payload = await api('settings');
    const { settings, options, locked, derived } = payload;
    byId('setting-phone').value = settings.phone;
    byId('setting-line').value = settings.lineId;
    byId('setting-address').value = settings.address;
    setSelectOptions(byId('setting-booking'), options.bookingModes);
    setSelectOptions(byId('setting-status'), options.businessStatuses);
    byId('setting-booking').value = settings.bookingMode;
    byId('setting-status').value = settings.businessStatus;
    renderHours(options.days, settings.businessHours);

    const lockedGrid = byId('locked-grid');
    lockedGrid.replaceChildren(
      createLockedCard('品牌名稱', locked.brandName),
      createLockedCard('正式店名', locked.businessName),
      createLockedCard('英文名稱', locked.englishName),
      createLockedCard('正式網域', locked.siteUrl),
      createLockedCard('服務區域', locked.serviceArea),
    );
    updateSettingsPreview(derived);
    state.settingsLoaded = true;
  }

  function collectSettings() {
    const businessHours = {};
    document.querySelectorAll('.hours-row').forEach((row) => {
      const key = row.dataset.day;
      const closed = row.querySelector('.hours-closed').checked;
      const start = row.querySelector('.hours-start').value;
      const end = row.querySelector('.hours-end').value;
      businessHours[key] = closed ? '公休' : `${start} - ${end}`;
    });
    return {
      phone: byId('setting-phone').value,
      lineId: byId('setting-line').value,
      address: byId('setting-address').value,
      bookingMode: byId('setting-booking').value,
      businessStatus: byId('setting-status').value,
      businessHours,
    };
  }

  async function saveSettings(event) {
    event.preventDefault();
    setLoading(true, '正在儲存基本資料…');
    try {
      const result = await api('settings', { method: 'PUT', body: JSON.stringify(collectSettings()) });
      updateSettingsPreview(result.derived);
      markDeploymentPending();
      toast('基本資料已儲存，網站正在建立新版本。');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function dateLabel(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-TW').format(date);
  }

  function createArticleRow(article) {
    const row = document.createElement('article');
    row.className = 'article-row';
    row.dataset.search = `${article.title} ${article.description}`.toLowerCase();

    const name = document.createElement('div');
    name.className = 'article-name';
    const image = document.createElement('img');
    image.src = article.coverImage;
    image.alt = '';
    image.loading = 'lazy';
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = article.title;
    const description = document.createElement('small');
    description.textContent = article.description;
    text.append(title, description);
    name.append(image, text);

    const date = document.createElement('span');
    date.className = 'article-date';
    date.textContent = dateLabel(article.publishDate);
    const status = document.createElement('span');
    status.className = `status-pill ${article.status}`;
    status.textContent = article.status === 'published' ? '已上架' : '已下架';

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '修改';
    edit.addEventListener('click', () => openExistingArticle(article.slug));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = article.status === 'published' ? '下架' : '重新上架';
    toggle.addEventListener('click', () => toggleArticleStatus(article));
    actions.append(edit, toggle);
    row.append(name, date, status, actions);
    return row;
  }

  function renderArticles() {
    const query = byId('article-search').value.trim().toLowerCase();
    const filtered = state.articles.filter((article) => !query || `${article.title} ${article.description}`.toLowerCase().includes(query));
    const list = byId('article-list');
    list.replaceChildren();
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = query ? '找不到符合的文章。' : '目前還沒有美容小知識文章。';
      list.append(empty);
    } else {
      filtered.forEach((article) => list.append(createArticleRow(article)));
    }
    const published = state.articles.filter((article) => article.status === 'published').length;
    byId('article-count').textContent = `${state.articles.length} 篇文章｜${published} 篇上架`;
  }

  async function loadArticles(force = false) {
    if (state.articlesLoaded && !force) return;
    const payload = await api('articles');
    state.articles = payload.articles;
    state.articlesLoaded = true;
    renderArticles();
  }

  function tagsToArray(value) {
    return value.split(/[、,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  }

  function openArticleEditor(article = null) {
    state.currentArticle = article;
    state.articleCoverFile = null;
    byId('article-list-view').hidden = true;
    byId('article-editor').hidden = false;
    byId('article-editor-title').textContent = article ? '修改美容小知識' : '新增美容小知識';
    byId('article-title').value = article?.title || '';
    byId('article-description').value = article?.description || '';
    byId('article-tags').value = (article?.tags || ['美容小知識']).join('、');
    byId('article-date').value = article?.publishDate || new Date().toISOString().slice(0, 10);
    byId('article-body').value = article?.body || '';
    byId('article-cover-preview').src = article?.coverImage || '/images/blog-1.jpg';
    byId('article-cover-file').value = '';
    updateEditorCounts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeArticleEditor() {
    byId('article-editor').hidden = true;
    byId('article-list-view').hidden = false;
    state.currentArticle = null;
    state.articleCoverFile = null;
  }

  async function openExistingArticle(slug) {
    setLoading(true, '正在讀取文章…');
    try {
      const payload = await api(`articles/${encodeURIComponent(slug)}`);
      openArticleEditor(payload.article);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggleArticleStatus(article) {
    const nextStatus = article.status === 'published' ? 'unpublished' : 'published';
    const action = nextStatus === 'published' ? '重新上架' : '下架';
    if (!window.confirm(`確定要${action}「${article.title}」嗎？`)) return;
    setLoading(true, `正在${action}文章…`);
    try {
      await api(`articles/${encodeURIComponent(article.slug)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      state.articlesLoaded = false;
      await loadArticles(true);
      markDeploymentPending();
      toast(`文章已${action}，網站正在建立新版本。`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function updateEditorCounts() {
    byId('description-count').textContent = String(byId('article-description').value.length);
    byId('body-count').textContent = String(byId('article-body').value.length);
  }

  function applyMarkdownFormat(type) {
    const textarea = byId('article-body');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    let replacement;
    let cursorOffset = 0;
    if (type === 'heading') {
      replacement = `## ${selected || '小標題'}`;
      cursorOffset = selected ? replacement.length : 3;
    } else if (type === 'bold') {
      replacement = `**${selected || '重點文字'}**`;
      cursorOffset = selected ? replacement.length : 2;
    } else if (type === 'list') {
      replacement = (selected || '項目內容').split('\n').map((line) => `- ${line}`).join('\n');
      cursorOffset = replacement.length;
    } else if (type === 'quote') {
      replacement = `> ${selected || '重點提醒'}`;
      cursorOffset = replacement.length;
    } else {
      replacement = `[${selected || '連結文字'}](https://)`;
      cursorOffset = replacement.length - 1;
    }
    textarea.setRangeText(replacement, start, end, 'end');
    if (!selected && cursorOffset > 0) textarea.selectionStart = textarea.selectionEnd = start + cursorOffset;
    textarea.focus();
    updateEditorCounts();
  }

  async function loadImageSource(file) {
    if ('createImageBitmap' in window) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片。')); };
      image.src = url;
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('無法處理圖片檔案。'));
      reader.readAsDataURL(blob);
    });
  }

  async function cropImage(file, width, height, mimeType) {
    if (!file.type.startsWith('image/')) throw new Error('請選擇 JPG、PNG 或 WebP 圖片。');
    if (file.size > 18_000_000) throw new Error('原始圖片請勿超過 18 MB。');
    const source = await loadImageSource(file);
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: mimeType === 'image/png' });
    if (!context) throw new Error('瀏覽器無法裁切圖片。');
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#f4eee9';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    if (typeof source.close === 'function') source.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('圖片轉換失敗。')), mimeType, 0.86);
    });
    return { blob, base64: await blobToBase64(blob), previewUrl: URL.createObjectURL(blob) };
  }

  async function saveArticle(event) {
    event.preventDefault();
    setLoading(true, '正在儲存美容小知識…');
    try {
      let coverImage = state.currentArticle?.coverImage || '/images/blog-1.jpg';
      if (state.articleCoverFile) {
        loadingMessage.textContent = '正在裁切與上傳文章首圖…';
        const image = await cropImage(state.articleCoverFile, 1200, 750, 'image/jpeg');
        const uploaded = await api('images/article', {
          method: 'POST',
          body: JSON.stringify({ contentBase64: image.base64, mimeType: 'image/jpeg' }),
        });
        URL.revokeObjectURL(image.previewUrl);
        coverImage = uploaded.publicPath;
      }
      loadingMessage.textContent = '正在送出文章內容…';
      const input = {
        title: byId('article-title').value,
        description: byId('article-description').value,
        tags: tagsToArray(byId('article-tags').value),
        publishDate: byId('article-date').value,
        coverImage,
        status: state.currentArticle?.status || 'published',
        body: byId('article-body').value,
      };
      if (state.currentArticle) {
        await api(`articles/${encodeURIComponent(state.currentArticle.slug)}`, { method: 'PUT', body: JSON.stringify(input) });
      } else {
        await api('articles', { method: 'POST', body: JSON.stringify(input) });
      }
      state.articlesLoaded = false;
      await loadArticles(true);
      closeArticleEditor();
      markDeploymentPending();
      toast('文章已儲存，網站正在建立新版本。');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function createImageSlotCard(slot) {
    const card = document.createElement('article');
    card.className = 'content-card image-slot-card';
    const preview = document.createElement('div');
    preview.className = 'slot-preview';
    const image = document.createElement('img');
    image.src = slot.publicPath;
    image.alt = `${slot.label}預覽`;
    const size = document.createElement('span');
    size.textContent = `${slot.width} × ${slot.height}`;
    preview.append(image, size);

    const body = document.createElement('div');
    body.className = 'slot-body';
    const title = document.createElement('h2');
    title.textContent = slot.label;
    const help = document.createElement('p');
    help.textContent = slot.help;
    const actions = document.createElement('div');
    actions.className = 'slot-actions';
    const fileLabel = document.createElement('label');
    fileLabel.className = 'secondary-button file-button';
    fileLabel.textContent = '選擇圖片';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileLabel.append(fileInput);
    const update = document.createElement('button');
    update.type = 'button';
    update.className = 'primary-button';
    update.textContent = '更新圖片';
    update.disabled = true;
    const filename = document.createElement('span');
    filename.className = 'slot-filename';
    filename.textContent = '尚未選擇新圖片';
    actions.append(fileLabel, update);
    body.append(title, help, actions, filename);
    card.append(preview, body);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      update.disabled = true;
      filename.textContent = '正在建立裁切預覽…';
      try {
        const prepared = await cropImage(file, slot.width, slot.height, slot.mimeType);
        const previous = state.imageUploads.get(slot.id);
        if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
        state.imageUploads.set(slot.id, prepared);
        image.src = prepared.previewUrl;
        filename.textContent = `${file.name}｜裁切後 ${Math.ceil(prepared.blob.size / 1024)} KB`;
        update.disabled = false;
      } catch (error) {
        fileInput.value = '';
        filename.textContent = '尚未選擇新圖片';
        toast(error.message, 'error');
      }
    });

    update.addEventListener('click', async () => {
      const prepared = state.imageUploads.get(slot.id);
      if (!prepared) return;
      setLoading(true, `正在更新${slot.label}…`);
      try {
        await api(`images/${slot.id}`, {
          method: 'PUT',
          body: JSON.stringify({ contentBase64: prepared.base64, mimeType: slot.mimeType }),
        });
        markDeploymentPending();
        toast(`${slot.label}已儲存，網站正在建立新版本。`);
        update.disabled = true;
        filename.textContent = '新圖片已送出';
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setLoading(false);
      }
    });
    return card;
  }

  async function loadImages(force = false) {
    if (state.imagesLoaded && !force) return;
    const payload = await api('images');
    const grid = byId('image-slot-grid');
    grid.replaceChildren(...payload.images.map(createImageSlotCard));
    state.imagesLoaded = true;
  }

  function createStatusCard(label, value, help, online = false) {
    const card = document.createElement('div');
    card.className = `status-card${online ? ' online' : ''}`;
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    const valueElement = document.createElement('strong');
    valueElement.textContent = value;
    const helpElement = document.createElement('small');
    helpElement.textContent = help;
    card.append(labelElement, valueElement, helpElement);
    return card;
  }

  async function loadStatus(force = false) {
    if (state.statusLoaded && !force) return;
    const payload = await api('status');
    const grid = byId('status-grid');
    grid.replaceChildren(
      createStatusCard('正式網站', payload.siteOnline ? '正常' : '待確認', payload.siteOnline ? '目前可以正常連線' : '請稍後重新整理', payload.siteOnline),
      createStatusCard('已上架文章', String(payload.publishedArticleCount), `全部共 ${payload.articleCount} 篇`),
      createStatusCard('圖片位置', String(payload.imagesConfigured), '固定位置，避免誤改版型'),
      createStatusCard('自動部署', '已連接', `${payload.branch} 分支`),
    );
    const commit = payload.latestCommit;
    byId('latest-commit').textContent = commit ? `${commit.sha.slice(0, 7)}｜${commit.message.split('\n')[0]}` : '暫無版本資料';
    byId('latest-commit-date').textContent = commit?.date ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(commit.date)) : '';
    byId('repository-name').textContent = payload.repository;
    byId('repository-branch').textContent = `正式分支：${payload.branch}`;
    state.statusLoaded = true;
  }

  async function activatePanel(name) {
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.panel === name));
    document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`));
    const panel = byId(`panel-${name}`);
    pageTitle.textContent = panel.dataset.title;
    pageDescription.textContent = panel.dataset.description;
    byId('sidebar').classList.remove('open');
    byId('menu-button').setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      if (name === 'settings') await loadSettings();
      if (name === 'articles') await loadArticles();
      if (name === 'images') await loadImages();
      if (name === 'status') await loadStatus();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function login(event) {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    byId('login-error').textContent = '';
    try {
      await api('login', { method: 'POST', body: JSON.stringify({ password: byId('login-password').value }) });
      byId('login-password').value = '';
      showApp();
      await activatePanel('settings');
    } catch (error) {
      byId('login-error').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  async function logout() {
    try { await api('logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* Cookie still expires server-side when available. */ }
    window.location.reload();
  }

  function bindEvents() {
    byId('login-form').addEventListener('submit', login);
    byId('toggle-password').addEventListener('click', () => {
      const input = byId('login-password');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      byId('toggle-password').textContent = showing ? '顯示' : '隱藏';
      byId('toggle-password').setAttribute('aria-label', showing ? '顯示密碼' : '隱藏密碼');
    });
    document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => activatePanel(button.dataset.panel)));
    byId('menu-button').addEventListener('click', () => {
      const open = byId('sidebar').classList.toggle('open');
      byId('menu-button').setAttribute('aria-expanded', String(open));
    });
    byId('logout-button').addEventListener('click', logout);
    byId('settings-form').addEventListener('submit', saveSettings);
    byId('new-article-button').addEventListener('click', () => openArticleEditor());
    byId('article-back-button').addEventListener('click', closeArticleEditor);
    byId('article-search').addEventListener('input', renderArticles);
    byId('article-description').addEventListener('input', updateEditorCounts);
    byId('article-body').addEventListener('input', updateEditorCounts);
    byId('article-editor').addEventListener('submit', saveArticle);
    document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => applyMarkdownFormat(button.dataset.format)));
    byId('article-cover-file').addEventListener('change', () => {
      const file = byId('article-cover-file').files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 18_000_000) {
        byId('article-cover-file').value = '';
        toast('請選擇 18 MB 以下的 JPG、PNG 或 WebP 圖片。', 'error');
        return;
      }
      state.articleCoverFile = file;
      byId('article-cover-preview').src = URL.createObjectURL(file);
    });
    byId('refresh-status-button').addEventListener('click', async () => {
      setLoading(true, '正在重新整理網站狀態…');
      try {
        await loadStatus(true);
        toast('網站狀態已更新。');
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setLoading(false);
      }
    });
  }

  async function initialize() {
    bindEvents();
    try {
      const session = await api('session');
      if (session.authenticated) {
        showApp();
        await activatePanel('settings');
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin(error.status === 503 ? error.message : '後台服務暫時無法連線，請稍後再試。');
    }
  }

  initialize();
})();
