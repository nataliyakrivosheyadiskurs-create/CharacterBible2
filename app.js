// =============================================
// Character Bible NEXT — Main App
// =============================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── STATE ──
let chars = [], books = [], charBooks = [], relationships = [], images = [];
let currentChar = null;

const INTENSITY_COLORS = {
  'враждебные': '#cb7883', 'напряжённые': '#d79a4c',
  'нейтральные': '#6a6260', 'тёплые': '#5a9e8f',
  'близкие': '#6b8fc9', 'преданные': '#c9962a'
};
const ROLE_COLORS = {
  'Главный герой': '#c9962a', 'Антагонист': '#cb7883',
  'Второстепенный': '#6a6260', 'Союзник': '#5a9e8f',
  'Наставник': '#6b8fc9', 'Любовный интерес': '#cb7883',
  'Другое': '#6a6260'
};

// ── INIT ──
async function init() {
  await loadAll();
  renderLibrary();
  renderAlbum();
  renderRelationsTab();
  populateRelDialog();
  setupImport();
  updateStats();
}

async function loadAll() {
  const [charsRes, booksRes, charBooksRes, relsRes, imgsRes] = await Promise.all([
    db.from('characters').select('*').order('created_at'),
    db.from('books').select('*').order('book_order'),
    db.from('character_books').select('*').order('book_order'),
    db.from('relationships').select('*'),
    db.from('character_images').select('*').order('created_at')
  ]);
  chars = charsRes.data || [];
  books = booksRes.data || [];
  charBooks = charBooksRes.data || [];
  relationships = relsRes.data || [];
  images = imgsRes.data || [];
}

// ── HELPERS ──
function getChar(id) { return chars.find(c => c.id === id); }
function getImages(charId) { return images.filter(i => i.character_id === charId); }
function getRels(charId) { return relationships.filter(r => r.character_id === charId || r.target_id === charId); }
function getCharBooks(charId) { return charBooks.filter(b => b.character_id === charId).sort((a,b) => (a.book_order||0)-(b.book_order||0)); }
function colorFor(c) { return c.color || '#c9962a'; }
function initials(name) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function avatarHtml(c, size = 'sm') {
  const imgs = getImages(c.id);
  const av = imgs.find(i => i.id === c.avatar_image_id) || imgs[0];
  const cls = size === 'lg' ? 'portrait large' : 'portrait';
  if (av) return `<div class="${cls}"><img src="${av.url}" alt="${c.name}"></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,${colorFor(c)},${colorFor(c)}88)">${c.emoji || initials(c.name)}</div>`;
}

// ── STATS ──
function updateStats() {
  const el = id => document.getElementById(id);
  if (el('characterCount')) el('characterCount').textContent = chars.length;
  if (el('relationCount')) {
    const pairs = new Set(relationships.map(r => [r.character_id, r.target_id].sort().join('-')));
    el('relationCount').textContent = pairs.size;
  }
  // Update timeline years
  const years = books.map(b => [b.timeline_start, b.timeline_end]).flat().filter(Boolean);
  // header label
  const headerLabel = document.querySelector('header label');
  if (headerLabel && books.length) {
    const titles = books.map(b => b.title).join(' · ');
    headerLabel.textContent = titles;
  }
}

