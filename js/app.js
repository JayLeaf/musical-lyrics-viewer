/* 뮤지컬 가사 뷰어 — 화면, 메뉴, 모드, 편집/짝 맞추기/타이밍 녹음 */
(function () {
  'use strict';
  var LP = window.LP, DB = window.LDB;
  var APP_VERSION = '1.3.1';
  var PCLS = { '공': 'p-c', '남': 'p-m', '여': 'p-f' };
  var MODES = [['hand', '들고 보기'], ['table', '내려놓기'], ['book', '갤럭시북']];

  // ---------------------------------------------------------------- 도구
  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function btn(label, onclick, cls, title) {
    return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: onclick, title: title || null, 'aria-label': title || null }, label);
  }
  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  function natCmp(a, b) { return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' }); }
  function showName(folder) { return String(folder).replace(/^\d+[_.\s-]*/, '') || folder; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  function fmtT(t) {
    if (t === null || t === undefined) return '--:--.-';
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function round(x, d) { var p = Math.pow(10, d); return Math.round(x * p) / p; }
  function debounce(fn, ms) { var id; return function () { var a = arguments; clearTimeout(id); id = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function signed(x) { return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1); }
  var BAD_NAME = /[\\/:*?"<>|]/;

  // ---------------------------------------------------------------- 상태
  var DEF = { mode: null, showKo: true, scale: { hand: 1, table: 1, book: 1 }, lead: 0.5, group: 1.0, wake: true };
  var S = {
    songs: new Map(), overrides: {}, dir: null, curId: null, parsed: null, times: null, groups: [],
    set: Object.assign({}, DEF, lsGet('lv.settings', {}))
  };
  S.set.scale = Object.assign({}, DEF.scale, S.set.scale || {});
  if (!S.set.mode) {
    var wide = window.matchMedia('(pointer:fine)').matches && Math.max(innerWidth, innerHeight) >= 1000;
    S.set.mode = wide ? 'book' : 'hand';
  }
  function saveSet() { lsSet('lv.settings', S.set); }
  function cur() { return S.curId ? S.songs.get(S.curId) : null; }
  function hasText(r) { return !!(r && r.raw && r.raw.trim()); }
  function sortedSongs() {
    return Array.from(S.songs.values()).sort(function (a, b) { return natCmp(a.folder, b.folder) || natCmp(a.file, b.file); });
  }

  function reparse() {
    var r = cur();
    if (!r) { S.parsed = null; S.times = null; S.groups = []; return; }
    S.parsed = LP.parseSong(r.raw, { counts: r.counts, overrides: S.overrides });
    S.times = LP.effectiveTimes(r.timing, S.parsed.lines.length);
    S.groups = makeGroups();
  }
  // 화면에 한 번에 보여줄 줄 묶음: 다음 줄이 S.set.group초 안에 시작하면(짧은 줄),
  // (괄호) 줄이 그 2.5배 안에 시작하면(맞받는 줄), 앞 줄이 끝나기 전에 시작하면(겹침, timing.ends 있을 때)
  // 앞 줄과 같이 보여준다. 최대 3줄.
  function makeGroups() {
    var n = S.parsed ? S.parsed.lines.length : 0, t = S.times, gap = S.set.group || 0, G = [];
    var r = cur(), tm = r && r.timing, own = tm && tm.times, ends = tm && Array.isArray(tm.ends) && tm.ends.length === n ? tm.ends : null;
    for (var i = 0; i < n; i++) {
      var g = G[G.length - 1], join = false;
      if (t && g && gap > 0 && g.length < 3) {
        var d = t[i] - t[i - 1];
        join = d < gap || (/^[\s(（]*[(（]/.test(S.parsed.lines[i].text) && d < gap * 2.5) ||
          !!(ends && own && typeof own[i] === 'number' && typeof ends[i - 1] === 'number' && own[i] < ends[i - 1] - 0.3);
      }
      if (join) g.push(i); else G.push([i]);
    }
    return G;
  }
  function selectSong(id) {
    S.curId = id; lsSet('lv.last', id);
    stopPlayback(); reparse(); closeDrawer(); render();
    window.scrollTo(0, 0);
  }
  function pickDefault() {
    var last = lsGet('lv.last', null);
    if (last && S.songs.has(last)) { S.curId = last; return; }
    var list = sortedSongs();
    var firstFull = list.filter(hasText)[0];
    S.curId = firstFull ? firstFull.id : null;
  }
  function saveSong(r) { S.songs.set(r.id, r); return DB.put('songs', r); }

  async function persistStorage() {
    try {
      if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch (e) { /* 무시 */ }
  }

  // ---------------------------------------------------------------- 화면 꺼짐 방지
  var wl = null;
  async function wakeOn() {
    if (!S.set.wake || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wl) return;
    try {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', function () { wl = null; });
    } catch (e) { wl = null; }
  }
  function wakeOff() { if (wl) { wl.release().catch(function () {}); wl = null; } }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') wakeOn();
  });

  // ---------------------------------------------------------------- 그리기
  function render() {
    document.body.dataset.mode = S.set.mode;
    document.documentElement.style.setProperty('--s', String(S.set.scale[S.set.mode] || 1));
    document.querySelectorAll('.modes button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.mode === S.set.mode ? 'true' : 'false');
    });
    var v = $('#view');
    STAGE = null;
    var r = cur();
    if (!r) { v.replaceChildren(emptyView()); return; }
    if (!S.parsed) reparse();
    v.replaceChildren(S.set.mode === 'hand' ? handView(r) : stageView(r));
  }

  function emptyView() {
    var anyText = sortedSongs().some(hasText);
    var box = h('div', { class: 'empty' });
    if (S.songs.size && anyText) {
      box.append(h('p', null, '☰ 메뉴에서 곡을 골라 주세요.'), btn('곡 목록 열기', openDrawer, 'primary'));
      return box;
    }
    box.append(
      h('h1', null, '뮤지컬 가사 뷰어'),
      h('p', null, S.songs.size ? '곡 목록은 있는데 아직 가사가 비어 있어요.' : '아직 가사가 없어요. 아래 방법 중 하나로 가사를 넣어 주세요.'),
      h('div', { class: 'stack' },
        'showDirectoryPicker' in window ? btn('📁 가사 폴더 열기 (PC)', pickFolder, 'primary') : null,
        btn('📂 가사 폴더 불러오기 (읽기만)', function () { $('#dirInput').click(); }),
        btn('📦 가사 묶음 파일 가져오기', function () { $('#bundleInput').click(); }),
        btn('✏️ 새 곡 직접 붙여넣기', function () { openEditor(null); }),
        S.songs.size ? btn('곡 목록 열기', openDrawer) : null
      ),
      h('p', { class: 'muted small' }, 'PC: 00_가사 폴더를 열면 바로 읽고, 편집·타이밍도 그 폴더에 저장돼요. 폰: PC에서 내보낸 가사 묶음 파일(.json)을 가져오세요.')
    );
    return box;
  }

  // 괄호 안(코러스·메아리)은 공용 색으로 살짝 흐리게
  function txtEl(text) {
    var el = h('div', { class: 'txt' });
    String(text).split(/(\([^)]*\))/).forEach(function (seg) {
      if (!seg) return;
      if (/^\(.*\)$/.test(seg)) el.append(h('span', { class: 'bk' }, seg));
      else el.append(seg);
    });
    return el;
  }

  function lineEl(ln, cls) {
    var el = h('div', { class: cls + ' ' + PCLS[ln.part] }, txtEl(ln.text));
    if (S.set.showKo && ln.ko) el.append(h('div', { class: 'ko' }, ln.ko));
    return el;
  }

  function songHead(r) {
    return h('div', { class: 'songhead' },
      h('div', { class: 'show' }, showName(r.folder)),
      h('h1', null, r.file));
  }

  function handView(r) {
    var p = S.parsed;
    var wrap = h('div', { class: 'hand' }, songHead(r));
    if (!p.lines.length) {
      wrap.append(h('p', { class: 'muted' }, '가사가 비어 있어요.'), btn('가사 넣기', function () { openEditor(r.id); }, 'primary'));
      return wrap;
    }
    if (p.flags.length) {
      wrap.append(h('div', { class: 'notice' }, '해석 짝이 안 맞을 수 있는 줄이 ' + p.flags.length + '개 있어요. ',
        btn('짝 맞추기', openPair, 'small')));
    }
    var prev = null;
    p.lines.forEach(function (ln) {
      if (prev !== null && ln.stanza !== prev) wrap.append(h('div', { class: 'gap' }));
      prev = ln.stanza;
      if (ln.groupStart && ln.singer) wrap.append(h('div', { class: 'singer ' + PCLS[ln.part] }, ln.singer));
      wrap.append(lineEl(ln, 'line'));
    });
    wrap.append(h('div', { class: 'endmark' }, '— 끝 —'));
    return wrap;
  }

  // ---------------------------------------------------------------- 자동 넘김 (모드 2·3)
  var PB = { playing: false, aSong: 0, aPerf: 0, idx: -1, raf: 0, hudAt: 0 };
  var STAGE = null;

  function songNow() { return PB.playing ? PB.aSong + (performance.now() - PB.aPerf) / 1000 : PB.aSong; }
  function effT(i) { var r = cur(); return S.times[i] + ((r && r.offset) || 0); }
  function gT(g) { return effT(S.groups[g][0]); }
  function lineAt(s) {
    var lo = -1;
    for (var g = 0; g < S.groups.length; g++) { if (gT(g) - S.set.lead <= s) lo = g; else break; }
    return lo;
  }
  function play() {
    if (!S.times || PB.playing) return;
    PB.aPerf = performance.now(); PB.playing = true; wakeOn();
    tick(); updateStage();
  }
  function pause() {
    if (!PB.playing) return;
    PB.aSong = songNow(); PB.playing = false; cancelAnimationFrame(PB.raf); updateStage();
  }
  function stopPlayback() { PB.playing = false; cancelAnimationFrame(PB.raf); PB.aSong = 0; PB.idx = -1; }
  function tick() {
    if (!PB.playing) return;
    var i = lineAt(songNow());
    if (i !== PB.idx) { PB.idx = i; updateStage(); }
    else if (performance.now() - PB.hudAt > 250) updateHud();
    PB.raf = requestAnimationFrame(tick);
  }
  function step(d) {
    if (!S.parsed) return;
    var n = S.groups.length;
    var ni = Math.max(-1, Math.min(n - 1, PB.idx + d));
    if (ni === PB.idx) return;
    PB.idx = ni;
    if (S.times) { PB.aSong = ni < 0 ? 0 : gT(ni) - S.set.lead + 0.01; PB.aPerf = performance.now(); }
    updateStage();
  }
  function restart() { stopPlayback(); updateStage(); }
  function nudgeOffset(d) {
    var r = cur(); if (!r) return;
    r.offset = round((r.offset || 0) + d, 1);
    saveSong(r);
    updateStage();
  }

  function stageView(r) {
    var p = S.parsed;
    var st = h('div', { class: 'stage' });
    if (!p.lines.length) {
      st.append(h('div', { class: 'empty' }, h('p', null, '가사가 비어 있어요.'), btn('가사 넣기', function () { openEditor(r.id); }, 'primary')));
      return st;
    }
    var prog = h('div', { class: 'prog' }, h('i'));
    var hudL = h('span', { class: 'hud-l' }, showName(r.folder) + ' · ' + r.file);
    var hudR = h('span', { class: 'hud-r' });
    var rows = h('div', { class: 'rows' });
    var slots = [];
    for (var off = -2; off <= 6; off++) {
      var sl = h('div', { class: 'slot', 'data-off': String(off) });
      slots.push(sl); rows.append(sl);
    }
    var playBtn = btn('▶', function () { PB.playing ? pause() : play(); }, 'play', '시작/일시정지');
    var offVal = h('span', { class: 'offval' });
    var fsBtn = btn('⛶', toggleFs, 'fsbtn', '전체 화면');
    var ctrl = h('div', { class: 'ctrl' },
      btn('⏮', restart, '', '처음으로'),
      btn('‹', function () { step(-1); }, '', '이전 줄'),
      S.times ? playBtn : h('span', { class: 'muted small notime' }, '타이밍 없음 · 탭/스와이프로 넘기기'),
      btn('›', function () { step(1); }, '', '다음 줄'),
      S.times ? h('span', { class: 'offset' },
        btn('−0.5', function () { nudgeOffset(-0.5); }, 'small', '가사를 0.5초 빨리'),
        offVal,
        btn('+0.5', function () { nudgeOffset(0.5); }, 'small', '가사를 0.5초 늦게')) : null,
      fsBtn
    );
    var rotate = h('div', { class: 'rotate-hint' }, '가로로 돌리면 더 크게 보여요');
    st.append(prog, h('div', { class: 'hud' }, hudL, hudR), rotate, rows, ctrl);
    attachGestures(rows);
    STAGE = { prog: prog.firstChild, hudR: hudR, slots: slots, playBtn: playBtn, offVal: offVal, fsBtn: fsBtn };
    updateFsBtn();
    updateStage();
    return st;
  }

  function fillSlot(el, i, off) {
    var p = S.parsed, n = S.groups.length;
    el.replaceChildren();
    el.className = 'slot';
    if (i < -1 || i >= n) {
      if (i === n && off > 0 && off <= 1) el.append(h('div', { class: 'txt endtxt' }, '— 끝 —'));
      return;
    }
    if (i === -1) {
      el.append(h('div', { class: 'txt intro' }, '♪'));
      return;
    }
    var grp = S.groups[i];
    el.classList.add(PCLS[p.lines[grp[0]].part]);
    if (grp.length > 1) el.classList.add('multi');
    // 묶음이면 원문 줄을 모두 먼저, 해석은 그 아래에 모아서 (영영 한한)
    grp.forEach(function (li, k) {
      var ln = p.lines[li], box = el;
      if (grp.length > 1) { box = h('div', { class: 'gl ' + PCLS[ln.part] }); el.append(box); }
      var prev = k > 0 ? p.lines[grp[k - 1]] : null;
      if (ln.singer && (ln.groupStart || (off === 0 && k === 0) || (prev && prev.singer !== ln.singer)))
        box.append(h('div', { class: 'who' }, ln.singer));
      box.append(txtEl(ln.text));
      if (grp.length === 1 && S.set.showKo && ln.ko) box.append(h('div', { class: 'ko' }, ln.ko));
    });
    if (grp.length > 1 && S.set.showKo) {
      grp.forEach(function (li) {
        var ln = p.lines[li];
        if (ln.ko) el.append(h('div', { class: 'gl gk ' + PCLS[ln.part] }, h('div', { class: 'ko' }, ln.ko)));
      });
    }
  }

  function updateStage() {
    if (!STAGE) return;
    STAGE.slots.forEach(function (el) {
      var off = Number(el.dataset.off);
      fillSlot(el, PB.idx + off, off);
    });
    STAGE.playBtn.textContent = PB.playing ? '⏸' : '▶';
    var r = cur();
    STAGE.offVal.textContent = signed((r && r.offset) || 0) + '초';
    updateHud();
  }
  function updateHud() {
    if (!STAGE) return;
    PB.hudAt = performance.now();
    var n = S.groups.length;
    STAGE.prog.style.width = (n ? ((PB.idx + 1) / n) * 100 : 0) + '%';
    var msg = '';
    if (S.times) {
      if (!PB.playing && PB.idx < 0 && PB.aSong === 0) msg = 'MR 시작과 동시에 ▶';
      else if (!PB.playing) msg = '일시정지';
      else if (PB.idx < n - 1) {
        var rem = gT(PB.idx + 1) - S.set.lead - songNow();
        if (rem > 3) msg = '다음 줄 ' + Math.ceil(rem) + '초';
      }
    }
    STAGE.hudR.textContent = msg;
  }

  function attachGestures(el) {
    var sx = 0, sy = 0, st = 0, id = null;
    el.addEventListener('pointerdown', function (e) {
      id = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); wakeOn();
    });
    el.addEventListener('pointerup', function (e) {
      if (e.pointerId !== id) return;
      id = null;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 14 && Math.abs(dy) < 14 && performance.now() - st < 700) step(1);
    });
    el.addEventListener('pointercancel', function () { id = null; });
  }

  async function toggleFs() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (S.set.mode === 'table' && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(function () {});
      }
    } catch (e) { toast('이 브라우저에선 전체 화면을 쓸 수 없어요'); }
  }
  function updateFsBtn() {
    var on = !!document.fullscreenElement;
    document.body.classList.toggle('is-fs', on);
    if (!STAGE || !STAGE.fsBtn) return;
    STAGE.fsBtn.textContent = on ? '✕ 전체 화면 끝' : '⛶';
    STAGE.fsBtn.title = on ? '전체 화면 해제' : '전체 화면';
    STAGE.fsBtn.setAttribute('aria-label', STAGE.fsBtn.title);
    STAGE.fsBtn.classList.toggle('on', on);
  }
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch (e) {}
    }
    updateFsBtn();
  });

  document.addEventListener('keydown', function (e) {
    if (SHEET) { if (SHEET.onKey) SHEET.onKey(e); return; }
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape' && drawerOpen) { closeDrawer(); return; }
    if (S.set.mode === 'hand' || !STAGE) return;
    var k = e.key;
    if (k === ' ' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); step(-1); }
    else if (k === 'Enter' || k === 'p' || k === 'P') { e.preventDefault(); PB.playing ? pause() : play(); }
    else if (k === 'Home') { e.preventDefault(); restart(); }
    else if (k === '-' ) nudgeOffset(-0.5);
    else if (k === '+' || k === '=') nudgeOffset(0.5);
    else if (k === 'f' || k === 'F') toggleFs();
  });

  // ---------------------------------------------------------------- 뒤로 가기(안드로이드) 처리
  var ovDepth = 0;
  function pushOv() { try { history.pushState({ lv: ++ovDepth }, ''); } catch (e) { /* 무시 */ } }
  function popOv() { if (ovDepth > 0) { ovDepth--; try { history.back(); } catch (e) { /* 무시 */ } } }
  window.addEventListener('popstate', function () {
    if (ovDepth > 0) ovDepth--;
    if (SHEET) {
      if (SHEET.beforeClose && SHEET.beforeClose() === false) { pushOv(); return; }
      closeSheet(true, true);
    } else if (drawerOpen) closeDrawer(true);
  });

  // ---------------------------------------------------------------- 메뉴(서랍)
  var drawerOpen = false;
  function openDrawer() {
    if (!drawerOpen) drawerView = 'main';
    buildDrawer();
    $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    if (!drawerOpen) { drawerOpen = true; pushOv(); }
    var c = $('#drawer .song.cur'); if (c) c.scrollIntoView({ block: 'center' });
  }
  function closeDrawer(fromPop) {
    if (!drawerOpen) return;
    drawerOpen = false;
    $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
    if (!fromPop) popOv();
  }

  function toggleRow(label, on, fn) {
    return h('button', { class: 'row-toggle', type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: fn },
      h('span', null, label), h('span', { class: 'sw' }));
  }
  function setGroup(v) {
    S.set.group = Math.max(0, Math.min(3, round(v, 1))); saveSet();
    var line = PB.idx >= 0 && S.groups[PB.idx] ? S.groups[PB.idx][0] : -1;
    S.groups = makeGroups();
    if (line >= 0) PB.idx = S.groups.findIndex(function (g) { return g.indexOf(line) >= 0; });
    buildDrawer(); render();
  }
  function stepper(label, val, minus, plus) {
    return h('div', { class: 'row-step' }, h('span', null, label),
      h('span', { class: 'stepper' }, btn('−', minus, 'small'), h('b', null, val), btn('+', plus, 'small')));
  }

  var drawerView = 'main', songQuery = '';
  function songButton(s, r, withFolder) {
    var badges = [];
    if (s.timing) badges.push(h('span', { class: 'bd', title: '타이밍 있음' }, '⏱'));
    if (hasText(s) && /[가-힣]/.test(s.raw) && /[A-Za-z]/.test(s.raw)) badges.push(h('span', { class: 'bd', title: '해석 있음' }, '해'));
    return h('button', {
      class: 'song' + (hasText(s) ? '' : ' blank') + (r && s.id === r.id ? ' cur' : '') + (withFolder ? ' flat' : ''), type: 'button',
      onclick: function () { selectSong(s.id); }
    }, h('span', { class: 'nm' }, withFolder ? h('small', { class: 'muted' }, showName(s.folder) + ' · ') : null, s.file), badges);
  }
  function fillSongList(box) {
    var r = cur();
    var q = songQuery.trim().toLowerCase();
    box.replaceChildren();
    if (q) {
      var hits = sortedSongs().filter(function (s) { return (s.file + ' ' + showName(s.folder)).toLowerCase().indexOf(q) >= 0; });
      if (!hits.length) box.append(h('p', { class: 'muted small' }, '찾는 곡이 없어요.'));
      hits.slice(0, 80).forEach(function (s) { box.append(songButton(s, r, true)); });
      return;
    }
    var groups = {};
    sortedSongs().forEach(function (s) { (groups[s.folder] = groups[s.folder] || []).push(s); });
    var folders = Object.keys(groups).sort(natCmp);
    if (!folders.length) box.append(h('p', { class: 'muted small' }, '아직 곡이 없어요. 🛠 편집·관리에서 가사를 불러오세요.'));
    folders.forEach(function (f) {
      var songs = groups[f];
      var det = h('details', { class: 'folder', open: (r && r.folder === f) || folders.length === 1 },
        h('summary', null, h('span', null, showName(f)), h('span', { class: 'cnt' }, songs.filter(hasText).length + '/' + songs.length)));
      songs.forEach(function (s) { det.append(songButton(s, r, false)); });
      box.append(det);
    });
  }

  function buildDrawer() {
    if (drawerView === 'edit') { buildEditDrawer(); return; }
    var d = $('#drawer');
    var sc = S.set.scale[S.set.mode];
    var modeName = MODES.filter(function (m) { return m[0] === S.set.mode; })[0][1];
    var setSec = h('div', { class: 'dsec qset' },
      h('div', { class: 'qrow' },
        h('button', { type: 'button', class: 'qchip', 'aria-pressed': S.set.showKo ? 'true' : 'false',
          onclick: function () { S.set.showKo = !S.set.showKo; saveSet(); buildDrawer(); render(); } }, '한글 해석'),
        h('button', { type: 'button', class: 'qchip', 'aria-pressed': S.set.wake ? 'true' : 'false',
          title: 'wakeLock' in navigator ? '' : '이 브라우저는 지원 안 됨',
          onclick: function () { S.set.wake = !S.set.wake; saveSet(); if (S.set.wake) wakeOn(); else wakeOff(); buildDrawer(); } },
          '화면 꺼짐 방지' + ('wakeLock' in navigator ? '' : ' ✕'))),
      stepper('글씨 크기 · ' + modeName, Math.round(sc * 100) + '%',
        function () { S.set.scale[S.set.mode] = Math.max(0.6, round(sc - 0.1, 1)); saveSet(); buildDrawer(); render(); },
        function () { S.set.scale[S.set.mode] = Math.min(2.5, round(sc + 0.1, 1)); saveSet(); buildDrawer(); render(); }),
      stepper('미리 넘김', S.set.lead.toFixed(1) + '초',
        function () { S.set.lead = Math.max(0, round(S.set.lead - 0.1, 1)); saveSet(); buildDrawer(); },
        function () { S.set.lead = Math.min(3, round(S.set.lead + 0.1, 1)); saveSet(); buildDrawer(); }),
      stepper('짧은 줄 묶기', S.set.group > 0 ? S.set.group.toFixed(1) + '초 안' : '끔',
        function () { setGroup(S.set.group - 0.1); },
        function () { setGroup(S.set.group + 0.1); }));

    var listBox = h('div', { class: 'songlist' });
    var search = h('input', { class: 'inp search', type: 'search', placeholder: '🔍 곡 찾기', value: songQuery });
    search.addEventListener('input', function () { songQuery = search.value; fillSongList(listBox); });
    fillSongList(listBox);
    var listSec = h('div', { class: 'dsec' }, search, listBox);

    var updBox = hasUpdate() ? h('div', { class: 'dsec' },
      btn('⬇ 새 가사 버전 받기 (' + UPD.remote.version + ')', startUpdate, 'wide primary')) : null;
    var verLine = h('div', { class: 'dfoot muted small' },
      '가사 버전 ' + (S.dataVersion || '없음') + ' · 앱 ' + APP_VERSION);
    d.replaceChildren(
      h('div', { class: 'dhead' }, h('b', null, '메뉴'),
        h('span', { class: 'dhead-r' },
          btn('🛠 편집·관리', function () { drawerView = 'edit'; buildDrawer(); $('#drawer').scrollTop = 0; }, 'small'),
          btn('✕', function () { closeDrawer(); }, 'ghost', '닫기'))),
      updBox, setSec, listSec, verLine);
    if (!UPD.tried) checkUpdate(false);
  }

  function buildEditDrawer() {
    var d = $('#drawer');
    var r = cur();
    var songSec = r ? h('div', { class: 'dsec' }, h('h3', null, '이 곡: ' + r.file),
      btn('✏️ 가사 편집', function () { openEditor(r.id); }, 'wide'),
      S.parsed && S.parsed.mode !== 'none' ? btn('🔗 해석 짝 맞추기', openPair, 'wide') : null,
      btn('⏱ 타이밍 녹음 · 보정', openRecord, 'wide')) : null;

    var dataSec = h('div', { class: 'dsec' }, h('h3', null, '가사 데이터'),
      'showDirectoryPicker' in window ? btn(S.dir ? '📁 다른 가사 폴더 열기' : '📁 가사 폴더 열기 (PC)', pickFolder, 'wide') : null,
      S.dir ? btn('🔄 폴더 다시 읽기 (' + S.dir.name + ')', function () { readFolder(); }, 'wide') : null,
      btn('📂 가사 폴더 불러오기 (읽기만)', function () { $('#dirInput').click(); }, 'wide'),
      btn('📦 묶음 파일 가져오기', function () { $('#bundleInput').click(); }, 'wide'),
      btn('💾 묶음 파일 내보내기 (폰으로 옮기기)', exportBundle, 'wide'),
      btn('➕ 새 곡 붙여넣기', function () { openEditor(null); }, 'wide'),
      btn('⬇ 가사 버전 업데이트 확인' + (S.dataVersion ? ' (지금 ' + S.dataVersion + ')' : ''), function () {
        if (hasUpdate()) startUpdate(); else checkUpdate(true);
      }, 'wide'));

    var unknownN = collectUnknown().filter(function (n) { return !S.overrides[n]; }).length;
    var castSec = h('div', { class: 'dsec' }, h('h3', null, '배역'),
      btn('🎭 배역 성별 지정' + (unknownN ? ' (미지정 ' + unknownN + ')' : ''), openCast, 'wide'));

    var foot = h('div', { class: 'dfoot muted small' }, '버전 ' + APP_VERSION + ' · 가사는 이 기기에만 저장돼요');
    d.replaceChildren(
      h('div', { class: 'dhead' },
        btn('← 메뉴', function () { drawerView = 'main'; buildDrawer(); }, 'ghost'),
        h('b', null, '편집·관리'),
        btn('✕', function () { closeDrawer(); }, 'ghost', '닫기')),
      songSec, dataSec, castSec, foot);
  }

  // ---------------------------------------------------------------- 전체 화면 패널(시트)
  var SHEET = null;
  function openSheet(title, body, o) {
    o = o || {};
    var sh = $('#sheet');
    sh.replaceChildren(
      h('div', { class: 'sheethead' },
        btn('← 닫기', function () { closeSheet(); }, 'ghost'),
        h('h2', null, title),
        h('div', { class: 'acts' }, o.actions || [])),
      h('div', { class: 'sheetbody' }, body));
    sh.hidden = false; sh.scrollTop = 0;
    document.body.classList.add('sheet-open');
    if (drawerOpen) { drawerOpen = false; $('#drawer').classList.remove('open'); $('#scrim').hidden = true; }
    else pushOv();
    SHEET = o;
  }
  function closeSheet(force, fromPop) {
    if (!SHEET) return;
    if (!force && SHEET.beforeClose && SHEET.beforeClose() === false) return;
    var o = SHEET; SHEET = null;
    if (o.onClose) o.onClose();
    $('#sheet').hidden = true; $('#sheet').replaceChildren();
    document.body.classList.remove('sheet-open');
    if (!fromPop) popOv();
    reparse(); render();
  }

  // ---------------------------------------------------------------- 가사 편집
  function lineMini(ln) {
    var el = h('div', { class: 'mini ' + PCLS[ln.part] });
    if (ln.groupStart && ln.singer) el.append(h('span', { class: 'who' }, ln.singer));
    el.append(h('span', null, ln.text));
    if (ln.ko) el.append(h('div', { class: 'ko' }, ln.ko));
    return el;
  }
  function summary(p, r) {
    var chips = [h('span', { class: 'chip' }, p.lines.length + '줄')];
    chips.push(h('span', { class: 'chip' }, p.koreanSong ? '한국어 곡' :
      p.mode === 'none' ? '해석 없음' : p.mode === 'interleaved' ? '해석: 줄마다' : '해석: 통째로 → 자동 짝'));
    if (p.flags.length) chips.push(h('span', { class: 'chip warn' }, '짝 확인 필요 ' + p.flags.length + '줄'));
    if (p.unknown.length) chips.push(h('span', { class: 'chip warn' }, '모르는 배역: ' + p.unknown.join(', ')));
    if (r && r.timing && r.timing.lineCount !== p.lines.length) {
      chips.push(h('span', { class: 'chip warn' }, '타이밍 줄 수 다름 (' + r.timing.lineCount + '→' + p.lines.length + ')'));
    }
    return chips;
  }

  function openEditor(id) {
    var r = id ? S.songs.get(id) : null;
    var folders = Array.from(new Set(sortedSongs().map(function (s) { return s.folder; }))).sort(natCmp);
    var c = cur();
    var fFolder = h('input', { class: 'inp', list: 'folderList', value: r ? r.folder : (c ? c.folder : ''), placeholder: '예: 01_Epic' });
    var dl = h('datalist', { id: 'folderList' }, folders.map(function (f) { return h('option', { value: f }); }));
    var fFile = h('input', { class: 'inp', value: r ? r.file : '', placeholder: '예: 07. Survive' });
    var ta = h('textarea', {
      class: 'ta', spellcheck: 'false', value: r ? r.raw : '',
      placeholder: '가사 사이트에서 복사한 그대로 붙여넣으세요.\n· 배역 표시(ODYSSEUS:, [Penelope] 등)도 함께\n· 한글 해석은 원문 줄 아래마다, 또는 원문 전체 뒤에 통째로\n· 직접 파트 지정: [남] [여] [공] 줄을 넣으면 그 아래부터 적용'
    });
    var info = h('div', { class: 'chips' });
    var prev = h('div', { class: 'preview' });
    var dirty = false;
    var upd = function () {
      var p = LP.parseSong(ta.value, { overrides: S.overrides });
      info.replaceChildren.apply(info, summary(p, r));
      var groups = [], lastSt = null;
      p.lines.slice(0, 600).forEach(function (ln) {
        if (lastSt !== null && ln.stanza !== lastSt) groups.push(h('div', { class: 'gap small' }));
        lastSt = ln.stanza;
        groups.push(lineMini(ln));
      });
      prev.replaceChildren.apply(prev, groups);
    };
    ta.addEventListener('input', function () { dirty = true; });
    ta.addEventListener('input', debounce(upd, 250));
    upd();

    async function save() {
      var folder = fFolder.value.trim(), file = fFile.value.trim();
      if (!folder || !file) { toast('폴더와 파일 이름을 적어 주세요'); return; }
      if (BAD_NAME.test(folder) || BAD_NAME.test(file)) { toast('이름에 \\ / : * ? " < > | 는 쓸 수 없어요'); return; }
      var nid = folder + '/' + file;
      var base = S.songs.get(nid) || r || {};
      var rec = Object.assign({}, base, {
        id: nid, folder: folder, file: file, raw: ta.value,
        src: base.src || 'app', updated: Date.now(),
        offset: base.offset || 0, counts: base.counts || null, timing: base.timing || null
      });
      if (r && r.id !== nid) { S.songs.delete(r.id); await DB.del('songs', r.id); }
      await saveSong(rec);
      var wrote = false;
      if (S.dir && rec.src === 'folder') wrote = await writeFile(folder, file + '.txt', ta.value);
      else if (S.dir && !r) { wrote = await writeFile(folder, file + '.txt', ta.value); if (wrote) { rec.src = 'folder'; await saveSong(rec); } }
      persistStorage();
      dirty = false;
      S.curId = nid; lsSet('lv.last', nid);
      stopPlayback();
      closeSheet(true);
      toast(wrote ? '저장했어요 (폴더에도 저장됨)' : '저장했어요');
    }
    async function remove() {
      if (!r) return;
      if (!confirm('"' + r.file + '"을(를) 앱에서 지울까요?\n(PC 폴더의 txt 파일은 지우지 않아요)')) return;
      S.songs.delete(r.id); await DB.del('songs', r.id);
      if (S.curId === r.id) S.curId = null;
      closeSheet(true); toast('앱에서 지웠어요');
    }

    var body = h('div', { class: 'editor' },
      h('div', { class: 'grid2' },
        h('label', null, h('span', null, '폴더'), fFolder, dl),
        h('label', null, h('span', null, '파일 이름'), fFile)),
      h('div', { class: 'edcols' },
        h('div', { class: 'edcol' }, h('div', { class: 'lbl' }, '가사 원문'), ta),
        h('div', { class: 'edcol' }, h('div', { class: 'lbl' }, '미리보기'), info, prev)),
      r ? h('div', { class: 'danger' }, btn('앱에서 이 곡 지우기', remove, 'small ghost')) : null);
    openSheet(r ? '가사 편집' : '새 곡', body, {
      actions: [btn('저장', save, 'primary')],
      beforeClose: function () { return !dirty || confirm('저장하지 않고 닫을까요?'); },
      onKey: function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }
    });
  }

  // ---------------------------------------------------------------- 해석 짝 맞추기
  function openPair() {
    var r = cur(); if (!r) return;
    var base = LP.parseSong(r.raw, { overrides: S.overrides });
    if (base.mode === 'none') { toast('해석이 없는 곡이에요'); return; }
    var L = base.lines.length, K = base.koLines.length;
    var counts = LP.validCounts(r.counts, L, K) ? r.counts.slice() : base.autoCounts.slice();
    var flags = {}; base.flags.forEach(function (i) { flags[i] = true; });
    var dirty = false;
    var list = h('div', { class: 'pairlist' });
    var head = h('p', { class: 'muted small' },
      '원문 ' + L + '줄 · 해석 ' + K + '줄. 노란 줄은 자동 짝이 불확실한 곳이에요. ',
      '▲ 당기기: 아래 줄의 해석 하나를 이 줄로 · ▼ 밀기: 이 줄의 마지막 해석을 아래 줄로');

    function take(i) {
      for (var j = i + 1; j < L; j++) { if (counts[j] > 0) { counts[j]--; counts[i]++; dirty = true; draw(); return; } }
    }
    function send(i) {
      if (i >= L - 1 || counts[i] <= 0) return;
      counts[i]--; counts[i + 1]++; dirty = true; draw();
    }
    function draw() {
      var off = 0, rows = [];
      base.lines.forEach(function (ln, i) {
        var c = counts[i];
        var ko = base.koLines.slice(off, off + c).join(' / ');
        off += c;
        rows.push(h('div', { class: 'prow' + (flags[i] ? ' flag' : '') + (c === 0 ? ' none' : '') },
          h('div', { class: 'pn' }, String(i + 1)),
          h('div', { class: 'pt' },
            h('div', { class: 'o ' + PCLS[ln.part] }, ln.text),
            h('div', { class: 'k' }, ko || '— 해석 없음 —')),
          h('div', { class: 'pb' },
            btn('▲ 당기기', function () { take(i); }, 'small'),
            btn('▼ 밀기', function () { send(i); }, 'small'))));
      });
      list.replaceChildren.apply(list, rows);
    }
    draw();
    async function save() {
      r.counts = counts.slice(); await saveSong(r);
      var wrote = S.dir && r.src === 'folder' ? await writeFile(r.folder, r.file + '.pair.json', JSON.stringify({ version: 1, counts: r.counts })) : false;
      dirty = false; closeSheet(true);
      toast(wrote ? '짝을 저장했어요 (폴더에도 저장됨)' : '짝을 저장했어요');
    }
    function reset() {
      counts = base.autoCounts.slice(); dirty = true; draw(); toast('자동 짝으로 되돌렸어요 (저장해야 적용)');
    }
    openSheet('해석 짝 맞추기', h('div', null, head, list), {
      actions: [btn('자동으로', reset, 'ghost'), btn('저장', save, 'primary')],
      beforeClose: function () { return !dirty || confirm('저장하지 않고 닫을까요?'); }
    });
  }

  // ---------------------------------------------------------------- 타이밍 녹음·보정
  function openRecord() {
    var r = cur(); if (!r) return;
    var p = LP.parseSong(r.raw, { counts: r.counts, overrides: S.overrides });
    var L = p.lines.length;
    if (!L) { toast('가사가 비어 있어요'); return; }
    var R = {
      times: (r.timing && Array.isArray(r.timing.times) ? r.timing.times.slice(0, L) : []),
      next: 0, audio: null, url: null, swAcc: 0, swStart: 0, running: false, dirty: false, timer: 0
    };
    while (R.times.length < L) R.times.push(null);
    R.next = R.times.indexOf(null); if (R.next < 0) R.next = L;
    var mismatch = r.timing && r.timing.lineCount !== L;

    var audioEl = h('audio', { controls: true, preload: 'auto', class: 'raudio', hidden: true });
    var fileIn = h('input', { type: 'file', accept: 'audio/*', hidden: true });
    var srcLbl = h('span', { class: 'muted small' }, '스톱워치 사용 중 (유튜브 등 다른 곳에서 틀 때)');
    var rateSel = h('select', { class: 'inp sel', title: '재생 속도' },
      [1, 0.9, 0.8, 0.75, 0.6].map(function (x) { return h('option', { value: String(x) }, x === 1 ? '1배속' : x + '배속'); }));
    rateSel.addEventListener('change', function () { if (R.audio) R.audio.playbackRate = Number(rateSel.value); });
    fileIn.addEventListener('change', function () {
      var f = fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      if (R.url) URL.revokeObjectURL(R.url);
      R.url = URL.createObjectURL(f);
      audioEl.src = R.url; audioEl.hidden = false;
      audioEl.playbackRate = Number(rateSel.value);
      R.audio = audioEl; R.running = false; R.swAcc = 0;
      srcLbl.textContent = '파일: ' + f.name + ' (이 기기 안에서만 재생돼요)';
      draw();
    });
    audioEl.addEventListener('play', function () { draw(); });
    audioEl.addEventListener('pause', function () { draw(); });

    function clock() {
      if (R.audio) return R.audio.currentTime || 0;
      return R.swAcc + (R.running ? (performance.now() - R.swStart) / 1000 : 0);
    }
    function isRunning() { return R.audio ? !R.audio.paused : R.running; }
    function toggle() {
      if (R.audio) { if (R.audio.paused) R.audio.play(); else R.audio.pause(); return; }
      if (R.running) { R.swAcc = clock(); R.running = false; }
      else { R.swStart = performance.now(); R.running = true; }
      draw();
    }
    function mark() {
      if (R.next >= L) return;
      if (!isRunning()) { toggle(); }
      R.times[R.next] = round(clock(), 2);
      R.next++; R.dirty = true; draw(true);
    }
    function undo() {
      if (R.next <= 0) return;
      R.next--;
      var t = R.times[R.next];
      R.times[R.next] = null; R.dirty = true;
      if (R.audio && t !== null) R.audio.currentTime = Math.max(0, t - 3);
      draw(true);
    }
    function resetAll() {
      if (!confirm('찍은 타이밍을 모두 지우고 처음부터 할까요?')) return;
      R.times = R.times.map(function () { return null; });
      R.next = 0; R.swAcc = 0; R.running = false; R.dirty = true;
      if (R.audio) { R.audio.pause(); R.audio.currentTime = 0; }
      draw(true);
    }
    function setNext(i) {
      R.next = i;
      if (R.audio) {
        var prevT = null;
        for (var j = i - 1; j >= 0; j--) { if (R.times[j] !== null) { prevT = R.times[j]; break; } }
        R.audio.currentTime = Math.max(0, (prevT === null ? 0 : prevT) - 1);
      }
      draw(true);
    }
    function nudge(i, d) {
      if (R.times[i] === null) return;
      R.times[i] = Math.max(0, round(R.times[i] + d, 2)); R.dirty = true; draw();
    }
    function preview(i) {
      if (!R.audio || R.times[i] === null) { toast('미리 듣기는 MR/원곡 파일을 열었을 때만 돼요'); return; }
      R.audio.currentTime = Math.max(0, R.times[i] - 1.5); R.audio.play();
    }

    var clockEl = h('div', { class: 'clock' });
    var target = h('div', { class: 'rtarget' });
    var runBtn = btn('▶ 시작', toggle, '');
    var markBtn = btn('● 줄 시작 표시 (Space)', mark, 'primary big');
    var list = h('div', { class: 'rlist' });

    function draw(scroll) {
      runBtn.textContent = isRunning() ? '⏸ 일시정지' : '▶ 시작';
      target.replaceChildren();
      if (R.next < L) {
        var ln = p.lines[R.next];
        target.append(h('div', { class: 'muted small' }, (R.next + 1) + '/' + L + '번 줄 — 이 줄을 부르기 시작할 때 누르세요'),
          h('div', { class: 'tline ' + PCLS[ln.part] }, ln.singer ? h('span', { class: 'who' }, ln.singer + ' ') : null, ln.text));
        if (R.next + 1 < L) target.append(h('div', { class: 'tnext muted' }, '다음: ' + p.lines[R.next + 1].text));
      } else {
        target.append(h('div', { class: 'tline' }, '✔ 모든 줄을 찍었어요. 아래에서 보정하고 저장하세요.'));
      }
      var rows = p.lines.map(function (ln, i) {
        return h('div', { class: 'rrow' + (i === R.next ? ' cur' : '') + (R.times[i] === null ? ' none' : '') },
          h('button', { class: 'rt', type: 'button', title: '여기서부터 다시 찍기', onclick: function () { setNext(i); } }, fmtT(R.times[i])),
          h('div', { class: 'rx ' + PCLS[ln.part] }, ln.text),
          h('div', { class: 'rb' },
            btn('−0.1', function () { nudge(i, -0.1); }, 'small'),
            btn('+0.1', function () { nudge(i, 0.1); }, 'small'),
            btn('▶', function () { preview(i); }, 'small', '이 줄부터 듣기')));
      });
      list.replaceChildren.apply(list, rows);
      if (scroll) {
        var c = list.querySelector('.rrow.cur');
        if (c) c.scrollIntoView({ block: 'nearest' });
      }
    }
    R.timer = setInterval(function () { clockEl.textContent = fmtT(clock()); }, 100);
    draw();

    async function save() {
      r.timing = { lineCount: L, times: R.times.slice(), savedAt: Date.now() };
      await saveSong(r);
      var wrote = S.dir && r.src === 'folder' ? await writeFile(r.folder, r.file + '.timing.json',
        JSON.stringify({ version: 1, lineCount: L, times: r.timing.times, offset: r.offset || 0 })) : false;
      R.dirty = false; closeSheet(true);
      toast(wrote ? '타이밍을 저장했어요 (폴더에도 저장됨)' : '타이밍을 저장했어요');
    }

    var body = h('div', { class: 'record' },
      mismatch ? h('div', { class: 'notice' }, '가사 줄 수가 바뀌어서 기존 타이밍이 어긋날 수 있어요. 확인 후 다시 찍어 주세요.') : null,
      h('div', { class: 'rsrc' },
        btn('🎵 MR/원곡 파일 열기', function () { fileIn.click(); }), fileIn, rateSel, srcLbl),
      audioEl,
      h('p', { class: 'muted small' }, '유튜브로 들을 때: 유튜브에서 곡을 재생하는 순간 ▶ 시작을 누르고, 줄이 바뀔 때마다 Space(또는 ● 버튼). 틀리면 Backspace(↶)로 한 줄 되돌리기.'),
      h('div', { class: 'rpanel' }, clockEl, target,
        h('div', { class: 'rbtns' }, runBtn, markBtn, btn('↶ 되돌리기', undo, ''), btn('처음부터', resetAll, 'ghost'))),
      list);

    openSheet('타이밍 녹음 · 보정', body, {
      actions: [btn('저장', save, 'primary')],
      beforeClose: function () { return !R.dirty || confirm('저장하지 않고 닫을까요?'); },
      onClose: function () {
        clearInterval(R.timer);
        if (R.audio) R.audio.pause();
        if (R.url) URL.revokeObjectURL(R.url);
      },
      onKey: function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === ' ') { e.preventDefault(); mark(); }
        else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
        else if (e.key === 'p' || e.key === 'P' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      }
    });
  }

  // ---------------------------------------------------------------- 배역 성별
  function collectUnknown() {
    var set = {};
    S.songs.forEach(function (s) {
      if (!hasText(s)) return;
      LP.parseSong(s.raw, { overrides: {} }).unknown.forEach(function (n) { set[n] = true; });
    });
    Object.keys(S.overrides).forEach(function (n) { set[n] = true; });
    return Object.keys(set).sort(natCmp);
  }
  function openCast() {
    var names = collectUnknown();
    var list = h('div', { class: 'castlist' });
    function draw() {
      list.replaceChildren.apply(list, names.length ? names.map(function (n) {
        var curP = S.overrides[n] || '';
        return h('div', { class: 'castrow' }, h('span', { class: 'cn ' + (curP ? PCLS[curP] : '') }, n),
          h('span', { class: 'seg' }, ['공', '남', '여'].map(function (pp) {
            return h('button', {
              type: 'button', class: 'segb ' + PCLS[pp], 'aria-pressed': curP === pp ? 'true' : 'false',
              onclick: async function () {
                if (S.overrides[n] === pp) delete S.overrides[n]; else S.overrides[n] = pp;
                await DB.put('meta', S.overrides, 'overrides'); draw();
                if (S.dir) await writeRootFile(CAST_FILE, JSON.stringify(S.overrides, null, 1));
              }
            }, pp);
          })));
      }) : [h('p', { class: 'muted' }, '기본 배역표에 없는 이름이 아직 없어요.')]);
    }
    draw();
    openSheet('배역 성별 지정', h('div', null,
      h('p', { class: 'muted small' }, '가사에 나온 배역 중 기본표에 없는 이름이에요. 고르지 않으면 공용 색으로 보여요.'), list));
  }

  // ---------------------------------------------------------------- 폴더 (PC: File System Access)
  async function ensurePerm(write) {
    if (!S.dir) return false;
    var opts = { mode: write ? 'readwrite' : 'read' };
    try {
      if ((await S.dir.queryPermission(opts)) === 'granted') return true;
      return (await S.dir.requestPermission(opts)) === 'granted';
    } catch (e) { return false; }
  }
  async function writeFile(folder, name, text) {
    try {
      if (!(await ensurePerm(true))) return false;
      var d = await S.dir.getDirectoryHandle(folder, { create: true });
      var f = await d.getFileHandle(name, { create: true });
      var w = await f.createWritable();
      await w.write(text); await w.close();
      return true;
    } catch (e) { toast('폴더에 저장하지 못했어요: ' + e.message); return false; }
  }
  async function writeRootFile(name, text) {
    try {
      if (!(await ensurePerm(true))) return false;
      var f = await S.dir.getFileHandle(name, { create: true });
      var w = await f.createWritable();
      await w.write(text); await w.close();
      return true;
    } catch (e) { toast('폴더에 저장하지 못했어요: ' + e.message); return false; }
  }
  async function pickFolder() {
    try {
      var d = await window.showDirectoryPicker({ id: 'lyrics', mode: 'readwrite' });
      S.dir = d; await DB.put('meta', d, 'dir');
      await readFolder();
    } catch (e) {
      toast(e.name === 'AbortError' ? '폴더를 고르지 않았어요. 창이 안 뜨면 📂 가사 폴더 불러오기를 써 보세요.'
        : '폴더를 열 수 없어요: ' + e.message + ' — 📂 가사 폴더 불러오기를 써 보세요.', 5000);
    }
  }
  async function readJson(fh) { return JSON.parse(await (await fh.getFile()).text()); }
  async function readFolder() {
    if (!(await ensurePerm(false))) { toast('폴더 접근 권한이 필요해요'); return; }
    var found = new Map();
    try {
      for await (var entry of S.dir.entries()) {
        var fname = entry[0], fh = entry[1];
        if (fh.kind !== 'directory' || fname.charAt(0) === '.' || fname.charAt(0) === '_') continue;
        var files = {};
        for await (var e2 of fh.entries()) {
          var n = e2[0], h2 = e2[1], m;
          if (h2.kind !== 'file') continue;
          if ((m = n.match(/^(.*)\.timing\.json$/i))) (files[m[1]] = files[m[1]] || {}).timing = h2;
          else if ((m = n.match(/^(.*)\.pair\.json$/i))) (files[m[1]] = files[m[1]] || {}).pair = h2;
          else if ((m = n.match(/^(.*)\.txt$/i))) (files[m[1]] = files[m[1]] || {}).txt = h2;
        }
        for (var baseName in files) {
          var f = files[baseName];
          if (!f.txt) continue;
          var id = fname + '/' + baseName;
          var old = S.songs.get(id) || {};
          var raw = await (await f.txt.getFile()).text();
          var timing = old.timing || null, counts = old.counts || null, offset = old.offset || 0;
          if (f.timing) { try { var tj = sanitizeTiming(await readJson(f.timing)); if (tj) { timing = tj; if (typeof tj.offset === 'number') offset = tj.offset; } } catch (er) { /* 무시 */ } }
          if (f.pair) { try { var pj = await readJson(f.pair); if (sanitizeCounts(pj.counts)) counts = sanitizeCounts(pj.counts); } catch (er) { /* 무시 */ } }
          found.set(id, { id: id, folder: fname, file: baseName, raw: raw, counts: counts, timing: timing, offset: offset, src: 'folder', updated: Date.now() });
        }
      }
    } catch (e) { toast('폴더를 읽다가 문제가 생겼어요: ' + e.message); return; }
    try {
      var castFh = await S.dir.getFileHandle(CAST_FILE);
      mergeOverrides(await readJson(castFh));
      await DB.put('meta', S.overrides, 'overrides');
    } catch (e) { /* 배역 파일 없음 */ }
    var removed = [];
    S.songs.forEach(function (r, id) { if (r.src === 'folder' && !found.has(id)) removed.push(id); });
    for (var i = 0; i < removed.length; i++) { S.songs.delete(removed[i]); await DB.del('songs', removed[i]); }
    var vals = Array.from(found.values());
    for (var k = 0; k < vals.length; k++) await saveSong(vals[k]);
    persistStorage();
    var filled = vals.filter(hasText).length;
    toast(found.size + '곡을 읽었어요 (가사 있는 곡 ' + filled + ')');
    if (!S.songs.has(S.curId)) pickDefault();
    reparse(); render();
    if (drawerOpen) buildDrawer();
  }

  // ---------------------------------------------------------------- 묶음 파일 (폰으로 옮기기)
  function sanitizeCounts(c) {
    if (!Array.isArray(c) || c.length > 5000) return null;
    return c.every(function (x) { return Number.isInteger(x) && x >= 0 && x < 1000; }) ? c.slice() : null;
  }
  function sanitizeTiming(t) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.times) || t.times.length > 5000) return null;
    var times = t.times.map(function (x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x < 36000 ? x : null; });
    var out = { lineCount: Number.isInteger(t.lineCount) ? t.lineCount : times.length, times: times };
    if (typeof t.offset === 'number' && isFinite(t.offset)) out.offset = Math.max(-120, Math.min(120, t.offset));
    if (Array.isArray(t.ends) && t.ends.length === times.length)
      out.ends = t.ends.map(function (x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x < 36000 ? x : null; });
    return out;
  }
  function sanitizeSong(s) {
    if (!s || typeof s !== 'object') return null;
    var folder = typeof s.folder === 'string' ? s.folder.trim().slice(0, 120) : '';
    var file = typeof s.file === 'string' ? s.file.trim().slice(0, 200) : '';
    if (!folder || !file || BAD_NAME.test(folder) || BAD_NAME.test(file)) return null;
    var raw = typeof s.raw === 'string' ? s.raw.slice(0, 300000) : '';
    var offset = typeof s.offset === 'number' && isFinite(s.offset) ? Math.max(-120, Math.min(120, s.offset)) : 0;
    return {
      id: folder + '/' + file, folder: folder, file: file, raw: raw,
      counts: sanitizeCounts(s.counts), timing: sanitizeTiming(s.timing), offset: offset,
      src: 'bundle', updated: Date.now()
    };
  }
  function mergeOverrides(o) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).slice(0, 2000).forEach(function (k) {
      var v = o[k];
      if ((v === '공' || v === '남' || v === '여') && k.length <= 80) S.overrides[k] = v;
    });
  }
  // opts.release: PC에서 빌드한 '가사 버전'으로 교체 (폰에서 조정한 ±오프셋은 타이밍이 같으면 유지)
  async function importBundle(data, opts) {
    opts = opts || {};
    if (!data || data.format !== 'musical-lyrics-bundle' || !Array.isArray(data.songs)) {
      toast('가사 묶음 파일이 아니에요'); return 0;
    }
    var n = 0, seen = {};
    for (var i = 0; i < data.songs.length && i < 5000; i++) {
      var rec = sanitizeSong(data.songs[i]);
      if (!rec) continue;
      var old = S.songs.get(rec.id);
      if (opts.release) {
        rec.src = 'release';
        if (old && old.timing && rec.timing && JSON.stringify(old.timing.times) === JSON.stringify(rec.timing.times)) rec.offset = old.offset || 0;
      }
      if (old && old.src === 'folder') rec.src = 'folder';
      seen[rec.id] = true;
      await saveSong(rec); n++;
    }
    if (opts.release) {
      var gone = [];
      S.songs.forEach(function (r, id) { if (r.src === 'release' && !seen[id]) gone.push(id); });
      for (var g = 0; g < gone.length; g++) { S.songs.delete(gone[g]); await DB.del('songs', gone[g]); }
    }
    if (data.overrides && typeof data.overrides === 'object') {
      mergeOverrides(data.overrides);
      await DB.put('meta', S.overrides, 'overrides');
    }
    persistStorage();
    if (!S.songs.has(S.curId)) pickDefault();
    reparse(); render();
    if (drawerOpen) buildDrawer();
    if (!opts.quiet) toast(n + '곡을 가져왔어요');
    return n;
  }

  // ---------------------------------------------------------------- 가사 버전 업데이트 (암호화된 data/lyrics.json)
  var CAST_FILE = '배역지정.json';
  var UPD = { remote: null, checking: false, tried: false };
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  async function checkUpdate(manual) {
    if (!/^https?:$/.test(location.protocol) || UPD.checking) return;
    UPD.checking = true; UPD.tried = true;
    try {
      var res = await fetch('data/version.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 404 ? '아직 올라온 가사 버전이 없어요' : 'HTTP ' + res.status);
      var v = await res.json();
      if (!v || typeof v.version !== 'string') throw new Error('버전 정보가 이상해요');
      UPD.remote = v;
      if (manual) toast(v.version === S.dataVersion ? '이미 최신 가사 버전이에요 (' + v.version + ')' : '새 가사 버전: ' + v.version);
    } catch (e) {
      if (manual) toast('업데이트 확인 실패: ' + (navigator.onLine ? e.message : '인터넷 연결 없음'));
    } finally {
      UPD.checking = false;
      if (drawerOpen) buildDrawer();
    }
  }
  function hasUpdate() { return !!(UPD.remote && UPD.remote.version !== S.dataVersion); }

  async function decryptRelease(pkg, pass) {
    var enc = new TextEncoder();
    var baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(pkg.kdf.salt), iterations: pkg.kdf.iterations, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(pkg.iv) }, key, b64(pkg.data));
    var stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  async function applyUpdate(pass, remember) {
    var res = await fetch('data/lyrics.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('가사 파일을 받지 못했어요 (HTTP ' + res.status + ')');
    var pkg = await res.json();
    if (!pkg || pkg.format !== 'musical-lyrics-enc' || !pkg.kdf || !pkg.iv || !pkg.data) throw new Error('가사 파일 형식이 이상해요');
    var data;
    try { data = await decryptRelease(pkg, pass); }
    catch (e) { var er = new Error('암호가 맞지 않아요'); er.badPass = true; throw er; }
    var n = await importBundle(data, { release: true, quiet: true });
    S.dataVersion = pkg.version;
    await DB.put('meta', pkg.version, 'dataVersion');
    if (remember) await DB.put('meta', pass, 'pass'); else await DB.del('meta', 'pass');
    toast('가사 버전 ' + pkg.version + ' 적용 (' + n + '곡)', 4000);
  }

  async function startUpdate() {
    var saved = null;
    try { saved = await DB.get('meta', 'pass'); } catch (e) { /* 무시 */ }
    if (saved) {
      try { toast('받는 중…', 8000); await applyUpdate(saved, true); return; }
      catch (e) { if (!e.badPass) { toast(e.message); return; } }
    }
    var inp = h('input', { class: 'inp', type: 'password', autocomplete: 'off', placeholder: '가사 암호' });
    var rem = h('input', { type: 'checkbox', checked: true });
    var msg = h('p', { class: 'muted small' });
    async function go() {
      if (!inp.value) { msg.textContent = '암호를 입력해 주세요.'; return; }
      msg.textContent = '받는 중…';
      try { await applyUpdate(inp.value, rem.checked); closeSheet(true); }
      catch (e) { msg.textContent = e.message; }
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    openSheet('가사 업데이트', h('div', { class: 'pwbox' },
      h('p', null, '새 가사 버전 ' + (UPD.remote ? UPD.remote.version : '') + '을(를) 받아요. PC에서 빌드할 때 정한 암호를 입력해 주세요.'),
      inp,
      h('label', { class: 'chk' }, rem, ' 이 기기에서 암호 기억하기'),
      msg,
      btn('받기', go, 'primary')), {});
    setTimeout(function () { inp.focus(); }, 50);
  }
  // 폴더 선택 창(webkitdirectory) — 쓰기는 못 하지만 대부분 브라우저에서 동작
  $('#dirInput').addEventListener('change', async function (e) {
    var list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    var groups = {};
    list.forEach(function (f) {
      var parts = (f.webkitRelativePath || f.name).split('/');
      if (parts.length < 2) return;
      var folder = parts[parts.length - 2], name = parts[parts.length - 1], m;
      if (folder.charAt(0) === '.' || folder.charAt(0) === '_' || parts.length < 3) return;
      var g = groups[folder] = groups[folder] || {};
      if ((m = name.match(/^(.*)\.timing\.json$/i))) (g[m[1]] = g[m[1]] || {}).timing = f;
      else if ((m = name.match(/^(.*)\.pair\.json$/i))) (g[m[1]] = g[m[1]] || {}).pair = f;
      else if ((m = name.match(/^(.*)\.txt$/i))) (g[m[1]] = g[m[1]] || {}).txt = f;
    });
    var songs = [];
    for (var folder in groups) {
      for (var base in groups[folder]) {
        var f = groups[folder][base];
        if (!f.txt || f.txt.size > 1e6) continue;
        var s = { folder: folder, file: base, raw: await f.txt.text() };
        try { if (f.timing) { var tj = JSON.parse(await f.timing.text()); s.timing = tj; if (typeof tj.offset === 'number') s.offset = tj.offset; } } catch (er) { /* 무시 */ }
        try { if (f.pair) s.counts = JSON.parse(await f.pair.text()).counts; } catch (er) { /* 무시 */ }
        songs.push(s);
      }
    }
    if (!songs.length) { toast('txt 가사 파일을 찾지 못했어요. 00_가사 폴더를 골라 주세요.'); return; }
    importBundle({ format: 'musical-lyrics-bundle', version: 1, songs: songs });
  });

  $('#bundleInput').addEventListener('change', async function (e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 30e6) { toast('파일이 너무 커요'); return; }
    var data;
    try { data = JSON.parse(await f.text()); } catch (er) { toast('묶음 파일을 읽을 수 없어요'); return; }
    importBundle(data);
  });
  function exportBundle() {
    var songs = sortedSongs().map(function (r) {
      return { folder: r.folder, file: r.file, raw: r.raw || '', counts: r.counts || null, timing: r.timing || null, offset: r.offset || 0 };
    });
    if (!songs.length) { toast('내보낼 곡이 없어요'); return; }
    var data = { format: 'musical-lyrics-bundle', version: 1, exportedAt: new Date().toISOString(), overrides: S.overrides, songs: songs };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var a = h('a', { href: URL.createObjectURL(blob), download: '가사묶음-' + stamp + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    toast(songs.length + '곡을 내보냈어요. 이 파일을 폰으로 옮겨서 가져오기 하세요.', 4000);
  }

  // ---------------------------------------------------------------- 시작
  function buildTop() {
    var nav = $('.modes');
    MODES.forEach(function (m) {
      nav.append(h('button', {
        type: 'button', 'data-mode': m[0], 'aria-pressed': 'false',
        onclick: function () {
          if (S.set.mode === m[0]) return;
          S.set.mode = m[0]; saveSet();
          if (m[0] === 'hand') pause();
          render();
        }
      }, m[1]));
    });
    $('#menuBtn').addEventListener('click', function () { drawerOpen ? closeDrawer() : openDrawer(); });
    $('#scrim').addEventListener('click', function () { closeDrawer(); });
  }

  async function init() {
    buildTop();
    try {
      await DB.open();
      var songs = await DB.all('songs');
      songs.forEach(function (s) { S.songs.set(s.id, s); });
      S.overrides = (await DB.get('meta', 'overrides')) || {};
      S.dir = (await DB.get('meta', 'dir')) || null;
      S.dataVersion = (await DB.get('meta', 'dataVersion')) || null;
    } catch (e) {
      toast('저장소를 열 수 없어요 (사생활 보호 모드?): ' + e.message, 6000);
    }
    pickDefault(); reparse(); render(); wakeOn();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        // 새 버전이 설치되면 한 번 새로 고침 (재생 중이면 다음에)
        if (hadController && !PB.playing && !SHEET) location.reload();
      });
      navigator.serviceWorker.register('./sw.js').catch(function () {});
      setTimeout(function () { checkUpdate(false); }, 1500);
    }
  }

  // 디버깅/테스트용 (외부 통신 없음)
  window.lyricsApp = { importBundle: importBundle, state: S };
  init();
})();
