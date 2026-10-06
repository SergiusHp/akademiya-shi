// Об’єднує мій курс (src/source/mine.json) із курсом «ШІ-Майстер» (src/source/maister/*.js)
// у src/course.json. Запуск: node tools/merge-course.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const mine = JSON.parse(fs.readFileSync(path.join(root, 'src/source/mine.json'), 'utf8'));

const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
['course', 'curriculum', 'advanced', 'automation', 'resources'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/source/maister', f + '.js'), 'utf8'), ctx, { filename: f });
});
const T = ctx.AI_COURSE;

// ---------- HTML → структурні блоки ----------
const dec = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function inline(html) {
  const out = []; let b = 0, c = 0;
  html = html.replace(/<br\s*\/?>/g, '\n');
  const re = /<(\/?)(b|strong|code|span|i|em)(?:\s[^>]*)?>|([^<]+)/g; let m;
  while ((m = re.exec(html))) {
    if (m[2]) { const open = !m[1]; if (m[2] === 'b' || m[2] === 'strong') b += open ? 1 : -1; if (m[2] === 'code') c += open ? 1 : -1; }
    else if (m[3]) out.push({ t: dec(m[3]), cls: (b > 0 ? 'sb ' : '') + (c > 0 ? 'sc' : '') });
  }
  return out;
}
function plain(html) { return dec(html.replace(/<[^>]+>/g, '')); }
function parseBody(html) {
  const blocks = []; const re = /<(p|h3|ul|ol|pre|div)([^>]*)>([\s\S]*?)<\/\1>/g; let m;
  while ((m = re.exec(html))) {
    const tag = m[1], attrs = m[2], inner = m[3];
    if (tag === 'p') blocks.push({ k: 'p', segs: inline(inner) });
    else if (tag === 'h3') blocks.push({ k: 'h', text: plain(inner) });
    else if (tag === 'pre') blocks.push({ k: 'pre', text: plain(inner) });
    else if (tag === 'ul' || tag === 'ol') {
      const items = []; const r2 = /<li>([\s\S]*?)<\/li>/g; let x;
      while ((x = r2.exec(inner))) items.push({ segs: inline(x[1]) });
      blocks.push({ k: tag, items });
    } else if (tag === 'div' && /steps/.test(attrs)) {
      const items = []; const r2 = /<span[^>]*>([\s\S]*?)<\/span>/g; let x;
      while ((x = r2.exec(inner))) items.push({ t: plain(x[1]) });
      blocks.push({ k: 'steps', items });
    } else if (tag === 'div' && /callout/.test(attrs)) {
      const t = inner.match(/<strong>([\s\S]*?)<\/strong>/);
      blocks.push({ k: 'call', title: t ? plain(t[1]) : '', segs: inline(inner.replace(/<strong>[\s\S]*?<\/strong>/, '')), warn: /warn/.test(attrs) });
    }
  }
  return blocks;
}

// ---------- перетворення уроків і тестів ----------
const mineLesson = (l) => ({
  t: l.t, deep: false,
  blocks: l.p.map((text) => ({ k: 'p', segs: [{ t: text, cls: '' }] })),
  bad: l.bad || '', good: l.good || '', tpl: l.tpl || '', tplTitle: l.tplTitle || '', tip: l.tip || ''
});
const theirLesson = (l) => ({
  t: l.title, deep: true, blocks: parseBody(l.body), bad: '', good: '',
  tpl: l.prompt || '', tplTitle: 'Шаблон', tip: l.takeaway || ''
});
const mineQuiz = (q) => ({ q: q.q, o: q.o, c: q.c, why: q.why });
const theirQuiz = (q) => ({ q: q.q, o: q.options, c: q.answer, why: q.explain });

