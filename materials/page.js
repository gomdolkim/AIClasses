/* 자료 페이지(materials/) 공통 동작 — 슬라이드가 아닌 읽기용 페이지에서 사용
   - 밝게/어둡게 버튼(#themeBtn): 슬라이드와 같은 저장값(deck:theme) 공유
   - .prompt, pre.code[data-copy] 에 복사 버튼 추가
   - ul.checklist 클릭 체크 + 이 브라우저에 저장 */
(function () {
  'use strict';

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경: 화면은 정상 */ } }
  };

  /* 테마 */
  var root = document.documentElement;
  var saved = store.get('deck:theme');
  if (saved) root.setAttribute('data-theme', saved);
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = root.getAttribute('data-theme');
      var isDark = cur === 'dark' || (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('deck:theme', next);
    });
  }

  /* 복사 버튼 */
  document.querySelectorAll('.prompt, pre.code[data-copy]').forEach(function (box) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = '복사';
    btn.setAttribute('aria-label', '이 내용 복사');
    btn.addEventListener('click', function () {
      var text = Array.prototype.filter.call(box.childNodes, function (n) { return n !== btn; })
        .map(function (n) { return n.textContent; }).join('').trim();
      var done = function (msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = '복사'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done('복사됨 ✓'); }, function () { done('직접 선택해 복사하세요'); });
      } else {
        done('직접 선택해 복사하세요');
      }
    });
    box.appendChild(btn);
  });

  /* 체크리스트 */
  document.querySelectorAll('ul.checklist').forEach(function (list, li) {
    var key = 'deck:check:' + window.location.pathname + ':' + li;
    var savedIdx = (store.get(key) || '').split(',');
    var items = Array.prototype.slice.call(list.children);
    items.forEach(function (item, i) {
      item.setAttribute('role', 'checkbox');
      item.setAttribute('tabindex', '0');
      var on = savedIdx.indexOf(String(i)) !== -1;
      item.classList.toggle('done', on);
      item.setAttribute('aria-checked', String(on));
      var flip = function () {
        var now = !item.classList.contains('done');
        item.classList.toggle('done', now);
        item.setAttribute('aria-checked', String(now));
        var idx = items.map(function (c, j) { return c.classList.contains('done') ? j : null; })
          .filter(function (v) { return v !== null; });
        store.set(key, idx.join(','));
      };
      item.addEventListener('click', flip);
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      });
    });
  });
})();
