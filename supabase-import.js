// =============================================
// Character Bible NEXT — Import / Migration
// =============================================

function setupImport() {
  const fileInput = document.getElementById('importFile');
  const resultEl = document.getElementById('importResult');
  const templateBtn = document.getElementById('downloadTemplate');

  if (templateBtn) {
    templateBtn.addEventListener('click', downloadTemplate);
  }

  if (!fileInput) return;

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    resultEl.textContent = `Читаю файл: ${file.name}…`;

    try {
      const text = await file.text();

      if (file.name.endsWith('.json')) {
        await importJSON(text, resultEl);
      } else if (file.name.endsWith('.csv')) {
        await importCSV(text, resultEl);
      } else {
        resultEl.textContent = 'Поддерживаются форматы: .json, .csv';
      }
    } catch (err) {
      resultEl.textContent = 'Ошибка чтения файла: ' + err.message;
    }
  });
}

// ── JSON IMPORT ──
async function importJSON(text, resultEl) {
  let data;
  try { data = JSON.parse(text); } catch(e) { resultEl.textContent = 'Невалидный JSON: ' + e.message; return; }

  const preview = [];

  // Characters
  const charsToImport = data.characters || [];
  preview.push(`📋 Найдено персонажей: ${charsToImport.length}`);

  // Books
  const booksToImport = data.books || [];
  preview.push(`📚 Найдено книг: ${booksToImport.length}`);

  // Relations
  const relsToImport = [];
  if (data.characters) {
    data.characters.forEach(c => {
      (c.relationships || []).forEach(r => {
        relsToImport.push({ ...r, _from_name: c.name });
      });
    });
  }
  preview.push(`🔗 Найдено связей: ${relsToImport.length}`);

  resultEl.textContent = preview.join('\n') + '\n\nНажми кнопку ниже для импорта в Supabase.';

  // Add confirm button
  const existing = document.getElementById('confirmImportBtn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'confirmImportBtn';
  btn.className = 'primary';
  btn.style.marginTop = '12px';
  btn.textContent = '✓ Импортировать в базу данных';
  resultEl.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Импортирую…';
    resultEl.textContent = 'Начинаю импорт…\n';

    let charMap = {}; // old name → new id

    // Import characters
    if (charsToImport.length) {
      resultEl.textContent += `Импортирую ${charsToImport.length} персонажей…\n`;
      for (const c of charsToImport) {
        const charData = {
          name: c.name || 'Без имени',
          nickname: c.nickname || null,
          role: c.role || 'Главный герой',
          char_type: c.char_type || 'main',
          family: c.family || null,
          generation: c.generation || null,
          gender: c.gender || null,
          birth_date: c.birth_date || c.age || null,
          death_date: c.death_date || null,
          bio: c.bio || null,
          appearance: c.appearance || null,
          personality: c.personality || null,
          motivation: c.motivation || null,
          secret: c.secret || null,
          notes: c.notes || null,
          tags: c.tags || [],
          emoji: c.emoji || null,
          color: c.color || null,
        };
        const { data: newChar, error } = await db.from('characters').insert(charData).select().single();
        if (error) { resultEl.textContent += `  ✗ ${c.name}: ${error.message}\n`; continue; }
        charMap[c.name] = newChar.id;
        resultEl.textContent += `  ✓ ${c.name}\n`;

        // Import character images
        if (c.images && c.images.length) {
          for (const img of c.images) {
            if (!img.url) continue;
            await db.from('character_images').insert({
              character_id: newChar.id,
              url: img.url,
              emotion: img.emotion || null,
              period: img.period || null,
              comment: img.comment || null,
            });
          }
        }

        // Import character books
        if (c.books_timeline && c.books_timeline.length) {
          for (const cb of c.books_timeline) {
            await db.from('character_books').insert({
              character_id: newChar.id,
              book_title: cb.book_title || cb.book || null,
              book_order: cb.book_order || 1,
              role: cb.role || null,
              age_at_events: cb.age_at_events || null,
              appearance_changes: cb.appearance_changes || null,
              personality_changes: cb.personality_changes || null,
              arc: cb.arc || null,
              key_events: cb.key_events || null,
              notes: cb.notes || null,
            });
          }
        }
      }
    }

    // Import relationships
    if (relsToImport.length) {
      resultEl.textContent += `\nИмпортирую связи…\n`;
      for (const r of relsToImport) {
        const fromId = charMap[r._from_name];
        const toId = charMap[r.target_name] || Object.values(charMap)[0];
        if (!fromId || !toId) continue;
        const { error } = await db.from('relationships').insert({
          character_id: fromId,
          target_id: toId,
          type: r.type || null,
          intensity: r.intensity || 'нейтральные',
          description: r.description || null,
          from_pov: r.from_pov || null,
          to_pov: r.to_pov || null,
          how_they_met: r.how_they_met || null,
          dynamic: r.dynamic || null,
          conflicts: r.conflicts || null,
          secrets: r.secrets || null,
          history: r.history || null,
          current_status: r.current_status || null,
        });
        if (!error) resultEl.textContent += `  ✓ ${r._from_name} ↔ ${r.target_name}\n`;
      }
    }

    // Reload
    await loadAll();
    renderLibrary();
    renderAlbum();
    renderRelationsTab();
    updateStats();
    resultEl.textContent += '\n✅ Импорт завершён! Перейди на вкладку «Обзор».';
    btn.remove();
    toast('Импорт завершён!');
  });
}

