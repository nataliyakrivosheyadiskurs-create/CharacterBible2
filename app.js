// =============================================
// Character Bible NEXT — App v2
// =============================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let chars=[], books=[], charBooks=[], relationships=[], images=[];
let currentChar=null, albumCharId=null;
let editingCharId=null, editingRelId=null;

const INTENSITY_COLORS={'враждебные':'#8b1a2a','напряжённые':'#c47a1a','нейтральные':'#8a7a6e','тёплые':'#1a6b5a','близкие':'#1a4a8b','преданные':'#8b3a1a'};
const ROLE_COLORS={'Главный герой':'#8b3a1a','Антагонист':'#8b1a2a','Второстепенный':'#8a7a6e','Союзник':'#1a6b5a','Наставник':'#1a4a8b','Любовный интерес':'#8b1a4a','Другое':'#8a7a6e'};

// ── INIT ──
async function init(){
  await loadAll();
  renderLibrary();
  renderAlbum(null);
  updateStats();
  setupNavigation();
  setupChipFilters();
  setupImport();
  buildFamilyChips();
}

async function loadAll(){
  const [a,b,c,d,e]=await Promise.all([
    db.from('characters').select('*').order('created_at'),
    db.from('books').select('*').order('book_order'),
    db.from('character_books').select('*').order('book_order'),
    db.from('relationships').select('*'),
    db.from('character_images').select('*').order('created_at')
  ]);
  chars=a.data||[]; books=b.data||[]; charBooks=c.data||[]; relationships=d.data||[]; images=e.data||[];
}

// ── HELPERS ──
function getChar(id){return chars.find(c=>c.id===id);}
function getImages(cid){return images.filter(i=>i.character_id===cid);}
function getRels(cid){return relationships.filter(r=>r.character_id===cid||r.target_id===cid);}
function getCharBooks(cid){return charBooks.filter(b=>b.character_id===cid).sort((a,b)=>(a.book_order||0)-(b.book_order||0));}
function colorFor(c){return c.color||'#8b3a1a';}
function initials(name){return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}

function avatarEl(c,size='sm'){
  const imgs=getImages(c.id);
  const av=imgs.find(i=>i.id===c.avatar_image_id)||imgs[0];
  const cls=size==='lg'?'portrait large':'portrait';
  const col=colorFor(c);
  if(av) return `<div class="${cls}" style="background:${col}22"><img src="${av.url}" alt="${c.name}"></div>`;
  return `<div class="${cls}" style="background:linear-gradient(135deg,${col},${col}88);color:white">${c.emoji||initials(c.name)}</div>`;
}

// ── STATS ──
function updateStats(){
  const el=id=>document.getElementById(id);
  if(el('characterCount')) el('characterCount').textContent=chars.length;
  if(el('bookCount')) el('bookCount').textContent=books.length||[...new Set(charBooks.map(b=>b.book_title))].length;
  if(el('imageCount')) el('imageCount').textContent=images.length;
  if(el('relationCount')){
    const pairs=new Set(relationships.map(r=>[r.character_id,r.target_id].sort().join('-')));
    el('relationCount').textContent=pairs.size;
  }
}

// ── NAVIGATION ──
function setupNavigation(){
  document.querySelectorAll('[data-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
  });
  document.getElementById('reset')?.addEventListener('click',()=>{loadAll().then(()=>{renderLibrary();updateStats();toast('Обновлено');});});
}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const target=document.getElementById(name);
  if(target) target.classList.add('active');
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  const titles={library:'История в одном взгляде',character:currentChar?currentChar.name:'Карточка героя',relations:'Карта связей',album:'Альбом образов',migration:'Импорт данных'};
  const h1=document.getElementById('pageTitle');
  if(h1) h1.textContent=titles[name]||name;
  if(name==='relations') renderRelationsTab();
  if(name==='album') renderAlbum(albumCharId);
}

// ── LIBRARY ──
function setupChipFilters(){
  document.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      document.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      renderLibrary(chip.dataset.filter);
    });
  });
}

