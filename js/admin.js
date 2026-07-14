/* Kaboom (GitHub Pages 版) — 題庫管理（localStorage，本機儲存，無需登入） */
(() => {
  const $ = (id) => document.getElementById(id);
  const store = window.QuizStore;
  const OPT_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const OPT_LABELS = ['選項 A（紅）', '選項 B（藍）', '選項 C（黃）', '選項 D（綠）'];

  const screens = ['dash', 'editor'];
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
        <input type="radio" name="${radioName}" value="${i}" title="設為正確答案">`;
      optWrap.appendChild(row);
    }

    if (data) {
      card.querySelector('.q-text').value = data.text;
      card.querySelector('.q-time').value = data.timeLimit;
      const optInputs = card.querySelectorAll('.q-opt');
      data.options.forEach((o, i) => { if (optInputs[i]) optInputs[i].value = o; });
      const radio = card.querySelector(`input[value="${data.correctIndex}"]`);
      if (radio) radio.checked = true;
    } else {
      card.querySelector('input[value="0"]').checked = true;
    }

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
      const options = [...card.querySelectorAll('.q-opt')].map((el) => el.value.trim());
      const checkedRadio = card.querySelector('input[type=radio]:checked');
      const rawCorrect = checkedRadio ? Number(checkedRadio.value) : -1;
      const filled = [];
      let correctIndex = -1;
      options.forEach((o, i) => {
        if (!o) return;
        if (i === rawCorrect) correctIndex = filled.length;
        filled.push(o);
      });
      questions.push({
        text: card.querySelector('.q-text').value.trim(),
        options: filled,
        correctIndex,
        timeLimit: Number(card.querySelector('.q-time').value),
      });
    }
    return { title: $('quiz-title').value.trim(), questions };
  }

  $('btn-save').addEventListener('click', () => {
    $('editor-error').textContent = '';
    const payload = collect();
    for (let i = 0; i < payload.questions.length; i++) {
      if (payload.questions[i].correctIndex === -1 && payload.questions[i].options.length >= 2) {
        $('editor-error').textContent = `第 ${i + 1} 題：正確答案必須是有填寫內容的選項`;
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