// ---------- додаткові джерела ----------
const extraSources = [
  { id: 'bp1', title: 'Claude · Prompt engineering best practices', url: 'https://claude.com/blog/best-practices-for-prompt-engineering', note: 'Офіційні рекомендації щодо структури, прикладів і ітерацій.' },
  { id: 'bp2', title: 'Claude Docs · Prompting best practices', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices', note: 'Докладний довідник із промптингу.' },
  { id: 'finout', title: 'Finout · LLM token optimization tips', url: 'https://www.finout.io/blog/reduce-ai-costs-tips', note: 'Практичні способи зменшити витрати на токени.' },
  { id: 'coursera', title: 'Coursera · Advanced Prompting and Context Engineering', url: 'https://www.coursera.org/learn/advanced-prompting-context-engineering', note: 'Контекстна інженерія та просунуті техніки.' }
];

// ---------- практика для модулів без аналога ----------
const practiceAdvanced = {
  title: 'Ланцюжок із рецензентом',
  task: 'Пройдіть три кроки на власному тексті: чернетка → критика → виправлена версія.',
  steps: ['Оберіть короткий текст або план (до 200 слів).', 'Попросіть чернетку за чітким завданням.', 'У новому повідомленні попросіть «суворого рецензента» знайти слабкі місця.', 'Отримайте виправлену версію й порівняйте її з чернеткою.'],
  example: 'Чернетка листа була довгою. Рецензент вказав на відсутню дію й зайві фрази. У фіналі лист коротший на третину й має чітке прохання.',
  rubric: ['Є три окремі кроки.', 'Критика містить конкретні проблеми.', 'Я порівняв початкову й фінальну версію.'],
  hint: 'Візьміть лист із проханням або запрошення на зустріч.'
};
const practiceSkills = {
  title: 'Моя перша навичка',
  task: 'Оформіть повторюване завдання як навичку: назва, коли застосовувати, кроки, формат, приклад і критерій якості.',
  steps: ['Оберіть завдання, яке виконуєте щотижня.', 'Заповніть каркас навички з уроку.', 'Протестуйте на 3 різних вхідних даних.', 'Запишіть, що змінили після тесту.'],
  example: 'Навичка «Щотижневий дайджест»: джерела → відбір 5 тез → таблиця → висновок у 3 реченнях. Після тесту додав обмеження «без новин старших за 7 днів».',
  rubric: ['Є назва й умова застосування.', 'Кроки та формат чіткі.', 'Навичку протестовано на кількох прикладах.'],
  hint: 'Підійде підготовка підсумку зустрічі або огляд нових матеріалів за тиждень.'
};

// ---------- порядок і злиття ----------
const plan = [
  { t: 'basics', m: 0 }, { t: 'prompt', m: 1 }, { t: 'iterate' }, { t: 'context' }, { t: 'tokens', m: 3 }, { t: 'privacy' },
  { m: 2, practice: practiceAdvanced, sources: ['bp1', 'bp2', 'coursera'] },
  { t: 'research', m: 4 }, { t: 'verification' }, { t: 'data', m: 8 }, { t: 'creative' }, { t: 'websites', m: 5 }, { t: 'coding' },
  { t: 'agents', m: 6 }, { t: 'knowledge' }, { t: 'automation' }, { t: 'telegram', m: 7 }, { t: 'operations' },
  { m: 9, practice: practiceSkills, sources: ['bp2'], stage: 2 }, { t: 'evaluation', m: 10, dropMine: [0] }
];
const stageOf = (e) => (e.stage !== undefined ? e.stage : null);
let curStage = 0;
const modules = plan.map((e, idx) => {
  const th = e.t ? T.modules.find((x) => x.id === e.t) : null;
  const mi = e.m !== undefined ? mine[e.m] : null;
  if (th) curStage = th.stage; else if (e.stage !== undefined) curStage = e.stage; else if (idx < 7) curStage = 1;
  const lessons = [];
  if (mi) mi.lessons.forEach((l, i) => { if (!(e.dropMine || []).includes(i)) lessons.push(mineLesson(l)); });
  if (th) th.lessons.forEach((l) => lessons.push(theirLesson(l)));
  const quiz = [];
  if (mi) mi.quiz.forEach((q) => quiz.push(mineQuiz(q)));
  if (th) th.quiz.forEach((q) => quiz.push(theirQuiz(q)));
  const sources = (th ? th.sources : []).slice();
  if (e.t === 'prompt') sources.push('bp1', 'bp2');
  if (e.t === 'tokens') sources.push('finout');
  (e.sources || []).forEach((s) => { if (!sources.includes(s)) sources.push(s); });
  return {
    id: e.t || ('mine' + e.m), num: String(idx + 1).padStart(2, '0'), stage: curStage,
    title: th ? th.title : mi.title.replace(/^[^:]*:\s*/, (m0) => m0),
    desc: th ? th.desc : mi.desc,
    intro: mi ? mi.intro : th.desc,
    lessons, quiz, sources,
    practice: th ? th.practice : e.practice
  };
});
// Сталі стадії: модулі 1–6 → 0, 7–13 → 1, 14–20 → 2
modules.forEach((m, i) => { m.stage = i < 6 ? 0 : i < 13 ? 1 : 2; });

// ---------- бонус-етап: Claude, ChatGPT і Gemini (src/source/bonus.cjs) ----------
const bonus = require(path.join(root, 'src/source/bonus.cjs'));
const bonusStage = T.stages.length;
bonus.modules.forEach((m) => {
  modules.push(Object.assign({}, m, { num: String(modules.length + 1).padStart(2, '0'), stage: bonusStage, bonus: true }));
});

const out = {
  stages: T.stages.concat([bonus.stage]),
  sources: T.sources.concat(extraSources, bonus.sources),
  modules,
  extras: T.prompts.filter((p) => !p.module).map((p) => ({ title: p.title, text: p.text, cat: p.category, use: p.use, input: p.input })).concat(bonus.extras),
  projects: T.projects, glossary: T.glossary.concat(bonus.glossary), scenarios: T.scenarios, updated: T.updated
};
fs.writeFileSync(path.join(root, 'src/course.json'), JSON.stringify(out));
const L = modules.reduce((n, m) => n + m.lessons.length, 0), Q = modules.reduce((n, m) => n + m.quiz.length, 0);
console.log('modules', modules.length, 'lessons', L, 'questions', Q, 'extras', out.extras.length);
modules.forEach((m) => console.log(m.num, m.stage, m.id, m.lessons.length + 'L', m.quiz.length + 'Q', m.practice ? 'P' : 'noP'));
