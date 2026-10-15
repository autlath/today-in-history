/* 历史上的今天 · 页面交互(纯客户端,无任何网络请求) */
(() => {
  /* —— 导航高亮:滚动时点亮当前版块 —— */
  const links = [...document.querySelectorAll('.nav a[href^="#"]')];
  const map = new Map();
  for (const link of links) {
    const sec = document.querySelector(link.getAttribute('href'));
    if (sec) map.set(sec, link);
  }
  if (map.size && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            for (const l of links) l.classList.remove('active');
            map.get(e.target)?.classList.add('active');
          }
        }
      },
      { rootMargin: '-25% 0px -65% 0px' }
    );
    for (const sec of map.keys()) io.observe(sec);
  }

  /* —— 大事记关键词筛选 —— */
  const input = document.getElementById('q');
  const timeline = document.querySelector('.timeline');
  const empty = document.querySelector('.filter-empty');
  if (input && timeline) {
    const events = [...timeline.querySelectorAll('.event')];
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const q = raw.toLowerCase();
      let visible = 0;
      for (const ev of events) {
        const hit = !q || ev.textContent.toLowerCase().includes(q);
        ev.hidden = !hit;
        if (hit) visible++;
      }
      for (const era of timeline.querySelectorAll('.era')) {
        const any = [...era.querySelectorAll('.event')].some((ev) => !ev.hidden);
        era.hidden = !any;
      }
      if (empty) {
        empty.textContent = q && visible === 0 ? `未找到与「${raw}」相关的条目` : '';
        empty.style.display = q && visible === 0 ? 'block' : 'none';
      }
    });
  }

  /* —— 回到顶部 —— */
  const btn = document.querySelector('.to-top');
  if (btn) {
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    const onScroll = () => btn.classList.toggle('show', window.scrollY > 640);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