// ── CSV IMPORT ──
async function importCSV(text, resultEl) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) { resultEl.textContent = 'Файл пустой или неверный формат'; return; }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(l => {
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });

  resultEl.textContent = `CSV прочитан. Найдено ${rows.length} строк.\nКолонки: ${headers.join(', ')}\n\nНажми кнопку для импорта.`;

  const existing = document.getElementById('confirmImportBtn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'confirmImportBtn';
  btn.className = 'primary';
  btn.style.marginTop = '12px';
  btn.textContent = '✓ Импортировать';
  resultEl.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    resultEl.textContent = 'Импортирую…\n';

    const nameCol = headers.find(h => h.includes('имя') || h === 'name') || headers[0];

    for (const row of rows) {
      const name = row[nameCol] || row['name'] || row['имя'];
      if (!name) continue;
      const { error } = await db.from('characters').insert({
        name,
        nickname: row['прозвище'] || row['nickname'] || null,
        role: row['роль'] || row['role'] || 'Главный герой',
        char_type: (row['тип'] || row['type'] || '').includes('втор') ? 'secondary' : 'main',
        family: row['семья'] || row['family'] || null,
        gender: row['пол'] || row['gender'] || null,
        birth_date: row['дата рождения'] || row['birth_date'] || null,
        bio: row['биография'] || row['bio'] || null,
        appearance: row['внешность'] || row['appearance'] || null,
        notes: row['заметки'] || row['notes'] || null,
      });
      resultEl.textContent += error ? `  ✗ ${name}\n` : `  ✓ ${name}\n`;
    }

    await loadAll();
    renderLibrary();
    updateStats();
    resultEl.textContent += '\n✅ Готово!';
    btn.remove();
    toast('CSV импортирован!');
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── CSV TEMPLATE ──
function downloadTemplate() {
  const headers = ['Имя','Прозвище','Роль','Тип (main/secondary)','Семья','Пол','Дата рождения','Биография','Внешность','Характер','Мотивация','Тайна','Заметки'];
  const example = ['Ника Риверс','Ника','Главный герой','main','Риверс','женский','Июнь 64 года','Молодая женщина...','Темноволосая...','Уравновешенная...','Найти своё место','',''];
  const csv = '\uFEFF' + headers.join(',') + '\n' + example.join(',');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'character-bible-template.csv';
  a.click(); URL.revokeObjectURL(url);
}
