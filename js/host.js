/* Kaboom (GitHub Pages 版) — 主持人大螢幕：在瀏覽器內開房 + 跑遊戲引擎 */
(() => {
  const $ = (id) => document.getElementById(id);
  const SHAPES = ['▲', '◆', '●', '■'];
  const COLORS = ['var(--opt-red)', 'var(--opt-blue)', 'var(--opt-yellow)', 'var(--opt-green)'];
  const PEER_PREFIX = 'kaboom-quiz-';

  const screens = ['boot', 'lobby', 'question', 'reveal', 'podium', 'error'];
  function show(name) {
    for (const s of screens) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }

  function fail(msg) {
    $('error-text').textContent = msg;
    show('error');
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  const params = new URLSearchParams(location.search);
  const quiz = window.QuizStore.get(params.get('quiz'));
  if (!quiz) { fail('找不到題庫，請從題庫管理頁啟動遊戲'); return; }
  if (!quiz.questions.length) { fail('這個題庫還沒有題目'); return; }

  let timerInterval = null;
  let currentQ = null;
  let peer = null;
  let attempts = 0;

  const engine = new window.GameEngine(quiz, {
    onLobby: renderPlayers,
    onQuestion: renderQuestion,
    onProgress: (answered, players) => { $('q-answered').textContent = `${answered} / ${players} 人已作答`; },
    onReveal: renderReveal,
    onPodium: renderPodium,
  });

  // --- open the room: PIN is embedded in the peer id --------------------------
  function openRoom() {
    attempts += 1;
    if (attempts > 5) return fail('無法建立房間，請重新整理再試');
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    peer = new Peer(PEER_PREFIX + pin, window.KaboomPeerConfig());

    peer.on('open', () => {
      $('big-pin').textContent = pin;
      $('join-url').textContent = location.host + location.pathname.replace(/host\.html.*$/, '');
      $('lobby-title').textContent = quiz.title;
      show('lobby');
    });
    peer.on('connection', (conn) => engine.handleConnection(conn));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { peer.destroy(); openRoom(); } // PIN 撞號，換一個
      else if (e.type === 'peer-unavailable') { /* 玩家斷線殘留，忽略 */ }
      else fail('連線服務發生錯誤：' + e.type);
    });
    peer.on('disconnected', () => {
      toast('與訊號伺服器斷線，重新連線中…');
      try { peer.reconnect(); } catch { /* already destroyed */ }
    });
  }
  openRoom();

  // --- UI rendering ------------------------------------------------------------
  function renderPlayers(names) {
    $('player-count').textContent = names.length;
    $('btn-start').disabled = names.length === 0;
    const chips = $('player-chips');
    chips.innerHTML = '';
    for (const n of names) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = n;
      chips.appendChild(c);
    }
  }

  function renderQuestion(q) {
    currentQ = q;
    $('q-progress').textContent = `第 ${q.index + 1} / ${q.total} 題`;
    $('q-answered').textContent = '0 人已作答';
    $('q-text').textContent = q.text;
    const qimg = $('q-image');
    qimg.classList.toggle('hidden', !q.image);
    qimg.src = q.image || '';

    const grid = $('q-answers');
    grid.innerHTML = '';
    q.options.forEach((opt, i) => {
      const div = document.createElement('div');
      div.className = 'answer static';
      div.dataset.i = i;
      div.innerHTML = `<span class="shape">${SHAPES[i]}</span><span class="atext"></span>`;
      div.querySelector('.atext').textContent = opt.text || '';
      if (opt.image) {
        const img = document.createElement('img');
        img.className = 'aimg' + (opt.text ? '' : ' only');
        img.alt = opt.text || `選項 ${i + 1}`;
        img.src = opt.image;
        div.appendChild(img);
      }
      grid.appendChild(div);
    });

    clearInterval(timerInterval);
    const durationMs = q.timeLimit * 1000;
    const endsAt = Date.now() + durationMs;
    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      $('q-timer').textContent = Math.ceil(left / 1000);
      $('q-timebar').style.width = `${(left / durationMs) * 100}%`;
      if (left <= 0) clearInterval(timerInterval);
    };
    tick();
    timerInterval = setInterval(tick, 200);
    show('question');
  }

  function renderReveal(data) {
    clearInterval(timerInterval);
    $('r-text').textContent = currentQ ? currentQ.text : '';

    const dist = $('r-dist');
    dist.innerHTML = '';
    data.counts.forEach((n, i) => {
      const item = document.createElement('div');
      item.className = 'item' + (i === data.correctIndex ? ' correct' : '');
      item.style.background = COLORS[i];
      item.innerHTML = `<span></span><span class="n">${n} 人${i === data.correctIndex ? ' ✓' : ''}</span>`;
      const opt = currentQ ? currentQ.options[i] : null;
      const label = opt ? (opt.text || '（圖片選項）') : '';
      item.firstElementChild.textContent = `${SHAPES[i]} ${label}`;
      dist.appendChild(item);
    });

    const board = $('r-board');
    board.innerHTML = '';
    for (const e of data.leaderboard) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="rank">${e.rank}</span><span class="name"></span><span>${e.score} 分</span>`;
      row.querySelector('.name').textContent = e.name;
      board.appendChild(row);
    }

    $('btn-next').textContent = data.isLast ? '查看最終結果 🏆' : '下一題 ▶';
    show('reveal');
  }

  function renderPodium(data) {
    const podium = $('podium');
    podium.innerHTML = '';
    const order = [1, 0, 2];
    const cls = ['p1', 'p2', 'p3'];
    const medals = ['🥇', '🥈', '🥉'];
    for (const idx of order) {
      const e = data.podium[idx];
      if (!e) continue;
      const col = document.createElement('div');
      col.className = `col ${cls[idx]}`;
      col.innerHTML = `<div class="name"></div><div class="score">${e.score} 分</div><div class="block">${medals[idx]}</div>`;
      col.querySelector('.name').textContent = e.name;
      podium.appendChild(col);
    }

    const board = $('final-board');
    board.innerHTML = '';
    for (const e of data.leaderboard.slice(0, 10)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span class="rank">${e.rank}</span><span class="name"></span><span>答對 ${e.correctCount} 題</span><span>${e.score} 分</span>`;
      row.querySelector('.name').textContent = e.name;
      board.appendChild(row);
    }
    show('podium');
  }

  // --- controls ------------------------------------------------------------------
  $('btn-start').addEventListener('click', () => {
    const r = engine.start();
    if (r.error) toast(r.error);
  });
  $('btn-skip').addEventListener('click', () => engine.next());
  $('btn-next').addEventListener('click', () => {
    const r = engine.next();
    if (r.error) toast(r.error);
  });
  $('btn-cancel').addEventListener('click', closeGame);
  $('btn-close').addEventListener('click', closeGame);
  function closeGame() {
    engine.end();
    if (peer) peer.destroy();
    location.href = 'admin.html';
  }

  window.addEventListener('beforeunload', (e) => {
    if (engine.state !== 'lobby' && engine.state !== 'ended' && engine.state !== 'podium') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