// ── LIBRARY ── 
function renderLibrary(filter = 'all') {
  const container = document.getElementById('cards');
  if (!container) return;

  let list = chars;
  if (filter === 'lead') list = chars.filter(c => (c.char_type || 'main') === 'main');
  else if (filter.startsWith('family:')) {
    const fam = filter.split(':')[1];
    list = chars.filter(c => c.family === fam);
  }

  if (!list.length) {
    container.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">♙</div><p>Персонажей пока нет.<br>Импортируй данные через вкладку «Миграция».</p></div>`;
    return;
  }

  container.innerHTML = list.map(c => {
    const cImgs = getImages(c.id);
    const av = cImgs.find(i => i.id === c.avatar_image_id) || cImgs[0];
    const cBooks = getCharBooks(c.id);
    const isSecondary = (c.char_type || 'main') === 'secondary';

    const rolesHtml = cBooks.slice(0, 3).map(cb => {
      const col = ROLE_COLORS[cb.role] || '#6a6260';
      return `<div class="card-role-row">
        <div class="card-role-dot" style="background:${col}"></div>
        <span class="card-role-book">${cb.book_title || ''}</span>
        <span class="card-role-label" style="color:${col}">${cb.role || ''}</span>
      </div>`;
    }).join('');

    const imgHtml = av
      ? `<img class="card-img" src="${av.url}" alt="${c.name}" style="object-position:${{'top':'50% 15%','center':'50% 50%','bottom':'50% 85%'}[c.avatar_position||'top']||'50% 15%'}">`
      : `<div class="card-placeholder" style="background:${colorFor(c)}18">${c.emoji || '👤'}</div>`;

    return `<div class="card" onclick="openChar('${c.id}')">
      ${isSecondary ? '<div class="secondary-badge">Второстепенный</div>' : ''}
      ${imgHtml}
      <div class="card-body">
        <div class="card-name">${c.name}</div>
        ${c.family ? `<div class="card-family">${c.family}</div>` : ''}
        <div class="card-roles">${rolesHtml || `<div class="card-role-row"><span style="font-size:11px;color:var(--text3)">${c.role||'—'}</span></div>`}</div>
      </div>
      <div class="card-footer">
        <span>🔗 ${getRels(c.id).length}</span>
        <span>🖼 ${cImgs.length}</span>
        <span>📚 ${cBooks.length}</span>
      </div>
    </div>`;
  }).join('');
}

// ── OPEN CHAR ──
function openChar(id) {
  currentChar = getChar(id);
  if (!currentChar) return;
  switchTab('character');
  renderCharTab();
}

function renderCharTab() {
  const c = currentChar;
  if (!c) return;

  // Portrait
  const portEl = document.getElementById('heroPortrait');
  if (portEl) {
    const imgs = getImages(c.id);
    const av = imgs.find(i => i.id === c.avatar_image_id) || imgs[0];
    if (av) {
      portEl.innerHTML = `<img src="${av.url}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover">`;
    } else {
      portEl.style.background = `linear-gradient(135deg,${colorFor(c)},${colorFor(c)}88)`;
      portEl.textContent = c.emoji || initials(c.name);
    }
  }

  // Header info
  const nameEl = document.getElementById('heroName');
  if (nameEl) nameEl.textContent = c.name + (c.nickname ? ` «${c.nickname}»` : '');

  const bioEl = document.getElementById('heroBio');
  if (bioEl) bioEl.textContent = c.bio || c.appearance || '—';

  const metaEl = document.getElementById('heroMeta');
  if (metaEl) {
    const parts = [
      c.birth_date ? `р. ${c.birth_date}` : '',
      c.family || '',
      `${getImages(c.id).length} изображений`
    ].filter(Boolean);
    metaEl.textContent = parts.join(' · ');
  }

  // Roles
  const rolesEl = document.getElementById('heroRoles');
  if (rolesEl) {
    const cBooks = getCharBooks(c.id);
    rolesEl.innerHTML = cBooks.map(cb => {
      const col = ROLE_COLORS[cb.role] || '#6a6260';
      return `<span class="role-badge" style="color:${col};border-color:${col}40;background:${col}15">${cb.book_title}: ${cb.role}</span>`;
    }).join('') || `<span class="role-badge" style="color:var(--gold);border-color:var(--gold)40;background:rgba(201,150,42,0.1)">${c.role||'Персонаж'}</span>`;
  }

  // Relations
  renderCharRelations(c.id);

  // Books
  renderCharBooks(c.id);

  // Album button
  const albumBtn = document.querySelector('[data-tab="album"]');
  if (albumBtn) albumBtn.onclick = () => { switchTab('album'); renderAlbum(c.id); };
}

