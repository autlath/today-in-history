#!/usr/bin/env node
/**
 * 历史上的今天 —— 每日静态构建脚本
 *
 * 从中文维基百科 "On This Day" 接口抓取当日数据,
 * 渲染为纯静态 index.html(内容在构建期写死,页面运行时零请求)。
 *
 * 用法:  node scripts/build.mjs
 * 时区:  一律按北京时间(UTC+8)计算"今天"
 * 兜底:  抓取失败(重试 3 次)则非零退出,不覆盖旧页面
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/* ============================================================
 * 纯函数区(不依赖 Node 环境,便于在其他运行时中复用)
 * ========================================================== */

const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

const cnNum = (n) =>
  n <= 10 ? CN_NUM[n]
  : n < 20 ? '十' + CN_NUM[n - 10]
  : CN_NUM[Math.trunc(n / 10)] + '十' + (n % 10 ? CN_NUM[n % 10] : '');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const fmtYear = (y) => (y < 0 ? String(Math.abs(y)) : String(y));
const ageText = (y, thisYear) => {
  const a = thisYear - y;
  return a <= 0 ? '是年' : `距今 ${a} 年`;
};
const eraOf = (y) => (y <= 1839 ? '古代' : y <= 1949 ? '近代' : y <= 1999 ? '现代' : '当代');

function buildModel(data, date) {
  const shape = (list) => (Array.isArray(list) ? list : []).map((x) => ({
    year: x.year,
    text: x.text ?? '',
  }));
  return {
    selected: shape(data.selected),
    events: shape(data.events).sort((a, b) => a.year - b.year),
    births: shape(data.births).sort((a, b) => a.year - b.year),
    deaths: shape(data.deaths).sort((a, b) => a.year - b.year),
    holidays: shape(data.holidays),
    date,
  };
}

