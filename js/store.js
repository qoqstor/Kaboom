/* Kaboom (GitHub Pages 版) — 題庫儲存於瀏覽器 localStorage */
(() => {
  const KEY = 'kaboom.quizzes';

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(data)) return data;
    } catch { /* fall through to seed */ }
    const seeded = [seedQuiz()];
    localStorage.setItem(KEY, JSON.stringify(seeded));
    return seeded;
  }

  function seedQuiz() {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title: '示範題庫：趣味常識',
      questions: [
        { text: '世界上最高的山是哪一座？', options: ['聖母峰', '富士山', '玉山', '喜馬拉雅山'], correctIndex: 0, timeLimit: 20 },
        { text: '一年有幾個季節？', options: ['2 個', '4 個', '6 個', '12 個'], correctIndex: 1, timeLimit: 10 },
        { text: '彩虹有幾種顏色？', options: ['5 種', '6 種', '7 種', '8 種'], correctIndex: 2, timeLimit: 15 },
      ],
      createdAt: now,
      updatedAt: now,
    };
  }

  function persist(quizzes) {
    localStorage.setItem(KEY, JSON.stringify(quizzes));
  }

  function validate(input) {
    const title = String((input && input.title) || '').trim();
    if (!title) throw new Error('請填寫題庫名稱');
    if (title.length > 100) throw new Error('題庫名稱過長');
    const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
    if (rawQuestions.length > 200) throw new Error('題目數量過多（上限 200 題）');

    const questions = rawQuestions.map((q, i) => {
      const text = String((q && q.text) || '').trim();
      if (!text) throw new Error(`第 ${i + 1} 題：請填寫題目內容`);
      if (text.length > 300) throw new Error(`第 ${i + 1} 題：題目文字過長`);
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o) => String(o || '').trim())
        .filter((o) => o.length > 0);
      if (options.length < 2) throw new Error(`第 ${i + 1} 題：至少需要 2 個選項`);
      if (options.length > 4) throw new Error(`第 ${i + 1} 題：最多 4 個選項`);
      if (options.some((o) => o.length > 120)) throw new Error(`第 ${i + 1} 題：選項文字過長`);
      const correctIndex = Number(q.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        throw new Error(`第 ${i + 1} 題：請指定正確答案`);
      }
      let timeLimit = Number(q.timeLimit);
      if (!Number.isFinite(timeLimit)) timeLimit = 20;
      timeLimit = Math.min(120, Math.max(5, Math.round(timeLimit)));
      return { text, options, correctIndex, timeLimit };
    });

    return { title, questions };
  }

  window.QuizStore = {
    list() {
      return load().map((q) => ({ id: q.id, title: q.title, questionCount: q.questions.length }));
    },
    get(id) {
      return load().find((q) => q.id === id) || null;
    },
    create(input) {
      const { title, questions } = validate(input);
      const quizzes = load();
      const now = new Date().toISOString();
      const quiz = { id: crypto.randomUUID(), title, questions, createdAt: now, updatedAt: now };
      quizzes.push(quiz);
      persist(quizzes);
      return quiz;
    },
    update(id, input) {
      const quizzes = load();
      const quiz = quizzes.find((q) => q.id === id);
      if (!quiz) return null;
      const { title, questions } = validate(input);
      quiz.title = title;
      quiz.questions = questions;
      quiz.updatedAt = new Date().toISOString();
      persist(quizzes);
      return quiz;
    },
    remove(id) {
      const quizzes = load();
      const next = quizzes.filter((q) => q.id !== id);
      if (next.length === quizzes.length) return false;
      persist(next);
      return true;
    },
    exportAll() {
      return JSON.stringify(load(), null, 2);
    },
    importAll(json) {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) throw new Error('格式錯誤：應為題庫陣列');
      const quizzes = load();
      let added = 0;
      for (const item of data) {
        const { title, questions } = validate(item);
        const now = new Date().toISOString();
        quizzes.push({ id: crypto.randomUUID(), title, questions, createdAt: now, updatedAt: now });
        added += 1;
      }
      persist(quizzes);
      return added;
    },
  };
})();