function renderCharRelations(charId) {
  const el = document.getElementById('relationsList');
  if (!el) return;
  const rels = getRels(charId);
  if (!rels.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🔗</div><p>Связей пока нет</p></div>'; return; }

  el.innerHTML = rels.map(r => {
    const isFrom = r.character_id === charId;
    const otherId = isFrom ? r.target_id : r.character_id;
    const other = getChar(otherId);
    if (!other) return '';
    const intColor = INTENSITY_COLORS[r.intensity || 'нейтральные'] || '#6a6260';
    const fromPov = isFrom ? r.from_pov : r.to_pov;
    const toPov = isFrom ? r.to_pov : r.from_pov;
    const fromName = isFrom ? (getChar(charId)||{}).name : other.name;
    const toName = isFrom ? other.name : (getChar(charId)||{}).name;

    return `<div class="rel-card">
      <div class="rel-card-header">
        <div class="rel-mini-avatar">${other.emoji || initials(other.name)}</div>
        <div>
          <div class="rel-name">${other.name}</div>
          <div class="rel-type">${r.type||''} <span class="rel-intensity" style="color:${intColor};background:${intColor}18">${r.intensity||''}</span></div>
        </div>
        <button class="ghost" style="margin-left:auto" onclick="editRel('${r.id}')">✎</button>
      </div>
      ${fromPov || toPov ? `<div class="rel-povs">
        ${fromPov ? `<div class="rel-pov"><div class="rel-pov-label">Взгляд ${fromName}</div><div class="rel-pov-text">${fromPov}</div></div>` : ''}
        ${toPov ? `<div class="rel-pov"><div class="rel-pov-label">Взгляд ${toName}</div><div class="rel-pov-text">${toPov}</div></div>` : ''}
      </div>` : ''}
      ${r.description ? `<div style="font-size:12px;color:var(--text2);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">${r.description}</div>` : ''}
    </div>`;
  }).join('');
}

function renderCharBooks(charId) {
  const el = document.getElementById('bookList');
  if (!el) return;
  const cbs = getCharBooks(charId);
  if (!cbs.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">📚</div><p>Не привязан ни к одной книге</p></div>'; return; }

  el.innerHTML = cbs.map(cb => {
    const col = ROLE_COLORS[cb.role] || '#6a6260';
    return `<div class="book-item">
      <div class="book-num">${cb.book_order || '?'}</div>
      <div class="book-info">
        <div class="book-title">${cb.book_title || '—'}</div>
        <div class="book-role" style="color:${col}">${cb.role || ''} ${cb.age_at_events ? `· ${cb.age_at_events}` : ''}</div>
        ${cb.arc ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">${cb.arc}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── ALBUM ──
function renderAlbum(charId = null) {
  const el = document.getElementById('albumGrid');
  if (!el) return;

  let imgs = charId ? getImages(charId) : images;
  // Update header
  const introH2 = document.querySelector('#album .intro h2');
  const introP = document.querySelector('#album .intro p');
  if (introH2) {
    if (charId) {
      const c = getChar(charId);
      introH2.textContent = c ? `Альбом · ${c.name}` : 'Альбом';
    } else {
      introH2.textContent = 'Общий альбом';
    }
  }

  // Char filter buttons
  const ageLine = document.querySelector('.age-line');
  if (ageLine && chars.length) {
    const btnHtml = `<div class="char-selector">
      <button class="char-selector-btn ${!charId?'active':''}" onclick="renderAlbum(null)">Все</button>
      ${chars.map(c => `<button class="char-selector-btn ${charId===c.id?'active':''}" onclick="renderAlbum('${c.id}')">${c.emoji||''} ${c.name.split(' ')[0]}</button>`).join('')}
    </div>`;
    const existingSel = document.querySelector('.char-selector');
    if (existingSel) existingSel.outerHTML = btnHtml;
    else ageLine.insertAdjacentHTML('beforebegin', btnHtml);
  }

  if (!imgs.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🖼</div><p>Изображений пока нет</p></div>';
    return;
  }

  el.innerHTML = imgs.map(img => {
    const c = getChar(img.character_id);
    return `<div class="album-item" onclick="openLightbox('${img.url}')">
      <img class="album-img" src="${img.url}" alt="${img.emotion||''}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">
      <div class="album-img-placeholder" style="display:none">🖼</div>
      <div class="album-meta">
        ${img.period ? `<div class="album-period">${img.period}</div>` : ''}
        ${img.emotion ? `<div class="album-emotion">${img.emotion}</div>` : ''}
        ${img.comment ? `<div class="album-comment">${img.comment}</div>` : ''}
        ${c && !charId ? `<div class="album-char">${c.name}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── RELATIONS TAB ──
function renderRelationsTab() {
  const el = document.getElementById('relations');
  if (!el) return;

  // Full list of all relations
  const listDiv = el.querySelector('.relations-list') || (() => {
    const d = document.createElement('div');
    d.className = 'relations-list';
    el.appendChild(d);
    return d;
  })();

  if (!relationships.length) {
    // Keep the existing SVG map, just note no data
    return;
  }

  const pairs = new Map();
  relationships.forEach(r => {
    const key = [r.character_id, r.target_id].sort().join('-');
    if (!pairs.has(key)) pairs.set(key, r);
  });

  listDiv.innerHTML = [...pairs.values()].map(r => {
    const a = getChar(r.character_id), b = getChar(r.target_id);
    if (!a || !b) return '';
    const intColor = INTENSITY_COLORS[r.intensity || 'нейтральные'] || '#6a6260';
    return `<div class="rel-full-card">
      <div class="rel-full-header">
        <div class="rel-mini-avatar">${a.emoji || initials(a.name)}</div>
        <div class="rel-pair">${a.name} <span>↔</span> ${b.name}</div>
        <div class="rel-mini-avatar">${b.emoji || initials(b.name)}</div>
        <span class="rel-intensity" style="color:${intColor};background:${intColor}18;margin-left:auto">${r.type||''} · ${r.intensity||''}</span>
      </div>
      ${r.from_pov || r.to_pov ? `<div class="rel-povs">
        ${r.from_pov ? `<div class="rel-pov"><div class="rel-pov-label">Взгляд ${a.name}</div><div class="rel-pov-text">${r.from_pov}</div></div>` : ''}
        ${r.to_pov ? `<div class="rel-pov"><div class="rel-pov-label">Взгляд ${b.name}</div><div class="rel-pov-text">${r.to_pov}</div></div>` : ''}
      </div>` : ''}
      ${r.description ? `<div style="font-size:12px;color:var(--text2);margin-top:8px">${r.description}</div>` : ''}
    </div>`;
  }).join('');
}

// ── RELATION DIALOG ──
let editingRelId = null;

function populateRelDialog() {
  const sel = document.getElementById('toCharacter');
  if (!sel) return;
  sel.innerHTML = chars.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Open dialog buttons
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialog = document.getElementById(btn.dataset.open + 'Dialog');
      if (dialog) {
        editingRelId = null;
        populateRelDialog();
        // Pre-fill from name
        const fromEl = document.getElementById('fromName');
        if (fromEl && currentChar) fromEl.textContent = currentChar.name;
        dialog.showModal();
      }
    });
  });

  // Save relation
  const saveRelBtn = document.getElementById('saveRelation');
  if (saveRelBtn) {
    saveRelBtn.addEventListener('click', saveRelation);
  }

  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const filter = chip.dataset.filter;
      renderLibrary(filter === 'family' ? `family:${chip.textContent.replace('Семья ','').trim()}` : filter);
    });
  });

  // Build family chips dynamically
  const chipsContainer = document.querySelector('.chips');
  if (chipsContainer) {
    const families = [...new Set(chars.map(c=>c.family).filter(Boolean))];
    families.forEach(fam => {
      if (!chipsContainer.querySelector(`[data-filter="family:${fam}"]`)) {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.dataset.filter = `family:${fam}`;
        btn.textContent = `Семья ${fam}`;
        chipsContainer.appendChild(btn);
        btn.addEventListener('click', () => {
          document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
          btn.classList.add('selected');
          renderLibrary(`family:${fam}`);
        });
      }
    });
  }

  // Reset demo
  const resetBtn = document.getElementById('reset');
  if (resetBtn) resetBtn.addEventListener('click', () => { location.reload(); });

  // Album PDF
  const albumPdfBtn = document.getElementById('albumPdf');
  if (albumPdfBtn) albumPdfBtn.addEventListener('click', exportAlbumPdf);

  // PDF export
  const pdfBtn = document.getElementById('pdfExport');
  if (pdfBtn) pdfBtn.addEventListener('click', () => {
    if (currentChar) exportCharPdf(currentChar);
    else toast('Сначала открой карточку персонажа');
  });

  // Lightbox close
  document.addEventListener('click', e => {
    const lb = document.getElementById('lightbox');
    if (lb && e.target === lb) closeLightbox();
  });
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById(name);
  if (target) target.classList.add('active');
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  const titles = { library: 'История в одном взгляде', character: currentChar ? currentChar.name : 'Карточка героя', relations: 'Карта связей', album: 'Альбом образов', migration: 'Миграция данных' };
  const h1 = document.getElementById('pageTitle');
  if (h1) h1.textContent = titles[name] || name;
  if (name === 'album' && !document.querySelector('.char-selector')) renderAlbum();
  if (name === 'relations') renderRelationsTab();
}

async function saveRelation() {
  const toId = document.getElementById('toCharacter')?.value;
  const fromId = currentChar?.id;
  if (!fromId || !toId || fromId === toId) { toast('Выбери другого персонажа'); return; }

  const data = {
    character_id: fromId,
    target_id: toId,
    type: document.getElementById('relationType')?.value || '',
    from_pov: document.getElementById('fromView')?.value || '',
    to_pov: document.getElementById('toView')?.value || '',
  };

  const { error } = editingRelId
    ? await db.from('relationships').update(data).eq('id', editingRelId)
    : await db.from('relationships').insert(data);

  if (error) { toast('Ошибка: ' + error.message); return; }
  document.getElementById('relationDialog')?.close();
  await loadAll();
  renderCharRelations(fromId);
  renderRelationsTab();
  updateStats();
  toast('Связь сохранена');
}

function editRel(id) {
  const r = relationships.find(rel => rel.id === id);
  if (!r) return;
  editingRelId = id;
  const dialog = document.getElementById('relationDialog');
  if (!dialog) return;
  populateRelDialog();
  const otherId = r.character_id === currentChar?.id ? r.target_id : r.character_id;
  const sel = document.getElementById('toCharacter');
  if (sel) sel.value = otherId;
  if (document.getElementById('fromView')) document.getElementById('fromView').value = r.from_pov || '';
  if (document.getElementById('toView')) document.getElementById('toView').value = r.to_pov || '';
  if (document.getElementById('relationType')) document.getElementById('relationType').value = r.type || '';
  dialog.showModal();
}

// ── LIGHTBOX ──
function openLightbox(url) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9998;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
    lb.innerHTML = `<img style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain" id="lbImg">`;
    document.body.appendChild(lb);
    lb.addEventListener('click', closeLightbox);
  }
  document.getElementById('lbImg').src = url;
  lb.style.display = 'flex';
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
}

// ── TOAST ──
let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = 'none', 2500);
}

// ── SIMPLE PDF EXPORTS ──
function exportCharPdf(c) {
  const cBooks = getCharBooks(c.id);
  const rels = getRels(c.id);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${c.name}</title>
  <style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#1a1410;line-height:1.6}
  h1{font-size:28px;margin-bottom:4px}h2{font-size:16px;color:#8b3a1a;margin:20px 0 8px;border-bottom:1px solid #e8dfd2;padding-bottom:4px}
  p{margin-bottom:8px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
  td{padding:6px 8px;border-bottom:1px solid #e8dfd2}td:first-child{color:#8a7a6e;width:160px}</style></head><body>
  <h1>${c.name}${c.nickname?` «${c.nickname}»`:''}</h1>
  <p style="color:#8a7a6e">${[c.family, c.gender, c.birth_date?'р.'+c.birth_date:''].filter(Boolean).join(' · ')}</p>
  ${c.bio?`<h2>Биография</h2><p>${c.bio}</p>`:''}
  ${c.appearance?`<h2>Внешность</h2><p>${c.appearance}</p>`:''}
  ${c.personality?`<h2>Характер</h2><p>${c.personality}</p>`:''}
  ${c.motivation?`<h2>Мотивация</h2><p>${c.motivation}</p>`:''}
  ${cBooks.length?`<h2>Участие в книгах</h2><table>${cBooks.map(b=>`<tr><td>${b.book_title}</td><td>${b.role||''}</td><td>${b.arc||''}</td></tr>`).join('')}</table>`:''}
  ${rels.length?`<h2>Связи</h2><table>${rels.map(r=>{const o=getChar(r.character_id===c.id?r.target_id:r.character_id);return o?`<tr><td>${o.name}</td><td>${r.type||''}</td><td>${r.description||r.from_pov||''}</td></tr>`:''}).join('')}</table>`:''}
  </body></html>`);
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 500);
}

function exportAlbumPdf() {
  toast('Функция PDF альбома в разработке');
}

// ── START ──
init();
