/* Kaboom (GitHub Pages 版) — 題庫管理（localStorage，本機儲存，無需登入） */
(() => {
  const $ = (id) => document.getElementById(id);
  const store = window.QuizStore;
  const OPT_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const OPT_LABELS = ['選項 A（紅）', '選項 B（藍）', '選項 C（黃）', '選項 D（綠）'];

  const screens = ['dash', 'editor'];

  // --- image helpers -----------------------------------------------------------
  // 上傳的圖片以 canvas 縮圖 + JPEG 壓縮後內嵌（data URL），控制題庫體積與傳輸量
  function compressImage(file, maxDim) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff'; // 透明背景轉 JPEG 時補白底
        g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取圖片檔')); };
      img.src = url;
    });
  }

  function pickImage(maxDim) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        try {
          resolve(await compressImage(file, maxDim));
        } catch (err) {
          toast(err.message);
          resolve(null);
        }
      };
      input.click();
    });
  }
  function show(name) {
    for (const s of screens) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // --- quiz list --------------------------------------------------------------
  function loadQuizzes() {
    const quizzes = store.list();
    const list = $('quiz-list');
    list.innerHTML = '';
    $('quiz-empty').classList.toggle('hidden', quizzes.length > 0);
    for (const q of quizzes) {
      const row = document.createElement('div');
      row.className = 'quiz-item';
      row.innerHTML = `
        <span class="t"></span>
        <span class="meta">${q.questionCount} 題</span>
        <button class="btn small accent" data-act="play">🚀 開始遊戲</button>
        <button class="btn small" data-act="edit" style="background:#eee;color:var(--ink)">編輯</button>
        <button class="btn small danger" data-act="del">刪除</button>`;
      row.querySelector('.t').textContent = q.title;
      row.querySelector('[data-act=play]').addEventListener('click', () => {
        if (q.questionCount === 0) { toast('這個題庫還沒有題目'); return; }
        location.href = `host.html?quiz=${q.id}`;
      });
      row.querySelector('[data-act=edit]').addEventListener('click', () => openEditor(q.id));
      row.querySelector('[data-act=del]').addEventListener('click', () => {
        if (!confirm(`確定要刪除「${q.title}」嗎？`)) return;
        store.remove(q.id);
        toast('已刪除');
        loadQuizzes();
      });
      list.appendChild(row);
    }
  }

  // --- export / import ----------------------------------------------------------
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kaboom-quizzes.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const added = store.importAll(await file.text());
      toast(`已匯入 ${added} 個題庫`);
      loadQuizzes();
    } catch (err) {
      toast('匯入失敗：' + err.message);
    }
    e.target.value = '';
  });

  // --- editor -----------------------------------------------------------------
  let editingId = null;

  $('btn-new-quiz').addEventListener('click', () => {
    editingId = null;
    $('editor-title').textContent = '新增題庫';
    $('quiz-title').value = '';
    $('questions').innerHTML = '';
    addQuestion();
    $('editor-error').textContent = '';
    show('editor');
  });

  function openEditor(id) {
    const quiz = store.get(id);
    if (!quiz) return;
    editingId = id;
    $('editor-title').textContent = '編輯題庫';
    $('quiz-title').value = quiz.title;
    $('questions').innerHTML = '';
    for (const q of quiz.questions) addQuestion(q);
    $('editor-error').textContent = '';
    show('editor');
  }

  $('btn-back').addEventListener('click', () => { loadQuizzes(); show('dash'); });
  $('btn-add-q').addEventListener('click', () => addQuestion());

  function setQuestionImage(card, src, { fromUrlInput = false } = {}) {
    card._qimage = src || undefined;
    const preview = card.querySelector('.img-row .img-preview');
    preview.classList.toggle('hidden', !src);
    preview.querySelector('img').src = src || '';
    const urlInput = card.querySelector('.q-img-url');
    if (!fromUrlInput) urlInput.value = src && !src.startsWith('data:') ? src : '';
  }

  function setOptionImage(row, src) {
    row._image = src || undefined;
    const preview = row.querySelector('.img-preview');
    preview.classList.toggle('hidden', !src);
    preview.querySelector('img').src = src || '';
  }

  function addQuestion(data) {
    const tpl = $('tpl-question').content.cloneNode(true);
    const card = tpl.querySelector('.qcard');
    const optWrap = card.querySelector('.q-options');
    const radioName = `correct-${Math.random().toString(36).slice(2)}`;

    for (let i = 0; i < 4; i++) {
      const row = document.createElement('div');
      row.className = 'opt-row';
      row.innerHTML = `
        <span class="dot" style="background:${OPT_COLORS[i]}"></span>
        <input type="text" class="q-opt" maxlength="120" placeholder="${OPT_LABELS[i]}${i >= 2 ? '（選填）' : ''}">
        <button type="button" class="btn small ghost opt-img" style="color:var(--ink);border-color:#ccc" title="加入選項圖片">🖼</button>
        <span class="img-preview hidden"><img alt="選項圖片預覽"><button type="button" class="rm" title="移除圖片">✕</button></span>
        <input type="radio" name="${radioName}" value="${i}" title="設為正確答案">`;
      row.querySelector('.opt-img').addEventListener('click', async () => {
        const src = await pickImage(240);
        if (src) setOptionImage(row, src);
      });
      row.querySelector('.img-preview .rm').addEventListener('click', () => setOptionImage(row, null));
      optWrap.appendChild(row);
    }

    // 題目圖片：上傳（自動壓縮內嵌）或貼網址，二擇一
    card.querySelector('[data-act=qimg]').addEventListener('click', async () => {
      const src = await pickImage(640);
      if (src) setQuestionImage(card, src);
    });
    card.querySelector('.q-img-url').addEventListener('change', (e) => {
      setQuestionImage(card, e.target.value.trim() || null, { fromUrlInput: true });
    });
    card.querySelector('.img-row .img-preview .rm').addEventListener('click', () => setQuestionImage(card, null));

    if (data) {
      card.querySelector('.q-text').value = data.text;
      card.querySelector('.q-time').value = data.timeLimit;
      const optRows = card.querySelectorAll('.opt-row');
      data.options.forEach((o, i) => {
        if (!optRows[i]) return;
        const opt = typeof o === 'string' ? { text: o } : o;
        optRows[i].querySelector('.q-opt').value = opt.text || '';
        if (opt.image) setOptionImage(optRows[i], opt.image);
      });
      const radio = card.querySelector(`input[value="${data.correctIndex}"]`);
      if (radio) radio.checked = true;
    } else {
      card.querySelector('input[value="0"]').checked = true;
    }
    if (data && data.image) setQuestionImage(card, data.image);

    card.querySelector('[data-act=del]').addEventListener('click', () => { card.remove(); renumber(); });
    card.querySelector('[data-act=up]').addEventListener('click', () => {
      const prev = card.previousElementSibling;
      if (prev) { card.parentNode.insertBefore(card, prev); renumber(); }
    });
    card.querySelector('[data-act=down]').addEventListener('click', () => {
      const next = card.nextElementSibling;
      if (next) { card.parentNode.insertBefore(next, card); renumber(); }
    });

    $('questions').appendChild(card);
    renumber();
  }

  function renumber() {
    document.querySelectorAll('#questions .qcard').forEach((card, i) => {
      card.querySelector('.idx').textContent = `第 ${i + 1} 題`;
    });
  }

  function collect() {
    const questions = [];
    for (const card of document.querySelectorAll('#questions .qcard')) {
      const rows = [...card.querySelectorAll('.opt-row')];
      const checkedRadio = card.querySelector('input[type=radio]:checked');
      const rawCorrect = checkedRadio ? Number(checkedRadio.value) : -1;
      // 有文字或圖片的選項才算數；空位壓縮後重新對應正確答案索引
      const filled = [];
      let correctIndex = -1;
      rows.forEach((row, i) => {
        const text = row.querySelector('.q-opt').value.trim();
        const image = row._image;
        if (!text && !image) return;
        if (i === rawCorrect) correctIndex = filled.length;
        const opt = { text };
        if (image) opt.image = image;
        filled.push(opt);
      });
      const question = {
        text: card.querySelector('.q-text').value.trim(),
        options: filled,
        correctIndex,
        timeLimit: Number(card.querySelector('.q-time').value),
      };
      if (card._qimage) question.image = card._qimage;
      questions.push(question);
    }
    return { title: $('quiz-title').value.trim(), questions };
  }

  $('btn-save').addEventListener('click', () => {
    $('editor-error').textContent = '';
    const payload = collect();
    for (let i = 0; i < payload.questions.length; i++) {
      if (payload.questions[i].correctIndex === -1 && payload.questions[i].options.length >= 2) {
        $('editor-error').textContent = `第 ${i + 1} 題：正確答案必須是有內容（文字或圖片）的選項`;
        return;
      }
    }
    try {
      const saved = editingId ? store.update(editingId, payload) : store.create(payload);
      editingId = saved.id;
      $('editor-title').textContent = '編輯題庫';
      toast('已儲存 ✓');
    } catch (err) {
      $('editor-error').textContent = err.message;
    }
  });

  loadQuizzes();
})();
