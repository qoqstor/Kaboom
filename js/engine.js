/* Kaboom (GitHub Pages 版) — 遊戲引擎，跑在主持人瀏覽器內
 * 玩家透過 WebRTC (PeerJS DataConnection) 連進來，主持人是唯一權威。
 * 訊息協定（JSON）：
 *   玩家 → 主持人：{t:'join', name} {t:'answer', index}
 *   主持人 → 玩家：{t:'join-ok'|'join-err'|'lobby'|'question'|'feedback'|'podium'|'closed', ...}
 */
(() => {
  const MAX_PLAYERS = 100;
  const MAX_NAME_LEN = 16;

  class GameEngine {
    constructor(quiz, callbacks) {
      this.quiz = quiz;
      this.cb = callbacks; // {onLobby, onQuestion, onProgress, onReveal, onPodium}
      this.state = 'lobby';
      this.currentIndex = -1;
      this.players = new Map(); // peerId -> {conn, name, score, streak, correctCount, connected, lastPoints}
      this.answers = new Map(); // peerId -> {index, elapsedMs}
      this.questionTimer = null;
      this.questionStartedAt = 0;
    }

    connectedPlayers() {
      return [...this.players.values()].filter((p) => p.connected);
    }

    currentQuestion() {
      return this.quiz.questions[this.currentIndex] || null;
    }

    // --- connection handling ------------------------------------------------
    handleConnection(conn) {
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'join') this.handleJoin(conn, msg);
        else if (msg.t === 'answer') this.handleAnswer(conn.peer, msg);
      });
      conn.on('close', () => this.handleDisconnect(conn.peer));
      conn.on('error', () => this.handleDisconnect(conn.peer));
    }

    handleJoin(conn, msg) {
      const name = String(msg.name || '').trim().slice(0, MAX_NAME_LEN);
      const reply = (m) => { try { conn.send(m); } catch { /* conn already gone */ } };
      if (!name) return reply({ t: 'join-err', error: '請輸入暱稱' });

      if (this.state !== 'lobby') {
        // 斷線玩家可用同一暱稱回鍋
        const ghost = [...this.players.entries()].find(([, p]) => !p.connected && p.name === name);
        if (!ghost) return reply({ t: 'join-err', error: '遊戲已經開始，無法加入' });
        const [oldId, player] = ghost;
        this.players.delete(oldId);
        player.conn = conn;
        player.connected = true;
        player.peerId = conn.peer;
        this.players.set(conn.peer, player);
        reply({ t: 'join-ok', name, title: this.quiz.title, rejoined: true });
        this.broadcastLobby();
        return;
      }
      if (this.connectedPlayers().length >= MAX_PLAYERS) return reply({ t: 'join-err', error: '人數已滿' });
      if (this.connectedPlayers().some((p) => p.name === name)) return reply({ t: 'join-err', error: '這個暱稱已有人使用' });

      this.players.set(conn.peer, {
        conn, peerId: conn.peer, name, score: 0, streak: 0, correctCount: 0, connected: true, lastPoints: 0,
      });
      reply({ t: 'join-ok', name, title: this.quiz.title });
      this.broadcastLobby();
    }

    handleDisconnect(peerId) {
      const player = this.players.get(peerId);
      if (!player) return;
      player.connected = false;
      if (this.state === 'lobby') this.players.delete(peerId);
      this.broadcastLobby();
    }

    broadcast(msg) {
      for (const p of this.players.values()) {
        if (p.connected) { try { p.conn.send(msg); } catch { /* stale conn */ } }
      }
    }

    broadcastLobby() {
      const names = this.connectedPlayers().map((p) => p.name);
      this.broadcast({ t: 'lobby', count: names.length, names });
      this.cb.onLobby(names);
    }

    // --- game flow ------------------------------------------------------------
    start() {
      if (this.state !== 'lobby') return { error: '遊戲已經開始' };
      if (this.connectedPlayers().length === 0) return { error: '還沒有玩家加入' };
      this.nextQuestion();
      return {};
    }

    next() {
      if (this.state === 'reveal') {
        if (this.currentIndex + 1 >= this.quiz.questions.length) this.showPodium();
        else this.nextQuestion();
        return {};
      }
      if (this.state === 'question') { this.endQuestion(); return {}; }
      return { error: '目前無法進入下一步' };
    }

    nextQuestion() {
      this.currentIndex += 1;
      const q = this.currentQuestion();
      this.state = 'question';
      this.answers = new Map();
      this.questionStartedAt = Date.now();

      const payload = {
        t: 'question',
        index: this.currentIndex,
        total: this.quiz.questions.length,
        text: q.text,
        image: q.image || null,
        // 舊題庫的選項是字串，統一成 {text, image} 物件再送出
        options: q.options.map((o) => (typeof o === 'string' ? { text: o } : { text: o.text || '', image: o.image || null })),
        timeLimit: q.timeLimit,
      };
      this.broadcast(payload);
      this.cb.onQuestion(payload);
      this.cb.onProgress(0, this.connectedPlayers().length);

      clearTimeout(this.questionTimer);
      this.questionTimer = setTimeout(() => this.endQuestion(), q.timeLimit * 1000 + 500);
    }

    handleAnswer(peerId, msg) {
      if (this.state !== 'question') return;
      const q = this.currentQuestion();
      const player = this.players.get(peerId);
      if (!player || this.answers.has(peerId)) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return;

      const elapsedMs = Math.min(Date.now() - this.questionStartedAt, q.timeLimit * 1000);
      this.answers.set(peerId, { index: idx, elapsedMs });
      this.cb.onProgress(this.answers.size, this.connectedPlayers().length);

      if (this.connectedPlayers().every((p) => this.answers.has(p.peerId))) {
        clearTimeout(this.questionTimer);
        this.questionTimer = setTimeout(() => this.endQuestion(), 400);
      }
    }

    scoreFor(q, elapsedMs, streak) {
      const ratio = Math.min(1, elapsedMs / (q.timeLimit * 1000));
      const base = Math.round(1000 * (1 - ratio / 2));
      const bonus = Math.min(streak, 5) * 100;
      return base + bonus;
    }

    endQuestion() {
      if (this.state !== 'question') return;
      clearTimeout(this.questionTimer);
      this.state = 'reveal';
      const q = this.currentQuestion();

      const counts = q.options.map(() => 0);
      for (const [peerId, ans] of this.answers) {
        counts[ans.index] += 1;
        const player = this.players.get(peerId);
        if (!player) continue;
        if (ans.index === q.correctIndex) {
          player.streak += 1;
          player.correctCount += 1;
          player.lastPoints = this.scoreFor(q, ans.elapsedMs, player.streak - 1);
          player.score += player.lastPoints;
        } else {
          player.streak = 0;
          player.lastPoints = 0;
        }
      }
      for (const [peerId, player] of this.players) {
        if (!this.answers.has(peerId)) { player.streak = 0; player.lastPoints = 0; }
      }

      const leaderboard = this.leaderboard();
      const isLast = this.currentIndex + 1 >= this.quiz.questions.length;

      for (const [peerId, player] of this.players) {
        if (!player.connected) continue;
        const ans = this.answers.get(peerId);
        try {
          player.conn.send({
            t: 'feedback',
            answered: !!ans,
            correct: !!ans && ans.index === q.correctIndex,
            points: player.lastPoints || 0,
            score: player.score,
            streak: player.streak,
            rank: leaderboard.findIndex((e) => e.name === player.name) + 1,
            totalPlayers: leaderboard.length,
          });
        } catch { /* stale conn */ }
      }

      this.cb.onReveal({ correctIndex: q.correctIndex, counts, leaderboard: leaderboard.slice(0, 5), isLast });
    }

    leaderboard() {
      return [...this.players.values()]
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map((p, i) => ({ rank: i + 1, name: p.name, score: p.score, correctCount: p.correctCount }));
    }

    showPodium() {
      this.state = 'podium';
      const leaderboard = this.leaderboard();
      const payload = {
        t: 'podium',
        podium: leaderboard.slice(0, 3),
        leaderboard,
        totalQuestions: this.quiz.questions.length,
      };
      this.broadcast(payload);
      this.cb.onPodium(payload);
    }

    end() {
      clearTimeout(this.questionTimer);
      this.state = 'ended';
      this.broadcast({ t: 'closed' });
    }
  }

  window.GameEngine = GameEngine;
})();