function buildFamilyChips(){
  const container=document.querySelector('.chips');
  if(!container) return;
  const families=[...new Set(chars.map(c=>c.family).filter(Boolean))];
  families.forEach(fam=>{
    if(container.querySelector(`[data-filter="fam_${fam}"]`)) return;
    const btn=document.createElement('button');
    btn.className='chip'; btn.dataset.filter=`fam_${fam}`; btn.textContent=fam;
    container.appendChild(btn);
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
      btn.classList.add('selected'); renderLibrary(`fam_${fam}`);
    });
  });
}

function renderLibrary(filter='all'){
  const container=document.getElementById('cards'); if(!container) return;
  let list=chars;
  if(filter==='lead') list=chars.filter(c=>(c.char_type||'main')==='main');
  else if(filter?.startsWith('fam_')) list=chars.filter(c=>c.family===filter.slice(4));

  if(!list.length){
    container.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-icon">♙</div><p>Персонажей нет.<br>Импортируй данные или добавь первого персонажа.</p></div>`;
    return;
  }

  container.innerHTML=list.map(c=>{
    const cImgs=getImages(c.id);
    const av=cImgs.find(i=>i.id===c.avatar_image_id)||cImgs[0];
    const cbs=getCharBooks(c.id);
    const isSecondary=(c.char_type||'main')==='secondary';
    const pos={'top':'50% 15%','center':'50% 50%','bottom':'50% 85%'}[c.avatar_position||'top']||'50% 15%';

    const rolesHtml=cbs.slice(0,3).map(cb=>{
      const col=ROLE_COLORS[cb.role]||'#8a7a6e';
      return `<div class="card-role-row">
        <div class="card-role-dot" style="background:${col}"></div>
        <span class="card-role-book">${cb.book_title||''}</span>
        <span class="card-role-label" style="color:${col}">${cb.role||''}</span>
      </div>`;
    }).join('');

    const imgHtml=av
      ?`<img class="card-img" src="${av.url}" alt="${c.name}" style="object-position:${pos}">`
      :`<div class="card-placeholder" style="background:${colorFor(c)}15">${c.emoji||'👤'}</div>`;

    return `<div class="card" onclick="openChar('${c.id}')">
      ${isSecondary?'<div class="secondary-badge">Второстепенный</div>':''}
      ${imgHtml}
      <div class="card-body">
        <div class="card-name">${c.name}</div>
        ${c.family?`<div class="card-family">${c.family}</div>`:''}
        <div class="card-roles">${rolesHtml||`<div style="font-size:11px;color:var(--text3)">${c.role||'—'}</div>`}</div>
      </div>
      <div class="card-footer">
        <span>🔗 ${getRels(c.id).length}</span>
        <span>🖼 ${cImgs.length}</span>
        <span>📚 ${cbs.length}</span>
      </div>
    </div>`;
  }).join('');
}

// ── OPEN CHAR ──
function openChar(id){
  currentChar=getChar(id); if(!currentChar) return;
  switchTab('character');
  renderCharTab();
}

function renderCharTab(){
  const c=currentChar; if(!c) return;
  const portEl=document.getElementById('heroPortrait');
  if(portEl){
    const imgs=getImages(c.id);
    const av=imgs.find(i=>i.id===c.avatar_image_id)||imgs[0];
    if(av){portEl.innerHTML=`<img src="${av.url}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover">`;portEl.style.background='';}
    else{portEl.style.background=`linear-gradient(135deg,${colorFor(c)},${colorFor(c)}88)`;portEl.style.color='white';portEl.textContent=c.emoji||initials(c.name);}
  }
  const el=id=>document.getElementById(id);
  if(el('heroName')) el('heroName').textContent=c.name+(c.nickname?` «${c.nickname}»`:'');
  if(el('heroBio')) el('heroBio').textContent=c.bio||'—';
  if(el('heroMeta')){
    const parts=[c.birth_date?`р. ${c.birth_date}`:'',c.family||'',`${getImages(c.id).length} изображений`].filter(Boolean);
    el('heroMeta').textContent=parts.join(' · ');
  }
  const rolesEl=el('heroRoles');
  if(rolesEl){
    const cbs=getCharBooks(c.id);
    rolesEl.innerHTML=cbs.map(cb=>{const col=ROLE_COLORS[cb.role]||'#8a7a6e';return`<span class="role-badge" style="color:${col};border-color:${col}40;background:${col}10">${cb.book_title}: ${cb.role}</span>`;}).join('')
      ||`<span class="role-badge" style="color:var(--gold);border-color:var(--gold)40;background:rgba(139,58,26,0.08)">${c.role||'Персонаж'}</span>`;
  }

  // Edit button
  const editBtn=document.getElementById('heroEditBtn');
  if(editBtn) editBtn.onclick=()=>showCharModal(c.id);

  // Album button
  const albumBtn=document.getElementById('albumBtn');
  if(albumBtn) albumBtn.onclick=()=>{albumCharId=c.id;switchTab('album');};

  // Char tabs
  showCharSection('relations');
  renderCharRelations(c.id);
  renderCharBooks(c.id);
  renderCharInfo(c);
}