function render(model) {
  const { selected, events, births, deaths, holidays } = model;
  const { MM, DD, YEAR, WEEKDAY, STAMP } = model.date;
  const cnM = cnNum(+MM);
  const cnD = cnNum(+DD);
  const total = selected.length + events.length + births.length + deaths.length + holidays.length;
  const counts = {
    selected: selected.length,
    events: events.length,
    births: births.length,
    deaths: deaths.length,
    holidays: holidays.length,
  };

  /* 年份展示:公元前数字下方加小字 */
  const yearHTML = (y) => (y < 0 ? `${fmtYear(y)}<span class="bc">公元前</span>` : fmtYear(y));

  const navHTML = [
    selected.length && { id: 'selected', label: '今日精选' },
    events.length && { id: 'events', label: '大事记' },
    births.length && { id: 'births', label: '诞辰' },
    deaths.length && { id: 'deaths', label: '逝世' },
    holidays.length && { id: 'holidays', label: '节日' },
  ].filter(Boolean)
    .map((n) => `<a href="#${n.id}">${n.label}<span class="n">${counts[n.id]}</span></a>`)
    .join('');

  const statsHTML = [
    ['大事记', events.length],
    ['诞辰', births.length],
    ['逝世', deaths.length],
    ['节日', holidays.length],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  const selectedHTML = selected.slice(0, 3).map((s, i) => `
    <article class="sel-card rise" style="--i:${i}">
      <div class="sel-top">
        <div class="sel-year">${yearHTML(s.year)}</div>
        <div class="sel-age">${ageText(s.year, YEAR)}</div>
      </div>
      <p class="sel-text">${esc(s.text)}</p>
    </article>`).join('');

  /* 大事记按时代分组 */
  const eras = [];
  for (const ev of events) {
    const name = eraOf(ev.year);
    let era = eras.find((e) => e.name === name);
    if (!era) eras.push((era = { name, items: [] }));
    era.items.push(ev);
  }
  const eventsHTML = eras.map((era) => `
    <section class="era">
      <h3 class="era-tag">${era.name}</h3>
      <div class="era-entries">
        ${era.items.map((ev, i) => `
        <article class="event rise" style="--i:${Math.min(i, 18)}">
          <div class="event-year">${yearHTML(ev.year)}</div>
          <p class="event-text">${esc(ev.text)}</p>
          <p class="event-age">${ageText(ev.year, YEAR)}</p>
        </article>`).join('')}
      </div>
    </section>`).join('');

  const peopleHTML = (list) => list.map((p, i) => {
    const cut = String(p.text).search(/[,，]/);
    const name = cut > 0 ? p.text.slice(0, cut) : p.text;
    const desc = cut > 0 ? p.text.slice(cut) : '';
    return `
    <div class="person rise" style="--i:${Math.min(i, 18)}">
      <div class="person-year">${yearHTML(p.year)}</div>
      <p class="person-text"><b>${esc(name)}</b>${esc(desc)}</p>
    </div>`;
  }).join('');

  const holidaysHTML = holidays.map((h, i) =>
    `<span class="holiday rise" style="--i:${Math.min(i, 18)}">${esc(h.text)}</span>`
  ).join('');

  const section = (id, kicker, title, countText, inner) => `
    <section class="section" id="${id}" aria-labelledby="${id}-title">
      <header class="sec-head">
        <span class="sec-kicker">${kicker}</span>
        <h2 class="sec-title" id="${id}-title">${title}</h2>
        <span class="sec-count">${countText}</span>
      </header>
      ${inner}
    </section>`;

  const sections = [];
  if (selected.length) sections.push(
    section('selected', 'Selected · 头条', '今日精选', `凡 ${selected.length} 则`, `<div class="sel-grid">${selectedHTML}</div>`));
  if (events.length) sections.push(
    section('events', 'Chronicle · 编年', '大事记', `凡 ${events.length} 则`, `<div class="timeline">${eventsHTML}<p class="filter-empty" aria-live="polite"></p></div>`));
  if (births.length) sections.push(
    section('births', 'Born · 诞辰', '诞辰', `凡 ${births.length} 人`, `<div class="people-grid">${peopleHTML(births)}</div>`));
  if (deaths.length) sections.push(
    section('deaths', 'In Memoriam · 谢世', '逝世', `凡 ${deaths.length} 人`, `<div class="people-grid">${peopleHTML(deaths)}</div>`));
  if (holidays.length) sections.push(
    section('holidays', 'Calendar · 节候', '节日', `凡 ${holidays.length} 项`, `<div class="holiday-list">${holidaysHTML}</div>`));

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>历史上的今天 · ${cnM}月${cnD}日</title>
<meta name="description" content="历史上的今天,${+MM} 月 ${+DD} 日:大事记 ${events.length} 则、诞辰 ${births.length} 人、逝世 ${deaths.length} 人。每日零点自动更新,纯静态页面。">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='9' fill='%23a63a2b'/%3E%3Ctext x='32' y='45' font-size='38' text-anchor='middle' fill='%23f5efdf' font-family='serif' font-weight='700'%3E%E5%8F%B2%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="wrap">

  <header class="masthead">
    <div class="mast-title rise" style="--i:0" aria-hidden="true">历史上的今天</div>
    <div class="mast-main">
      <p class="mast-kicker rise" style="--i:1">Daily Chronicle · 每日档案</p>
      <h1 class="mast-date rise" style="--i:2">${cnM}月${cnD}日</h1>
      <p class="mast-sub rise" style="--i:3">
        <span class="latin">${MONTHS[+MM - 1]} ${+DD}, ${YEAR}</span>
        <span class="dot">·</span>${WEEKDAY}<span class="dot">·</span>凡 ${total} 则档案
      </p>
    </div>
    <dl class="mast-stats rise" style="--i:4">${statsHTML}</dl>
    <div class="seal rise" style="--i:5" aria-hidden="true"><span class="seal-text">以史为鉴</span></div>
  </header>

</div>

<nav class="nav" aria-label="版块导航">
  <div class="nav-inner">
    ${navHTML}
    <div class="filter"><input type="search" id="q" placeholder="筛选大事记" aria-label="筛选大事记"></div>
  </div>
</nav>

<div class="wrap">
  <main>
${sections.join('\n')}
${total === 0 ? '    <section class="section"><p class="filter-empty" style="display:block">今日档案暂缺,请稍后再试。</p></section>' : ''}
  </main>

  <footer class="footer">
    <div class="footer-rule"></div>
    <div class="footer-inner">
      <p class="quote">以铜为镜,可以正衣冠;以史为镜,可以知兴替。<span class="src">——《旧唐书·魏徵传》</span></p>
      <div class="meta">
        <p>数据来源 · 中文维基百科「历史上的今天」</p>
        <p>每日 00:00(北京时间)自动构建 · 页面运行时零请求</p>
        <p>本页生成于 ${STAMP}(北京时间)</p>
      </div>
    </div>
  </footer>
</div>

<button class="to-top" type="button" aria-label="回到顶部">回顶</button>
<script src="assets/app.js" defer></script>
</body>
</html>`;
}

/* ============================================================
 * Node 入口(本地 / GitHub Actions 中执行)
 * ========================================================== */

async function fetchData(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'Api-User-Agent': 'history-today/1.0 (daily static page generator)',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.error(`抓取失败(第 ${i + 1} 次):${err.message}`);
      if (i < 2) await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  /* 北京时间(UTC+8):无论宿主机时区如何,统一换算 */
  const now = new Date(Date.now() + 8 * 3600e3);
  const MM = now.toISOString().slice(5, 7);
  const DD = now.toISOString().slice(8, 10);
  const date = {
    MM,
    DD,
    YEAR: now.getUTCFullYear(),
    WEEKDAY: new Intl.DateTimeFormat('zh-CN', { weekday: 'long', timeZone: 'UTC' }).format(now),
    STAMP: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(now),
  };
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/all/${MM}/${DD}`;

  console.log(`→ 抓取 ${url}`);
  const data = await fetchData(url);
  const model = buildModel(data, date);

  const root = join(dirname(process.argv[1]), '..');
  await writeFile(join(root, 'index.html'), render(model), 'utf8');
  console.log(`✓ 已生成 index.html(${+MM} 月 ${+DD} 日,大事记 ${model.events.length} 则)`);
}

const __isMain =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  process.argv[1].replace(/\\/g, '/').endsWith('scripts/build.mjs');

if (__isMain) {
  main().catch((err) => {
    console.error('✗ 构建失败,保留旧页面:', err);
    process.exit(1);
  });
}
