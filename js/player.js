/* Kaboom (GitHub Pages 版) — 玩家端：透過 PeerJS 連到主持人瀏覽器 */
(() => {
  const $ = (id) => document.getElementById(id);
  const SHAPES = ['▲', '◆', '●', '■'];
  const PEER_PREFIX = 'kaboom-quiz-';

  const screens = ['join', 'lobby', 'question', 'waiting', 'feedback', 'final'];
  function show(name) {
    for (const s of screens) $(`screen-${s}`).classList.toggle('hidden', s !== name);
  }

  let peer = null;
  let conn = null;
  let myName = '';
  let myScore = 0;
  let timerInterval = null;
  let joined = false;

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // --- join ---------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  if (params.get('pin')) $('pin').value = params.get('pin');

  $('btn-join').addEventListener('click', join);
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

  function join() {
    const pin = $('pin').value.trim();
    const name = $('name').value.trim();
    const err = $('join-error');
    err.textContent = '';
    if (!/^\d{6}$/.test(pin)) { err.textContent = '請輸入 6 位數 PIN'; return; }
    if (!name) { err.textContent = '請輸入暱稱'; return; }

    myName = name;
    $('btn-join').disabled = true;
    err.textContent = '';

    if (peer) peer.destroy();
    peer = new Peer(window.KaboomPeerConfig());

    const failJoin = (msg) => {
      $('btn-join').disabled = false;
      err.textContent = msg;
      if (peer) { peer.destroy(); peer = null; }
    };

    const timeout = setTimeout(() => { if (!joined) failJoin('連線逾時，請確認 PIN 是否正確、主持人畫面是否開啟'); }, 12000);

    peer.on('open', () => {
      conn = peer.connect(PEER_PREFIX + pin, { reliable: true });
      conn.on('open', () => conn.send({ t: 'join', name }));
      conn.on('data', (msg) => {
        if (msg && msg.t === 'join-ok') { clearTimeout(timeout); joined = true; }
        if (msg && msg.t === 'join-err') { clearTimeout(timeout); failJoin(msg.error); return; }
        handle(msg);
      });
      conn.on('close', () => { if (joined) toast('與主持人的連線中斷'); });
      conn.on('error', () => { if (!joined) failJoin('無法連上主持人'); });
    });
    peer.on('error', (e) => {
      clearTimeout(timeout);
      if (e.type === 'peer-unavailable') failJoin('找不到這個遊戲 PIN（主持人畫面要保持開啟）');
      else failJoin('連線失敗：' + e.type);
    });
  }

  // --- message dispatch ------------------------------------------------------
  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join-ok':
        $('lobby-title').textContent = msg.title || '';
        $('lobby-name').textContent = msg.name;
        show('lobby');
        if (msg.rejoined) toast('已重新連線，等待下一題');
        break;
      case 'question':
        renderQuestion(msg);
        break;
      case 'feedback':
        renderFeedback(msg);
        break;
      case 'podium':
        renderFinal(msg);
        break;
      case 'closed':
        clearInterval(timerInterval);
        toast('主持人已結束遊戲');
        setTimeout(() => location.reload(), 1800);
        break;
    }
  }

  function renderQuestion(q) {
    $('q-progress').textContent = `第 ${q.index + 1} / ${q.total} 題`;
    $('q-score').textContent = `${myScore} 分`;
    $('q-text').textContent = q.text;
    const qimg = $('q-image');
    qimg.classList.toggle('hidden', !q.image);
    qimg.src = q.image || '';

    const grid = $('q-answers');
    grid.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.dataset.i = i;
      btn.innerHTML = `<span class="shape">${SHAPES[i]}</span><span class="atext"></span>`;
      btn.querySelector('.atext').textContent = opt.text || '';
      if (opt.image) {
        const img = document.createElement('img');
        img.className = 'aimg' + (opt.text ? '' : ' only');
        img.alt = opt.text || `選項 ${i + 1}`;
        img.src = opt.image;
        btn.appendChild(img);
      }
      btn.addEventListener('click', () => {
        conn.send({ t: 'answer', index: i });
        show('waiting');
      });
      grid.appendChild(btn);
    });

    startTimer(q.timeLimit);
    show('question');
  }

  function startTimer(timeLimit) {
    clearInterval(timerInterval);
    const endsAt = Date.now() + timeLimit * 1000;
    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      $('q-timer').textContent = Math.ceil(left / 1000);
      if (left <= 0) clearInterval(timerInterval);
    };
    tick();
    timerInterval = setInterval(tick, 200);
  }

  function renderFeedback(fb) {
    myScore = fb.score;
    clearInterval(timerInterval);
    const title = $('fb-title');
    if (!fb.answered) {
      title.textContent = '⌛ 時間到，沒有作答';
      title.className = 'feedback bad';
    } else if (fb.correct) {
      title.textContent = '✅ 答對了！';
      title.className = 'feedback ok';
    } else {
      title.textContent = '❌ 答錯了';
      title.className = 'feedback bad';
    }
    $('fb-points').textContent = fb.correct ? `+${fb.points} 分（總分 ${fb.score}）` : `總分 ${fb.score}`;
    $('fb-rank').textContent = `目前排名：第 ${fb.rank} 名 / 共 ${fb.totalPlayers} 人`;
    $('fb-streak').textContent = fb.streak >= 2 ? `🔥 連對 ${fb.streak} 題！` : '';
    show('feedback');
  }

  function renderFinal(data) {
    clearInterval(timerInterval);
    const me = data.leaderboard.find((e) => e.name === myName);
    const rank = me ? me.rank : null;
    const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏁';
    $('final-emoji').textContent = emoji;
    $('final-title').textContent = rank ? `你是第 ${rank} 名！` : '遊戲結束';
    $('final-score').textContent = me
      ? `總分 ${me.score}｜答對 ${me.correctCount} / ${data.totalQuestions} 題`
      : '';
    show('final');
  }
})();