function showCharSection(name){
  ['relations','books','info'].forEach(s=>{
    const el=document.getElementById(`cSec_${s}`); if(el) el.style.display=s===name?'block':'none';
  });
  document.querySelectorAll('.char-tab').forEach(t=>t.classList.toggle('active',t.dataset.sec===name));
}

function renderCharInfo(c){
  const el=document.getElementById('cSec_info'); if(!el) return;
  const row=(k,v)=>v?`<span class="info-k">${k}</span><span class="info-v">${v}</span>`:'';
  const long=(k,v)=>v?`<div class="info-long"><span class="info-k">${k}</span><span class="info-v">${v}</span></div>`:'';
  el.innerHTML=`
    <div class="info-grid" style="margin-bottom:14px">
      ${row('Пол',c.gender)}${row('Дата рождения',c.birth_date)}${row('Дата смерти',c.death_date)}
      ${row('Семья',c.family)}${row('Поколение',c.generation)}${row('Тип',c.char_type==='secondary'?'Второстепенный':'Главный')}
    </div>
    ${long('Внешность',c.appearance)}
    ${long('Характер',c.personality)}
    ${long('Мотивация',c.motivation)}
    ${long('Тайна',c.secret)}
    ${long('Заметки',c.notes)}
    ${(c.tags||[]).length?`<div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">${c.tags.map(t=>`<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:var(--surface2);border:1px solid var(--border)">${t}</span>`).join('')}</div>`:''}
  `;
}

function renderCharRelations(charId){
  const el=document.getElementById('relationsList'); if(!el) return;
  const rels=getRels(charId);
  if(!rels.length){el.innerHTML='<div class="empty"><div class="empty-icon">🔗</div><p>Связей пока нет</p></div>';return;}
  el.innerHTML=rels.map(r=>{
    const isFrom=r.character_id===charId;
    const otherId=isFrom?r.target_id:r.character_id;
    const other=getChar(otherId); if(!other) return '';
    const intColor=INTENSITY_COLORS[r.intensity||'нейтральные']||'#8a7a6e';
    const fromPov=isFrom?r.from_pov:r.to_pov;
    const toPov=isFrom?r.to_pov:r.from_pov;
    const imgs=getImages(other.id); const av=imgs.find(i=>i.id===other.avatar_image_id)||imgs[0];
    const avHtml=av?`<img src="${av.url}" alt="${other.name}">`:(other.emoji||initials(other.name));
    return`<div class="rel-card">
      <div class="rel-card-header">
        <div class="rel-mini-avatar">${avHtml}</div>
        <div style="flex:1">
          <div class="rel-name">${other.name}</div>
          <div class="rel-type">${r.type||''}<span class="rel-intensity" style="color:${intColor};background:${intColor}15">${r.intensity||''}</span></div>
        </div>
        <button class="ghost" onclick="editRel('${r.id}')">✎</button>
      </div>
      ${fromPov||toPov?`<div class="rel-povs">
        ${fromPov?`<div class="rel-pov"><div class="rel-pov-label">Её взгляд</div><div class="rel-pov-text">${fromPov}</div></div>`:''}
        ${toPov?`<div class="rel-pov"><div class="rel-pov-label">Его взгляд</div><div class="rel-pov-text">${toPov}</div></div>`:''}
      </div>`:''}
      ${r.description?`<div style="font-size:12px;color:var(--text2);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">${r.description}</div>`:''}
    </div>`;
  }).join('');
}

function renderCharBooks(charId){
  const el=document.getElementById('bookList'); if(!el) return;
  const cbs=getCharBooks(charId);
  if(!cbs.length){el.innerHTML='<div class="empty"><div class="empty-icon">📚</div><p>Не привязан ни к одной книге</p></div>';return;}
  el.innerHTML=cbs.map(cb=>{
    const col=ROLE_COLORS[cb.role]||'#8a7a6e';
    return`<div class="book-item">
      <div class="book-num">${cb.book_order||'?'}</div>
      <div class="book-info">
        <div class="book-title">${cb.book_title||'—'}</div>
        <div class="book-role" style="color:${col}">${cb.role||''}${cb.age_at_events?` · ${cb.age_at_events}`:''}</div>
        ${cb.arc?`<div style="font-size:11px;color:var(--text3);margin-top:4px">${cb.arc}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── ALBUM ──
function renderAlbum(charId){
  albumCharId=charId;
  const grid=document.getElementById('albumGrid'); if(!grid) return;
  const introH2=document.querySelector('#album .intro h2');
  if(introH2) introH2.textContent=charId?(getChar(charId)?.name||'Альбом'):'Общий альбом';

  // Selector
  let sel=document.querySelector('.char-selector');
  if(!sel){sel=document.createElement('div');sel.className='char-selector';const ageLine=document.querySelector('.age-line');if(ageLine)ageLine.before(sel);}
  sel.innerHTML=`<button class="char-selector-btn ${!charId?'active':''}" onclick="renderAlbum(null)">Все</button>`
    +chars.map(c=>`<button class="char-selector-btn ${charId===c.id?'active':''}" onclick="renderAlbum('${c.id}')">${c.emoji||''} ${c.name.split(' ')[0]}</button>`).join('');

  const imgs=charId?getImages(charId):images;
  if(!imgs.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🖼</div><p>Изображений пока нет</p></div>';return;}
  grid.innerHTML=imgs.map(img=>{
    const c=getChar(img.character_id);
    return`<div class="album-item" onclick="openLightbox('${img.url}')">
      <img class="album-img" src="${img.url}" alt="${img.emotion||''}" onerror="this.style.display='none'">
      <div class="album-meta">
        ${img.period?`<div class="album-period">${img.period}</div>`:''}
        ${img.emotion?`<div class="album-emotion">${img.emotion}</div>`:''}
        ${img.comment?`<div class="album-comment">${img.comment}</div>`:''}
        ${c&&!charId?`<div class="album-char">${c.name}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── RELATIONS TAB ──
function renderRelationsTab(){
  const el=document.getElementById('relationsFullList'); if(!el) return;
  const pairs=new Map();
  relationships.forEach(r=>{const key=[r.character_id,r.target_id].sort().join('-');if(!pairs.has(key))pairs.set(key,r);});
  if(!pairs.size){el.innerHTML='<div class="empty"><div class="empty-icon">⌘</div><p>Связей пока нет</p></div>';return;}
  el.innerHTML=[...pairs.values()].map(r=>{
    const a=getChar(r.character_id),b=getChar(r.target_id); if(!a||!b) return '';
    const intColor=INTENSITY_COLORS[r.intensity||'нейтральные']||'#8a7a6e';
    return`<div class="rel-full-card">
      <div class="rel-full-header">
        <div class="rel-mini-avatar">${a.emoji||initials(a.name)}</div>
        <div class="rel-pair">${a.name} <span style="color:var(--text3);font-weight:400">↔</span> ${b.name}</div>
        <div class="rel-mini-avatar">${b.emoji||initials(b.name)}</div>
        <span class="rel-intensity" style="color:${intColor};background:${intColor}15;margin-left:auto">${r.type||''} · ${r.intensity||''}</span>
      </div>
      ${r.from_pov||r.to_pov?`<div class="rel-povs">
        ${r.from_pov?`<div class="rel-pov"><div class="rel-pov-label">${a.name}</div><div class="rel-pov-text">${r.from_pov}</div></div>`:''}
        ${r.to_pov?`<div class="rel-pov"><div class="rel-pov-label">${b.name}</div><div class="rel-pov-text">${r.to_pov}</div></div>`:''}
      </div>`:''}
      ${r.description?`<div style="font-size:12px;color:var(--text2);margin-top:8px">${r.description}</div>`:''}
    </div>`;
  }).join('');
}

// ── RELATION DIALOG ──
function openRelDialog(){
  if(!currentChar){toast('Сначала открой персонажа');return;}
  editingRelId=null;
  document.getElementById('relDialogTitle').textContent='Новая связь';
  document.getElementById('fromName').textContent=currentChar.name;
  const sel=document.getElementById('toCharacter');
  sel.innerHTML=chars.filter(c=>c.id!==currentChar.id).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('fromView').value='';
  document.getElementById('toView').value='';
  document.getElementById('relationType').value='Союз';
  document.getElementById('relIntensity').value='нейтральные';
  document.getElementById('relationDialog').showModal();
}

function editRel(id){
  const r=relationships.find(rel=>rel.id===id); if(!r||!currentChar) return;
  editingRelId=id;
  document.getElementById('relDialogTitle').textContent='Редактировать связь';
  document.getElementById('fromName').textContent=currentChar.name;
  const sel=document.getElementById('toCharacter');
  sel.innerHTML=chars.filter(c=>c.id!==currentChar.id).map(c=>`<option value="${c.id}" ${c.id===(r.character_id===currentChar.id?r.target_id:r.character_id)?'selected':''}>${c.name}</option>`).join('');
  document.getElementById('fromView').value=r.character_id===currentChar.id?r.from_pov||'':r.to_pov||'';
  document.getElementById('toView').value=r.character_id===currentChar.id?r.to_pov||'':r.from_pov||'';
  document.getElementById('relationType').value=r.type||'Союз';
  document.getElementById('relIntensity').value=r.intensity||'нейтральные';
  document.getElementById('relationDialog').showModal();
}

async function saveRelation(){
  const toId=document.getElementById('toCharacter').value;
  const fromId=currentChar?.id;
  if(!fromId||!toId){toast('Выбери персонажа');return;}
  const data={character_id:fromId,target_id:toId,
    type:document.getElementById('relationType').value,
    intensity:document.getElementById('relIntensity').value,
    from_pov:document.getElementById('fromView').value,
    to_pov:document.getElementById('toView').value};
  const {error}=editingRelId
    ?await db.from('relationships').update(data).eq('id',editingRelId)
    :await db.from('relationships').insert(data);
  if(error){toast('Ошибка: '+error.message);return;}
  document.getElementById('relationDialog').close();
  await loadAll();
  renderCharRelations(fromId);
  renderRelationsTab();
  updateStats();
  toast('Связь сохранена');
}

// ── ADD/EDIT CHAR MODAL ──
function showCharModal(charId=null){
  editingCharId=charId;
  const c=charId?getChar(charId):null;
  document.getElementById('charModalTitle').textContent=charId?'Редактировать персонажа':'Новый персонаж';
  const fields=['name','nickname','role','char_type','family','generation','gender','birth_date','death_date','bio','appearance','personality','motivation','secret','notes','emoji'];
  fields.forEach(f=>{const el=document.getElementById(`cf_${f}`);if(el)el.value=c?c[f]||'':'';});
  if(document.getElementById('cf_char_type')) document.getElementById('cf_char_type').value=c?.char_type||'main';
  document.getElementById('charModal').classList.add('open');
}

function closeCharModal(){
  document.getElementById('charModal').classList.remove('open');
}

async function saveChar(){
  const name=document.getElementById('cf_name').value.trim();
  if(!name){toast('Введи имя');return;}
  const btn=document.getElementById('saveCharBtn');
  btn.disabled=true;
  const fields=['name','nickname','role','char_type','family','generation','gender','birth_date','death_date','bio','appearance','personality','motivation','secret','notes','emoji'];
  const data={};
  fields.forEach(f=>{const el=document.getElementById(`cf_${f}`);if(el)data[f]=el.value||null;});
  data.name=name;
  const {data:saved,error}=editingCharId
    ?await db.from('characters').update(data).eq('id',editingCharId).select().single()
    :await db.from('characters').insert(data).select().single();
  if(error){toast('Ошибка: '+error.message);btn.disabled=false;return;}
  if(editingCharId){const idx=chars.findIndex(c=>c.id===editingCharId);if(idx>=0)chars[idx]={...chars[idx],...data};}
  else chars.push(saved);
  closeCharModal();
  renderLibrary();
  updateStats();
  buildFamilyChips();
  if(editingCharId&&currentChar?.id===editingCharId){currentChar=getChar(editingCharId);renderCharTab();}
  toast(editingCharId?'Персонаж обновлён':'Персонаж добавлен');
  btn.disabled=false;
}

// ── LIGHTBOX ──
function openLightbox(url){
  const lb=document.getElementById('lightbox');
  document.getElementById('lbImg').src=url;
  lb.classList.add('open');
}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}

// ── TOAST ──
let toastTimer;
function toast(msg){let el=document.querySelector('.toast');if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);}el.textContent=msg;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',2500);}

// ── PDF ──
function exportCharPdf(){
  const c=currentChar; if(!c){toast('Открой персонажа');return;}
  const cbs=getCharBooks(c.id);
  const rels=getRels(c.id);
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${c.name}</title>
  <style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#1a1410;line-height:1.6}h1{font-size:28px}h2{font-size:15px;color:#8b3a1a;margin:20px 0 8px;border-bottom:1px solid #e8dfd2;padding-bottom:4px}p{margin-bottom:8px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 8px;border-bottom:1px solid #e8dfd2}td:first-child{color:#8a7a6e;width:150px}</style></head><body>
  <h1>${c.name}${c.nickname?` «${c.nickname}»`:''}</h1><p style="color:#8a7a6e">${[c.family,c.gender,c.birth_date?'р.'+c.birth_date:''].filter(Boolean).join(' · ')}</p>
  ${c.bio?`<h2>Биография</h2><p>${c.bio}</p>`:''}${c.appearance?`<h2>Внешность</h2><p>${c.appearance}</p>`:''}${c.personality?`<h2>Характер</h2><p>${c.personality}</p>`:''}${c.motivation?`<h2>Мотивация</h2><p>${c.motivation}</p>`:''}
  ${cbs.length?`<h2>В книгах</h2><table>${cbs.map(b=>`<tr><td>${b.book_title}</td><td>${b.role||''}</td><td>${b.arc||''}</td></tr>`).join('')}</table>`:''}
  ${rels.length?`<h2>Связи</h2><table>${rels.map(r=>{const o=getChar(r.character_id===c.id?r.target_id:r.character_id);return o?`<tr><td>${o.name}</td><td>${r.type||''}</td><td>${r.description||r.from_pov||''}</td></tr>`:''}).join('')}</table>`:''}
  </body></html>`);
  win.document.close();
  win.onload=()=>setTimeout(()=>win.print(),500);
}

