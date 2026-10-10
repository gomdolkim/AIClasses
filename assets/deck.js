/* =========================================================
   공통 슬라이드 동작
   - 상단 바(목차·이전/다음·노트·테마), 진행 바, 슬라이드 번호
   - 키보드: ←/→/↑/↓/Space/PageUp/PageDown/Home/End, N = 강사 노트, D = 다크 모드
   - URL 해시(#5)로 특정 슬라이드 공유·이어 보기
   - 프롬프트 복사 버튼, 체크리스트 저장
   사용: <body data-lesson="3"> 또는 data-appendix="E" 또는 data-material="glossary"
   ========================================================= */
(function () {
  'use strict';

  const body = document.body;
  const course = window.COURSE;
  const root = body.dataset.root || '../';
  const slides = Array.from(document.querySelectorAll('.slide'));
  const total = slides.length;
  let current = 0;

  const safeStorage = {
    get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* 저장 불가 환경: 무시해도 화면은 정상 */ } }
  };

  /* ---------- 현재 문서 정보 ---------- */
  function describeDoc() {
    if (!course) return { label: document.title, prev: null, next: null };
    if (body.dataset.lesson) {
      const n = Number(body.dataset.lesson);
      const list = course.lessons;
      const i = list.findIndex(l => l.n === n);
      const me = list[i];
      const toLink = l => l && { href: root + 'lessons/' + l.slug + '.html', text: l.n + '회차 · ' + l.title };
      return { label: me ? me.n + '회차 · ' + me.title : document.title, prev: toLink(list[i - 1]), next: toLink(list[i + 1]) };
    }
    if (body.dataset.appendix) {
      const list = course.appendix;
      const i = list.findIndex(a => a.id === body.dataset.appendix);
      const me = list[i];
      const toLink = a => a && { href: root + 'appendix/' + a.slug + '.html', text: '부록 ' + a.id + ' · ' + a.title };
      return { label: me ? '부록 ' + me.id + ' · ' + me.title : document.title, prev: toLink(list[i - 1]), next: toLink(list[i + 1]) };
    }
    return { label: document.title, prev: null, next: null };
  }
  const doc = describeDoc();

  /* ---------- 상단 바 ---------- */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  const progress = el('div', { id: 'progress', 'aria-hidden': 'true' });
  const bar = el('nav', { class: 'topbar', 'aria-label': '강의 이동' });
  bar.appendChild(el('a', { href: root + 'index.html', title: '전체 목차로' }, '☰ 목차'));
  if (doc.prev) bar.appendChild(el('a', { href: doc.prev.href, class: 'tb-hide-sm', title: doc.prev.text }, '‹ 이전'));
  bar.appendChild(el('span', { class: 'tb-title' }, doc.label));
  const counter = el('span', { class: 'tb-counter', 'aria-live': 'polite' });
  bar.appendChild(counter);
  if (doc.next) bar.appendChild(el('a', { href: doc.next.href, class: 'tb-hide-sm', title: doc.next.text }, '다음 ›'));
  const notesBtn = el('button', { type: 'button', title: '강사 노트 보기 (N)', 'aria-pressed': 'false' }, '🎤');
  const themeBtn = el('button', { type: 'button', title: '밝게/어둡게 (D)' }, '🌓');
  bar.appendChild(notesBtn);
  bar.appendChild(themeBtn);
  body.prepend(bar);
  body.prepend(progress);

  /* ---------- 슬라이드 번호 · 마지막 슬라이드의 이전/다음 링크 ---------- */
  slides.forEach((s, i) => {
    s.id = s.id || 's' + (i + 1);
    s.setAttribute('aria-label', (i + 1) + ' / ' + total);
    s.appendChild(el('div', { class: 'slide-no', 'aria-hidden': 'true' }, (i + 1) + ' / ' + total));
  });
  document.querySelectorAll('.lesson-nav[data-auto]').forEach(nav => {
    nav.appendChild(el('a', { href: root + 'index.html' }, '☰ 전체 목차'));
    if (doc.next) nav.appendChild(el('a', { href: doc.next.href }, '다음: ' + doc.next.text + ' →'));
  });

  /* ---------- 이동 ---------- */
  function update(index) {
    current = index;
    progress.style.width = ((index + 1) / Math.max(total, 1) * 100) + '%';
    counter.textContent = (index + 1) + ' / ' + total;
    const hash = '#' + (index + 1);
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
  }
  function go(index) {
    if (index < 0 || index >= total) return;
    slides[index].scrollIntoView({ behavior: 'smooth' });
    update(index);
  }

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(key)) { e.preventDefault(); go(Math.min(current + 1, total - 1)); }
    else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(key)) { e.preventDefault(); go(Math.max(current - 1, 0)); }
    else if (key === 'Home') { e.preventDefault(); go(0); }
    else if (key === 'End') { e.preventDefault(); go(total - 1); }
    else if (key === 'n' || key === 'N') toggleNotes();
    else if (key === 'd' || key === 'D') toggleTheme();
  });

  const visibleObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = slides.indexOf(entry.target);
        if (idx !== -1) update(idx);
      }
    });
  }, { threshold: 0.55 });
  slides.forEach(s => visibleObserver.observe(s));

  /* ---------- 강사 노트 ---------- */
  function toggleNotes(force) {
    const on = typeof force === 'boolean' ? force : !body.classList.contains('show-notes');
    body.classList.toggle('show-notes', on);
    notesBtn.setAttribute('aria-pressed', String(on));
    safeStorage.set('deck:notes', on ? '1' : '0');
  }
  notesBtn.addEventListener('click', () => toggleNotes());
  if (safeStorage.get('deck:notes') === '1' || /[?&]notes=1/.test(window.location.search)) toggleNotes(true);

  /* ---------- 테마 ---------- */
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    safeStorage.set('deck:theme', next);
  }
  themeBtn.addEventListener('click', toggleTheme);
  applyTheme(safeStorage.get('deck:theme'));

  /* ---------- 프롬프트 복사 ---------- */
  document.querySelectorAll('.prompt, pre.code[data-copy]').forEach(box => {
    const btn = el('button', { type: 'button', class: 'copy-btn' }, '복사');
    btn.addEventListener('click', async () => {
      const text = Array.from(box.childNodes).filter(n => n !== btn).map(n => n.textContent).join('').trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '복사됨 ✓';
      } catch (e) {
        btn.textContent = '직접 선택해 복사하세요';
      }
      setTimeout(() => { btn.textContent = '복사'; }, 1800);
    });
    box.appendChild(btn);
  });

  /* ---------- 체크리스트 (이 브라우저에만 저장) ---------- */
  document.querySelectorAll('ul.checklist').forEach((list, li) => {
    const key = 'deck:check:' + window.location.pathname + ':' + li;
    const saved = (safeStorage.get(key) || '').split(',');
    Array.from(list.children).forEach((item, i) => {
      item.setAttribute('role', 'checkbox');
      item.setAttribute('tabindex', '0');
      const done = saved.includes(String(i));
      item.classList.toggle('done', done);
      item.setAttribute('aria-checked', String(done));
      const flip = () => {
        const on = !item.classList.contains('done');
        item.classList.toggle('done', on);
        item.setAttribute('aria-checked', String(on));
        const idx = Array.from(list.children).map((c, j) => c.classList.contains('done') ? j : null).filter(v => v !== null);
        safeStorage.set(key, idx.join(','));
      };
      item.addEventListener('click', flip);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flip(); } });
    });
  });

  /* ---------- 등장 효과 ---------- */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(n => revealObserver.observe(n));

  /* ---------- URL 해시(#5)로 이동: 처음 열 때 + 주소창에서 바꿀 때 ---------- */
  function jump(idx) {
    // CSS의 부드러운 스크롤을 잠시 끄고 즉시 이동 (중간 슬라이드를 거치지 않도록)
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, slides[idx].offsetTop);
    html.style.scrollBehavior = prev;
    update(idx);
  }
  function slideFromHash() {
    const n = parseInt((window.location.hash || '').replace('#', ''), 10);
    return n >= 1 && n <= total ? n - 1 : -1;
  }
  window.addEventListener('hashchange', () => {
    const idx = slideFromHash();
    if (idx !== -1 && idx !== current) jump(idx);
  });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const start = slideFromHash();
  if (start !== -1) {
    jump(start);
    // 글꼴이 늦게 도착하면 슬라이드 높이가 바뀌므로, 준비된 뒤 한 번 더 맞춥니다.
    const realign = () => { if (current === start) jump(start); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(realign);
    window.addEventListener('load', realign, { once: true });
  } else {
    update(0);
  }
})();
