/* 가사 텍스트 해석기: 배역 표시 → 파트 색, 한글 해석 → 원문 줄과 짝짓기.
   결과의 '짝'은 counts 배열(원문 줄마다 붙는 해석 줄 개수)로 표현한다.
   해석 줄 순서는 항상 유지되므로 counts만으로 짝이 정해진다. */
(function (root) {
  'use strict';

  var HANGUL = /[가-힣]/;
  var LATIN = /[A-Za-zÀ-ɏ]/;
  var PART_TAG = /^\[(공|남|여)\]\s*(.*)$/;
  var SECTION_RE = /\b(VERSE|CHORUS|PRE CHORUS|PRECHORUS|POST CHORUS|INTRO|OUTRO|BRIDGE|REFRAIN|HOOK|INSTRUMENTAL|INTERLUDE|BREAK|COUPLET|PONT|PART|SPOKEN|DIALOGUE|REPRISE|CODA|SCENE|SPEAKING|SUNG)\b|\b\d+\b/g;
  var GROUP = {};
  ['ALL', 'ENSEMBLE', 'CHORUS', 'COMPANY', 'CREW', 'CAST', 'EVERYONE', 'BOTH', 'MEN', 'WOMEN',
    'SOLDIERS', 'SUITORS', 'FATES', 'WORKERS', 'TOUS', 'CHOEUR', 'CHOEURS', 'CHORALE', 'TOGETHER',
    'OTHERS', 'GODS', 'SIRENS', 'WINDS', 'TUTTI', 'GROUP', 'CROWD', 'PEOPLE', 'FULL COMPANY',
    '모두', '합창', '앙상블', '다같이', '다 같이', '함께', '코러스'].forEach(function (k) { GROUP[k] = true; });

  function normName(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
      .toUpperCase().replace(/[^A-Z0-9가-힣 ]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(THE|LA|LE|LES) /, '');
  }

  var CAST = {};
  var srcCast = root.LPCast || {};
  Object.keys(srcCast).forEach(function (k) { CAST[normName(k)] = srcCast[k]; });

  function splitNames(s) {
    return String(s).replace(/\([^)]*\)/g, ' ')
      .split(/\s*(?:&|,|\/|\+|;|\bAND\b|\bET\b|\bWITH\b|\bVS\b\.?|와 |과 |그리고 )\s*/i)
      .map(function (n) { return normName(n).replace(SECTION_RE, ' ').replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
  }

  // 이름 하나 → '공'|'남'|'여'|null
  function lookup(n, ov) {
    if (ov && ov[n]) return ov[n];
    if (GROUP[n]) return '공';
    if (CAST[n]) return CAST[n];
    var words = n.split(' ');
    for (var i = 0; i < words.length; i++) {
      if (GROUP[words[i]]) return '공';
    }
    // "YOUNG ODYSSEUS", "LADY CAPULET" 같은 경우: 뒤에서부터 단어 조합 확인
    for (var a = 0; a < words.length; a++) {
      for (var b = words.length; b > a; b--) {
        var sub = words.slice(a, b).join(' ');
        if (sub !== n && (ov && ov[sub] || CAST[sub])) return (ov && ov[sub]) || CAST[sub];
      }
    }
    return null;
  }

  function isUpperName(s) {
    return LATIN.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
  }

  // 줄이 배역/구간 표시인지 판단
  function detectLabel(line, ov) {
    var m = line.match(PART_TAG);
    if (m) return { forced: m[1], rest: m[2] };

    m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      var inner = m[1];
      var namePart = inner.indexOf(':') >= 0 ? inner.slice(inner.indexOf(':') + 1) : inner;
      var names = splitNames(namePart);
      if (!names.length) return { section: true, rest: m[2] };
      return { names: names, display: namePart.replace(/\([^)]*\)/g, '').trim(), rest: m[2] };
    }

    m = line.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    if (m) {
      var name = m[1].trim();
      var nm = splitNames(name);
      if (nm.length) {
        var hangulName = HANGUL.test(name) && name.length <= 14 && (name.match(/ /g) || []).length <= 3 && !/[.?!~]/.test(name);
        var allKnown = nm.every(function (n) { return lookup(n, ov); });
        if (isUpperName(name) || hangulName || allKnown) {
          return { names: nm, display: name, rest: m[2] };
        }
      }
    }

    if (line.length <= 40 && isUpperName(line) && !/[.?!]$/.test(line)) {
      var nb = splitNames(line);
      if (nb.length && nb.every(function (n) { return lookup(n, ov); })) {
        return { names: nb, display: line, rest: '' };
      }
    }
    return null;
  }

  function resolvePart(names, ov, unknown) {
    if (names.length > 1) {
      names.forEach(function (n) { if (!lookup(n, ov)) unknown[n] = true; });
      return '공';
    }
    var p = lookup(names[0], ov);
    if (!p) { unknown[names[0]] = true; return '공'; }
    return p;
  }

  function prettyName(s) {
    s = String(s).trim();
    if (isUpperName(s)) {
      return s.toLowerCase().replace(/(^|[\s&,/(-])([a-zà-ÿ])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }
    return s;
  }

  function distribute(counts, rows, m) {
    var n = rows.length;
    for (var r = 0; r < n; r++) {
      counts[rows[r]] = Math.floor((r + 1) * m / n) - Math.floor(r * m / n);
    }
  }

  function validCounts(c, L, K) {
    if (!Array.isArray(c) || c.length !== L) return false;
    var sum = 0;
    for (var i = 0; i < c.length; i++) {
      if (!Number.isInteger(c[i]) || c[i] < 0) return false;
      sum += c[i];
    }
    return sum === K;
  }

  // 같은 성별 안에서 가수별 색 번호(1·2): 첫 가수는 1, 새 가수가 처음 나오면
  // 바로 앞 같은 성별 가수와 다른 번호를 받고, 곡 안에서는 그 번호를 계속 쓴다.
  function assignVariants(lines) {
    var map = {}, last = {};
    lines.forEach(function (ln) {
      ln.v = 1;
      var p = ln.part;
      if (p !== '남' && p !== '여') return;
      var key = normName(ln.singer || '');
      if (!(key in map)) {
        var prev = last[p];
        map[key] = prev && prev.key !== key ? 3 - prev.v : 1;
      }
      ln.v = map[key];
      last[p] = { key: key, v: ln.v };
    });
  }

  function parseSong(raw, opt) {
    opt = opt || {};
    var ov = opt.overrides || {};
    var src = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
      .map(function (s) { return s.replace(/\s*\[\d{1,3}\]/g, '').replace(/^[\s 　]+|[\s 　]+$/g, ''); });

    // 한국어 곡인지(→ 한글 줄도 가사) 판단
    var hang = 0, lat = 0;
    src.forEach(function (s) {
      if (!s) return;
      if (HANGUL.test(s)) hang++; else if (LATIN.test(s)) lat++;
    });
    var koreanSong = typeof opt.korean === 'boolean' ? opt.korean : (hang > 0 && lat < hang * 0.3);

    var tokens = [];
    function pushText(s) {
      if (!koreanSong && HANGUL.test(s)) tokens.push({ t: 'ko', text: s });
      else tokens.push({ t: 'lyric', text: s });
    }
    src.forEach(function (s) {
      if (!s) { tokens.push({ t: 'blank' }); return; }
      var lab = detectLabel(s, ov);
      if (lab) {
        if (!koreanSong && lab.names && lab.names.some(function (n) { return HANGUL.test(n); })) {
          // 해석 부분의 한글 배역 표시 → 무시
          if (lab.rest) tokens.push({ t: 'ko', text: lab.rest });
          return;
        }
        tokens.push({ t: 'label', lab: lab });
        if (lab.rest) pushText(lab.rest);
        return;
      }
      pushText(s);
    });

    var lines = [], koLines = [], koStanza = [], attach = [], unknown = {};
    var part = '공', singer = '', stanza = 0, saw = false, groupStart = true;
    var koSt = 0, koSaw = false, firstKoTok = -1;
    tokens.forEach(function (tk, k) {
      if (tk.t === 'blank') {
        if (saw) { stanza++; saw = false; }
        if (koSaw) { koSt++; koSaw = false; }
        groupStart = true;
      } else if (tk.t === 'label') {
        var lab = tk.lab;
        if (lab.section) { groupStart = true; return; }
        if (lab.forced) { part = lab.forced; singer = ''; groupStart = true; return; }
        part = resolvePart(lab.names, ov, unknown);
        singer = prettyName(lab.display || lab.names.join(' & '));
        groupStart = true;
      } else if (tk.t === 'lyric') {
        lines.push({ text: tk.text, part: part, singer: singer, stanza: stanza, groupStart: groupStart, tok: k, ko: '' });
        groupStart = false; saw = true;
      } else if (tk.t === 'ko') {
        if (firstKoTok < 0) firstKoTok = k;
        koLines.push(tk.text); koStanza.push(koSt); koSaw = true;
        attach.push(lines.length - 1);
      }
    });

    var L = lines.length, K = koLines.length;
    var mode = 'none', counts = [], flags = {}, i;
    for (i = 0; i < L; i++) counts.push(0);

    if (K && L) {
      var after = 0;
      lines.forEach(function (l) { if (l.tok > firstKoTok) after++; });
      mode = after <= Math.max(2, L * 0.1) ? 'block' : 'interleaved';

      if (mode === 'interleaved') {
        attach.forEach(function (a) { counts[Math.max(a, 0)]++; });
      } else {
        var os = [], ks = [];
        lines.forEach(function (l, idx) { (os[l.stanza] = os[l.stanza] || []).push(idx); });
        koStanza.forEach(function (s, idx) { (ks[s] = ks[s] || []).push(idx); });
        os = os.filter(Boolean); ks = ks.filter(Boolean);
        if (os.length === ks.length) {
          os.forEach(function (rows, s) {
            distribute(counts, rows, ks[s].length);
            if (rows.length !== ks[s].length) rows.forEach(function (r) { flags[r] = true; });
          });
        } else {
          var all = [];
          for (i = 0; i < L; i++) all.push(i);
          distribute(counts, all, K);
          if (L !== K) all.forEach(function (r) { flags[r] = true; });
        }
      }
    }

    var autoCounts = counts.slice();
    var userPaired = false;
    if (mode !== 'none' && validCounts(opt.counts, L, K)) {
      counts = opt.counts.slice(); flags = {}; userPaired = true;
    }

    var off = 0;
    lines.forEach(function (l, idx) {
      l.ko = koLines.slice(off, off + counts[idx]).join(' ');
      off += counts[idx];
      delete l.tok;
    });
    assignVariants(lines);

    return {
      lines: lines, koLines: koLines, counts: counts, autoCounts: autoCounts,
      flags: Object.keys(flags).map(Number), unknown: Object.keys(unknown),
      mode: mode, koreanSong: koreanSong, userPaired: userPaired
    };
  }

  // 타이밍: 빈 칸(null)은 앞뒤 값으로 채워서 재생용 시간표를 만든다
  function effectiveTimes(timing, n) {
    if (!timing || !Array.isArray(timing.times) || !n) return null;
    var t = timing.times.slice(0, n).map(function (x) { return typeof x === 'number' && isFinite(x) ? x : null; });
    while (t.length < n) t.push(null);
    var known = [];
    t.forEach(function (x, i) { if (x !== null) known.push(i); });
    if (!known.length) return null;
    var first = known[0], last = known[known.length - 1], i;
    for (i = 0; i < first; i++) t[i] = Math.max(0, t[first] - 2 * (first - i));
    for (i = last + 1; i < n; i++) t[i] = t[last] + 2.5 * (i - last);
    for (var k = 0; k < known.length - 1; k++) {
      var a = known[k], b = known[k + 1];
      for (i = a + 1; i < b; i++) t[i] = t[a] + (t[b] - t[a]) * (i - a) / (b - a);
    }
    for (i = 1; i < n; i++) if (t[i] < t[i - 1]) t[i] = t[i - 1];
    return t;
  }

  root.LP = { parseSong: parseSong, effectiveTimes: effectiveTimes, validCounts: validCounts, normName: normName };
})(typeof window !== 'undefined' ? window : globalThis);