// ── EVENTS ──
document.addEventListener('DOMContentLoaded',()=>{
  // Rel dialog
  document.getElementById('saveRelation')?.addEventListener('click',saveRelation);
  document.querySelectorAll('[data-open="relation"]').forEach(btn=>btn.addEventListener('click',openRelDialog));

  // Char tabs
  document.querySelectorAll('.char-tab').forEach(t=>{
    t.addEventListener('click',()=>{showCharSection(t.dataset.sec);if(t.dataset.sec==='relations')renderCharRelations(currentChar?.id);});
  });

  // Char modal close
  document.getElementById('charModalClose')?.addEventListener('click',closeCharModal);
  document.getElementById('charModal')?.addEventListener('click',e=>{if(e.target.id==='charModal')closeCharModal();});

  // Edit/Save char
  document.getElementById('saveCharBtn')?.addEventListener('click',saveChar);
  document.getElementById('heroEditBtn')?.addEventListener('click',()=>showCharModal(currentChar?.id));

  // Add char button
  document.getElementById('addCharBtn')?.addEventListener('click',()=>showCharModal(null));

  // PDF
  document.getElementById('pdfExport')?.addEventListener('click',exportCharPdf);
  document.getElementById('albumPdf')?.addEventListener('click',()=>toast('PDF альбома в разработке'));

  // Lightbox
  document.getElementById('lightbox')?.addEventListener('click',closeLightbox);

  // Form tabs in char modal
  document.querySelectorAll('.form-tab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('.form-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.form-section').forEach(s=>s.style.display='none');
      const sec=document.getElementById(`fs_${t.dataset.fs}`);
      if(sec) sec.style.display='block';
    });
  });
});

init();
