(function () {
  'use strict';

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  var CFG = window.MEMEINATER || {};
  var root = document.getElementById('root');
  var toastEl = document.getElementById('toast');
  var EMOJIS = ['\uD83D\uDD0A', '\uD83D\uDCA5', '\uD83D\uDE02', '\uD83D\uDE2D', '\uD83D\uDC80', '\uD83D\uDD25', '\uD83C\uDFB5', '\uD83D\uDC38', '\uD83D\uDC40', '\uD83E\uDD21', '\uD83D\uDE0E', '\uD83D\uDEA8'];
  var MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm' };

  // ---------- tiny helpers ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 2600);
  }
  function fail(e) { toast(e && e.message ? e.message : String(e)); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  var ICONS = {
    board: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    groups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.6.2 4.5 2 4.5 4.8"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shuffle: '<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name, size) {
    var sp = document.createElement('span');
    sp.className = 'ic';
    sp.innerHTML = '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
    return sp;
  }
  function hue(str) { var x = 0; for (var i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) % 360; return x; }
  function tint(el, str) {
    var hh = hue(str);
    el.style.setProperty('--c1', 'hsl(' + hh + ',55%,30%)');
    el.style.setProperty('--c2', 'hsl(' + ((hh + 40) % 360) + ',60%,17%)');
  }

  function sheet(title, nodes) {
    var bg = h('div', { class: 'sheetbg' });
    var sh = h('div', { class: 'sheet' }, [h('h3', { text: title })].concat(nodes));
    bg.appendChild(sh);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.body.appendChild(bg);
    return { close: close, box: sh };
  }

  // ---------- setup check ----------
  if (!CFG.url || CFG.url.indexOf('PASTE') >= 0 || !window.supabase) {
    root.appendChild(h('div', { class: 'auth' }, [
      h('div', { class: 'logo', text: 'MEMEINATER 6700' }),
      h('div', { class: 'sub', text: 'almost ready' }),
      h('div', { class: 'banner', text: 'Open www/config.js and paste your Supabase Project URL, then build again.' })
    ]));
    return;
  }

  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // ---------- state ----------
  var me = null;
  var tab = 'board';
  var ui = {};
  var audio = new Audio();
  var playingEl = null;
  var currentGroup = null;

  // ---------- audio ----------
  function urlFor(path) { return sb.storage.from('sounds').getPublicUrl(path).data.publicUrl; }
  function showNow(s) {
    if (!ui.now) return;
    ui.nowE.textContent = s.emoji;
    ui.nowN.textContent = s.name;
    ui.now.className = 'now show';
  }
  function hideNow() { if (ui.now) ui.now.className = 'now'; }
  function clearPlaying() { if (playingEl) { playingEl.classList.remove('playing'); playingEl = null; } hideNow(); }
  function stopAudio() { try { audio.pause(); audio.currentTime = 0; } catch (e) {} clearPlaying(); }
  audio.addEventListener('ended', clearPlaying);
  audio.addEventListener('error', function () { clearPlaying(); });

  function playSound(s, el) {
    stopAudio();
    playingEl = el;
    if (el) el.classList.add('playing');
    showNow(s);
    audio.src = urlFor(s.path);
    var p = audio.play();
    if (p && p.catch) p.catch(function () { clearPlaying(); toast('Could not play that one'); });
  }

  function tile(s, onLong) {
    var el = h('button', { class: 'tile' }, [
      h('span', { class: 'e', text: s.emoji }),
      h('span', { class: 'n', text: s.name })
    ]);
    el._s = s;
    tint(el, s.name + s.emoji);
    var t = null, long = false;
    el.addEventListener('pointerdown', function () {
      long = false;
      setFocusEl(el);
      t = setTimeout(function () { long = true; if (navigator.vibrate) navigator.vibrate(30); onLong(s); }, 500);
    });
    el.addEventListener('pointerup', function () { clearTimeout(t); if (!long) playSound(s, el); });
    el.addEventListener('pointercancel', function () { clearTimeout(t); });
    el.addEventListener('pointerleave', function () { clearTimeout(t); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return el;
  }

  // ---------- focus, random, keys (same controls as the 8110 version) ----------
  var focusEl = null;
  var lastRandom = -1;
  function gridTiles() { return ui.content ? Array.prototype.slice.call(ui.content.querySelectorAll('.tile')) : []; }
  function setFocusEl(el) {
    if (focusEl) focusEl.classList.remove('focus');
    focusEl = el;
    if (el) {
      el.classList.add('focus');
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }
  function moveFocus(d) {
    var all = gridTiles();
    if (!all.length) return;
    var i = focusEl ? all.indexOf(focusEl) : -1;
    setFocusEl(all[i < 0 ? 0 : Math.max(0, Math.min(all.length - 1, i + d))]);
  }
  function randomPlay() {
    var all = gridTiles();
    if (!all.length) return;
    var n;
    do { n = Math.floor(Math.random() * all.length); } while (n === lastRandom && all.length > 1);
    lastRandom = n;
    setFocusEl(all[n]);
    playSound(all[n]._s, all[n]);
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || !me || !ui.content || document.querySelector('.sheetbg')) return;
    var g = ui.content.querySelector('.grid');
    var cols = g ? (getComputedStyle(g).gridTemplateColumns || '').split(' ').length : 3;
    var k = e.key, used = true;
    if (k === 'ArrowLeft' || k === '4') moveFocus(-1);
    else if (k === 'ArrowRight' || k === '6') moveFocus(1);
    else if (k === 'ArrowUp' || k === '2') moveFocus(-cols);
    else if (k === 'ArrowDown' || k === '8') moveFocus(cols);
    else if ((k === 'Enter' || k === '5') && focusEl && (tag === 'BODY' || (t.classList && t.classList.contains('tile')))) playSound(focusEl._s, focusEl);
    else if (k === '0') randomPlay();
    else if (k === '*') stopAudio();
    else used = false;
    if (used) e.preventDefault();
  });

  // ---------- data ----------
  async function loadMe() {
    var s = await sb.auth.getSession();
    if (!s.data.session) return null;
    var uid = s.data.session.user.id;
    var r = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (r.error) throw r.error;
    return r.data || { id: uid, missing: true };
  }

  async function fetchMySounds() {
    var a = await sb.from('sounds').select('*').eq('owner', me.id).order('created_at', { ascending: false });
    if (a.error) throw a.error;
    var b = await sb.from('saved_sounds').select('sound:sounds(*)').eq('user_id', me.id);
    if (b.error) throw b.error;
    var seen = {}, list = [];
    a.data.forEach(function (s) { seen[s.id] = 1; s.mine = true; list.push(s); });
    b.data.forEach(function (row) {
      if (row.sound && !seen[row.sound.id]) { seen[row.sound.id] = 1; list.push(row.sound); }
    });
    return list;
  }

  async function fetchGroups() {
    var r = await sb.from('group_members').select('group:groups(*)').eq('user_id', me.id);
    if (r.error) throw r.error;
    var list = r.data.map(function (x) { return x.group; }).filter(Boolean);
    list.sort(function (a, b) { return (b.is_everyone ? 1 : 0) - (a.is_everyone ? 1 : 0) || a.name.localeCompare(b.name); });
    return list;
  }

  async function refreshBadge() {
    var r = await sb.from('shares').select('id', { count: 'exact', head: true }).eq('to_user', me.id);
    var n = r.count || 0;
    ui.badge.textContent = n ? String(n) : '';
    ui.badge.style.display = n ? 'inline-block' : 'none';
  }

  // ---------- auth screens ----------
  var recovering = false;

  function getPending() { try { return JSON.parse(localStorage.getItem('mm_pending') || 'null'); } catch (e) { return null; } }
  function setPending(v) {
    try { if (v) localStorage.setItem('mm_pending', JSON.stringify(v)); else localStorage.removeItem('mm_pending'); } catch (e) {}
  }
  function isWeb() { return /^https?:$/.test(location.protocol); }

  function niceError(e) {
    var m = (e && e.message) || String(e);
    if (/profiles_username_key|duplicate key/i.test(m)) return 'That username is taken, pick another one';
    if (/not confirmed/i.test(m)) return 'Confirm your email first (check your inbox and spam)';
    return m;
  }

  function authView(mode, msg, info) {
    root.innerHTML = '';
    var em = h('input', { class: 'field', type: 'email', placeholder: 'email', autocapitalize: 'none', autocomplete: 'email' });
    var u = h('input', { class: 'field', placeholder: 'username', autocapitalize: 'none', autocomplete: 'username' });
    var p = h('input', { class: 'field', type: 'password', placeholder: mode === 'recover' ? 'new password' : 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    var c = h('input', { class: 'field', placeholder: 'gang code', autocapitalize: 'characters' });
    var err = h('div', { class: 'err', text: msg || '' });
    if (info) err.style.color = '#7bd88f';
    var labels = { login: 'Log in', signup: 'Join the gang', finish: 'Finish', forgot: 'Send reset email', recover: 'Save new password' };
    var subs = {
      login: 'friends only',
      signup: 'friends only',
      finish: 'pick a username and enter the gang code',
      forgot: 'we will email you a reset link',
      recover: 'choose a new password'
    };
    var go = h('button', { class: 'btn', text: labels[mode] });

    if (mode === 'finish') {
      var pend = getPending();
      if (pend) { u.value = pend.username || ''; c.value = pend.code || ''; }
    }

    go.addEventListener('click', async function () {
      err.style.color = '';
      err.textContent = '';
      go.disabled = true;
      try {
        var email = em.value.trim().toLowerCase();
        var name = u.value.trim();
        if (mode === 'login') {
          if (!email || !p.value) throw new Error('Enter your email and password');
          var r = await sb.auth.signInWithPassword({ email: email, password: p.value });
          if (r.error) throw new Error(/not confirmed/i.test(r.error.message) ? niceError(r.error) : 'Wrong email or password');
        } else if (mode === 'signup') {
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a real email address');
          if (!/^[A-Za-z0-9_]{2,20}$/.test(name)) throw new Error('Username: 2-20 letters, numbers or _');
          if (p.value.length < 6) throw new Error('Password needs 6+ characters');
          var ok = await sb.rpc('check_code', { p_code: c.value });
          if (ok.error) throw ok.error;
          if (!ok.data) throw new Error('Wrong gang code');
          var opts = isWeb() ? { emailRedirectTo: location.origin + location.pathname } : {};
          var s = await sb.auth.signUp({ email: email, password: p.value, options: opts });
          if (s.error) throw new Error(/registered/i.test(s.error.message) ? 'That email already has an account, try logging in' : s.error.message);
          if (s.data.user && s.data.user.identities && s.data.user.identities.length === 0) {
            throw new Error('That email already has an account, try logging in');
          }
          if (!s.data.session) {
            // email confirmation is on: finish the profile automatically after the first login
            setPending({ username: name, code: c.value.trim() });
            authView('login', 'Check your email and tap the confirm link, then log in here.', true);
            return;
          }
          var f = await sb.rpc('finish_signup', { p_username: name, p_code: c.value });
          if (f.error) throw f.error;
        } else if (mode === 'finish') {
          var f2 = await sb.rpc('finish_signup', { p_username: name, p_code: c.value });
          if (f2.error) throw f2.error;
          setPending(null);
        } else if (mode === 'forgot') {
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter your email address');
          var fr = await sb.auth.resetPasswordForEmail(email, isWeb() ? { redirectTo: location.origin + location.pathname } : {});
          if (fr.error) throw fr.error;
          authView('login', 'If that email has an account, a reset link is on its way.', true);
          return;
        } else if (mode === 'recover') {
          if (p.value.length < 6) throw new Error('Password needs 6+ characters');
          var up = await sb.auth.updateUser({ password: p.value });
          if (up.error) throw up.error;
          recovering = false;
          toast('Password changed');
        }
        await boot();
      } catch (e) {
        err.textContent = niceError(e);
        go.disabled = false;
      }
    });

    var box = h('div', { class: 'auth' }, [
      h('div', { class: 'mark', text: '\uD83D\uDD0A' }),
      h('div', { class: 'logo', text: 'MEMEINATER 6700' }),
      h('div', { class: 'sub', text: subs[mode] })
    ]);
    if (mode === 'login' || mode === 'signup' || mode === 'forgot') box.appendChild(em);
    if (mode === 'signup' || mode === 'finish') box.appendChild(u);
    if (mode === 'login' || mode === 'signup' || mode === 'recover') box.appendChild(p);
    if (mode === 'signup' || mode === 'finish') box.appendChild(c);
    box.appendChild(err);
    box.appendChild(go);

    function link(text, fn) { box.appendChild(h('div', { class: 'link', text: text, onclick: fn })); }
    if (mode === 'login') {
      link('new here? join the gang', function () { authView('signup'); });
      link('forgot password?', function () { authView('forgot'); });
    } else if (mode === 'signup') {
      link('already in? log in', function () { authView('login'); });
    } else if (mode === 'forgot') {
      link('back to log in', function () { authView('login'); });
    } else if (mode === 'finish') {
      link('sign out', function () { sb.auth.signOut(); });
    }
    root.appendChild(box);
  }

  // ---------- app shell ----------
  function navItem(ic, label, fn, extra) {
    var kids = [icon(ic, 24), h('span', { text: label })];
    if (extra) kids.push(extra);
    return h('button', { class: 'ni', onclick: fn }, kids);
  }

  function appView() {
    root.innerHTML = '';
    ui.back = h('button', { class: 'round back', onclick: function () { showGroups(); } }, [icon('back', 22)]);
    ui.title = h('div', { class: 'title' });
    ui.who = h('button', { class: 'avatar', text: me.username.charAt(0).toUpperCase(), onclick: accountSheet });
    ui.content = h('div', { class: 'content' });
    ui.badge = h('span', { class: 'badge' });
    ui.badge.style.display = 'none';

    ui.nbBoard = navItem('board', 'Board', showBoard);
    ui.nbGroups = navItem('groups', 'Groups', showGroups);
    ui.nbInbox = navItem('inbox', 'Inbox', showInbox, ui.badge);

    ui.nowE = h('span', { class: 'ne' });
    ui.nowN = h('span', { class: 'nn' });
    ui.now = h('div', { class: 'now' }, [ui.nowE, ui.nowN, h('button', { class: 'round', onclick: stopAudio }, [icon('stop', 18)])]);
    ui.fab = h('button', { class: 'fab', onclick: function () { if (ui.midFn) ui.midFn(); } }, [icon('plus', 26)]);

    root.appendChild(h('div', { class: 'top' }, [ui.back, ui.title, ui.who]));
    root.appendChild(ui.content);
    root.appendChild(ui.now);
    root.appendChild(ui.fab);
    root.appendChild(h('div', { class: 'nav' }, [ui.nbBoard, ui.nbGroups, ui.nbInbox]));
    showBoard();
  }

  function setView(name, title, showBack) {
    tab = name;
    focusEl = null;
    ui.baseTitle = title;
    ui.title.textContent = title;
    ui.back.style.display = showBack ? 'inline-flex' : 'none';
    ui.nbBoard.className = 'ni' + (name === 'board' ? ' on' : '');
    ui.nbGroups.className = 'ni' + ((name === 'groups' || name === 'group') ? ' on' : '');
    ui.nbInbox.className = 'ni' + (name === 'inbox' ? ' on' : '');
    var mids = {
      board: addSoundSheet,
      groups: newGroupSheet,
      group: function () { if (currentGroup) pickFromBoardSheet(currentGroup); },
      inbox: null
    };
    ui.midFn = mids[name];
    ui.fab.style.display = mids[name] ? 'flex' : 'none';
    ui.content.innerHTML = '';
    ui.content.appendChild(h('div', { class: 'empty', text: 'loading...' }));
    refreshBadge().catch(function () {});
  }

  function accountSheet() {
    var s = sheet(me.username, [
      h('button', { class: 'btn red', text: 'Sign out', onclick: function () { s.close(); stopAudio(); sb.auth.signOut(); } }),
      h('button', { class: 'btn ghost', text: 'Close', onclick: function () { s.close(); } })
    ]);
  }

  // ---------- my board ----------
  var boardFilter = '';

  async function showBoard() {
    setView('board', 'Sounds', false);
    try {
      var list = await fetchMySounds();
      renderBoard(list);
    } catch (e) { fail(e); }
  }

  function renderBoard(list) {
    ui.content.innerHTML = '';
    var search = h('input', { class: 'sinput', placeholder: 'Search sounds', value: boardFilter });
    var grid = h('div', { class: 'grid' });
    function fill() {
      grid.innerHTML = '';
      var q = boardFilter.toLowerCase();
      var shown = list.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) >= 0; });
      if (!shown.length) {
        grid.appendChild(h('div', { class: 'empty', text: list.length ? 'Nothing found.' : 'No sounds yet. Tap + to add your first one, or accept one a friend sent you in Inbox.' }));
        return;
      }
      shown.forEach(function (s) {
        grid.appendChild(tile(s, function (x) { boardActions(x, list); }));
      });
    }
    search.addEventListener('input', function () { boardFilter = search.value.trim(); fill(); });
    ui.content.appendChild(h('div', { class: 'bar' }, [
      h('div', { class: 'searchbox' }, [icon('search', 18), search]),
      h('button', { class: 'round big', onclick: randomPlay }, [icon('shuffle', 20)])
    ]));
    ui.content.appendChild(h('div', { class: 'hint', text: 'Tap to play. Hold a sound for more.' }));
    ui.content.appendChild(grid);
    fill();
  }

  function boardActions(s) {
    var sh = sheet(s.emoji + ' ' + s.name, []);
    var box = sh.box;
    box.appendChild(h('button', { class: 'btn', text: 'Send to a friend', onclick: function () { sh.close(); sendSheet(s); } }));
    box.appendChild(h('button', { class: 'btn ghost', text: 'Add to a group', onclick: function () { sh.close(); addToGroupSheet(s); } }));
    if (s.mine) {
      box.appendChild(h('button', { class: 'btn red', text: 'Delete for everyone', onclick: async function () {
        sh.close();
        try {
          var r = await sb.from('sounds').delete().eq('id', s.id);
          if (r.error) throw r.error;
          await sb.storage.from('sounds').remove([s.path]);
          toast('Deleted');
          showBoard();
        } catch (e) { fail(e); }
      } }));
    } else {
      box.appendChild(h('button', { class: 'btn red', text: 'Remove from my board', onclick: async function () {
        sh.close();
        try {
          var r = await sb.from('saved_sounds').delete().eq('user_id', me.id).eq('sound_id', s.id);
          if (r.error) throw r.error;
          showBoard();
        } catch (e) { fail(e); }
      } }));
    }
    box.appendChild(h('button', { class: 'btn ghost', text: 'Close', onclick: function () { sh.close(); } }));
  }

  function addSoundSheet() {
    var file = h('input', { class: 'field', type: 'file', accept: 'audio/*' });
    var nameIn = h('input', { class: 'field', placeholder: 'name (like VINE BOOM)', maxlength: '28' });
    var emoji = EMOJIS[0];
    var row = h('div', { class: 'emojis' });
    EMOJIS.forEach(function (e, i) {
      var b = h('button', { text: e, class: i === 0 ? 'on' : '' });
      b.addEventListener('click', function () {
        emoji = e;
        Array.prototype.forEach.call(row.children, function (x) { x.className = ''; });
        b.className = 'on';
      });
      row.appendChild(b);
    });
    var err = h('div', { class: 'err' });
    var go = h('button', { class: 'btn', text: 'Upload' });
    var sh = sheet('Add a sound', [file, nameIn, row, err, go, h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } })]);

    file.addEventListener('change', function () {
      var f = file.files[0];
      if (f && !nameIn.value) nameIn.value = f.name.replace(/\.[^.]+$/, '').slice(0, 28);
    });

    go.addEventListener('click', async function () {
      err.textContent = '';
      var f = file.files[0];
      if (!f) { err.textContent = 'Pick a sound file first'; return; }
      if (f.size > 3 * 1024 * 1024) { err.textContent = 'Max 3 MB. Trim it to a few seconds.'; return; }
      var nm = (nameIn.value.trim() || f.name.replace(/\.[^.]+$/, '')).slice(0, 28);
      var ext = ((f.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)) || 'mp3';
      var path = me.id + '/' + uuid() + '.' + ext;
      go.disabled = true;
      go.textContent = 'Uploading...';
      try {
        var up = await sb.storage.from('sounds').upload(path, f, { contentType: f.type || MIME[ext] || 'audio/mpeg', upsert: false });
        if (up.error) throw up.error;
        var ins = await sb.from('sounds').insert({ owner: me.id, name: nm, emoji: emoji, path: path });
        if (ins.error) { await sb.storage.from('sounds').remove([path]); throw ins.error; }
        sh.close();
        toast('Added ' + nm);
        showBoard();
      } catch (e) {
        err.textContent = e.message || String(e);
        go.disabled = false;
        go.textContent = 'Upload';
      }
    });
  }

  // ---------- send / add-to-group ----------
  async function sendSheet(s) {
    var sh = sheet('Send ' + s.name + ' to...', [h('div', { class: 'empty', text: 'loading...' })]);
    try {
      var r = await sb.from('profiles').select('id,username').neq('id', me.id).order('username');
      if (r.error) throw r.error;
      var box = sh.box;
      box.innerHTML = '';
      box.appendChild(h('h3', { text: 'Send ' + s.name + ' to...' }));
      if (!r.data.length) box.appendChild(h('div', { class: 'empty', text: 'Nobody else has joined yet.' }));
      r.data.forEach(function (p) {
        box.appendChild(h('button', { class: 'btn ghost', text: p.username, onclick: async function () {
          try {
            var ins = await sb.from('shares').insert({ sound_id: s.id, from_user: me.id, to_user: p.id });
            if (ins.error) throw ins.error;
            sh.close();
            toast('Sent to ' + p.username);
          } catch (e) { fail(e); }
        } }));
      });
      box.appendChild(h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } }));
    } catch (e) { sh.close(); fail(e); }
  }

  async function addToGroupSheet(s) {
    var sh = sheet('Add ' + s.name + ' to...', [h('div', { class: 'empty', text: 'loading...' })]);
    try {
      var groups = await fetchGroups();
      var box = sh.box;
      box.innerHTML = '';
      box.appendChild(h('h3', { text: 'Add ' + s.name + ' to...' }));
      groups.forEach(function (g) {
        box.appendChild(h('button', { class: 'btn ghost', text: g.name, onclick: async function () {
          try {
            var ins = await sb.from('group_sounds').insert({ group_id: g.id, sound_id: s.id, added_by: me.id });
            if (ins.error && ins.error.code !== '23505') throw ins.error;
            sh.close();
            toast(ins.error ? 'Already in ' + g.name : 'Added to ' + g.name);
          } catch (e) { fail(e); }
        } }));
      });
      box.appendChild(h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } }));
    } catch (e) { sh.close(); fail(e); }
  }

  // ---------- groups ----------
  async function showGroups() {
    setView('groups', 'Groups', false);
    try {
      var groups = await fetchGroups();
      ui.content.innerHTML = '';
      ui.content.appendChild(h('button', { class: 'chip', onclick: joinSheet }, [icon('plus', 16), 'Join with code']));
      var list = h('div', { class: 'list' });
      groups.forEach(function (g) {
        var av = h('div', { class: 'gav', text: g.is_everyone ? '\uD83C\uDF0D' : '\uD83D\uDC65' });
        tint(av, g.name);
        list.appendChild(h('div', { class: 'card', onclick: function () { showGroup(g); } }, [
          av,
          h('div', { class: 'main' }, [
            h('div', { class: 'name', text: g.name }),
            h('div', { class: 'meta' }, ['code ', h('span', { class: 'code', text: g.code })])
          ]),
          icon('chev', 20)
        ]));
      });
      ui.content.appendChild(list);
    } catch (e) { fail(e); }
  }

  function newGroupSheet() {
    var nameIn = h('input', { class: 'field', placeholder: 'group name', maxlength: '30' });
    var err = h('div', { class: 'err' });
    var go = h('button', { class: 'btn', text: 'Create' });
    var sh = sheet('New group', [nameIn, err, go, h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } })]);
    go.addEventListener('click', async function () {
      err.textContent = '';
      try {
        var r = await sb.rpc('create_group', { p_name: nameIn.value });
        if (r.error) throw r.error;
        var g = Array.isArray(r.data) ? r.data[0] : r.data;
        sh.close();
        toast('Group code: ' + g.code);
        showGroup(g);
      } catch (e) { err.textContent = e.message || String(e); }
    });
  }

  function joinSheet() {
    var codeIn = h('input', { class: 'field', placeholder: 'group code', autocapitalize: 'characters' });
    var err = h('div', { class: 'err' });
    var go = h('button', { class: 'btn', text: 'Join' });
    var sh = sheet('Join a group', [codeIn, err, go, h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } })]);
    go.addEventListener('click', async function () {
      err.textContent = '';
      try {
        var r = await sb.rpc('join_group', { p_code: codeIn.value });
        if (r.error) throw r.error;
        sh.close();
        toast('Joined');
        showGroups();
      } catch (e) { err.textContent = e.message || String(e); }
    });
  }

  async function showGroup(g) {
    currentGroup = g;
    setView('group', g.name, true);
    try {
      var gs = await sb.from('group_sounds').select('added_by, sound:sounds(*)').eq('group_id', g.id).order('added_at', { ascending: false });
      if (gs.error) throw gs.error;
      var mem = await sb.from('group_members').select('profiles(username)').eq('group_id', g.id);
      if (mem.error) throw mem.error;
      var names = mem.data.map(function (m) { return m.profiles && m.profiles.username; }).filter(Boolean).join(', ');

      ui.content.innerHTML = '';
      ui.content.appendChild(h('div', { class: 'bar' }, [
        h('button', { class: 'chip', style: 'margin:0', onclick: function () {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(g.code).then(function () { toast('Code copied'); }, function () { toast('Code: ' + g.code); });
          else toast('Code: ' + g.code);
        } }, ['Code ', h('b', { class: 'code', text: g.code })]),
        h('div', { style: 'flex:1' }),
        h('button', { class: 'round big', onclick: randomPlay }, [icon('shuffle', 20)])
      ]));
      ui.content.appendChild(h('div', { class: 'hint', text: 'Members: ' + names }));
      var grid = h('div', { class: 'grid' });
      var rows = gs.data.filter(function (x) { return x.sound; });
      if (!rows.length) grid.appendChild(h('div', { class: 'empty', text: 'No sounds here yet. Add one from your board.' }));
      rows.forEach(function (x) {
        x.sound.added_by = x.added_by;
        grid.appendChild(tile(x.sound, function (s) { groupActions(g, s); }));
      });
      ui.content.appendChild(grid);
      if (!g.is_everyone) {
        ui.content.appendChild(h('div', { style: 'margin-top:22px' }, [
          h('button', { class: 'btn red', text: 'Leave group', onclick: async function () {
            try {
              var r = await sb.from('group_members').delete().eq('group_id', g.id).eq('user_id', me.id);
              if (r.error) throw r.error;
              showGroups();
            } catch (e) { fail(e); }
          } })
        ]));
      }
    } catch (e) { fail(e); }
  }

  function groupActions(g, s) {
    var sh = sheet(s.emoji + ' ' + s.name, []);
    var box = sh.box;
    box.appendChild(h('button', { class: 'btn', text: 'Save to my board', onclick: async function () {
      sh.close();
      try {
        var r = await sb.from('saved_sounds').insert({ user_id: me.id, sound_id: s.id });
        if (r.error && r.error.code !== '23505') throw r.error;
        toast(r.error ? 'Already on your board' : 'Saved to your board');
      } catch (e) { fail(e); }
    } }));
    box.appendChild(h('button', { class: 'btn ghost', text: 'Send to a friend', onclick: function () { sh.close(); sendSheet(s); } }));
    if (s.added_by === me.id) {
      box.appendChild(h('button', { class: 'btn red', text: 'Remove from group', onclick: async function () {
        sh.close();
        try {
          var r = await sb.from('group_sounds').delete().eq('group_id', g.id).eq('sound_id', s.id);
          if (r.error) throw r.error;
          showGroup(g);
        } catch (e) { fail(e); }
      } }));
    }
    box.appendChild(h('button', { class: 'btn ghost', text: 'Close', onclick: function () { sh.close(); } }));
  }

  async function pickFromBoardSheet(g) {
    var sh = sheet('Add to ' + g.name, [h('div', { class: 'empty', text: 'loading...' })]);
    try {
      var list = await fetchMySounds();
      var box = sh.box;
      box.innerHTML = '';
      box.appendChild(h('h3', { text: 'Add to ' + g.name }));
      if (!list.length) box.appendChild(h('div', { class: 'empty', text: 'Your board is empty. Add a sound on BOARD first.' }));
      list.forEach(function (s) {
        box.appendChild(h('button', { class: 'btn ghost', text: s.emoji + '  ' + s.name, onclick: async function () {
          try {
            var ins = await sb.from('group_sounds').insert({ group_id: g.id, sound_id: s.id, added_by: me.id });
            if (ins.error && ins.error.code !== '23505') throw ins.error;
            sh.close();
            toast(ins.error ? 'Already in the group' : 'Added');
            showGroup(g);
          } catch (e) { fail(e); }
        } }));
      });
      box.appendChild(h('button', { class: 'btn ghost', text: 'Cancel', onclick: function () { sh.close(); } }));
    } catch (e) { sh.close(); fail(e); }
  }

  // ---------- inbox ----------
  async function showInbox() {
    setView('inbox', 'Inbox', false);
    try {
      var r = await sb.from('shares')
        .select('id, created_at, sound:sounds(*), sender:profiles!shares_from_user_fkey(username)')
        .eq('to_user', me.id)
        .order('created_at', { ascending: false });
      if (r.error) throw r.error;
      ui.content.innerHTML = '';
      var rows = r.data.filter(function (x) { return x.sound; });
      if (!rows.length) {
        ui.content.appendChild(h('div', { class: 'empty', text: 'Nothing here. When a friend sends you a sound it shows up here.' }));
        return;
      }
      var list = h('div', { class: 'list' });
      rows.forEach(function (x) {
        var playBtn = h('button', { class: 'round' }, [icon('play', 16)]);
        playBtn.addEventListener('click', function () { playSound(x.sound, null); });
        var add = h('button', { class: 'chip primary', text: 'Add' });
        add.addEventListener('click', async function () {
          try {
            var ins = await sb.from('saved_sounds').insert({ user_id: me.id, sound_id: x.sound.id });
            if (ins.error && ins.error.code !== '23505') throw ins.error;
            var del = await sb.from('shares').delete().eq('id', x.id);
            if (del.error) throw del.error;
            toast('Added to your board');
            showInbox();
          } catch (e) { fail(e); }
        });
        var no = h('button', { class: 'round' }, [icon('x', 16)]);
        no.addEventListener('click', async function () {
          try {
            var del = await sb.from('shares').delete().eq('id', x.id);
            if (del.error) throw del.error;
            showInbox();
          } catch (e) { fail(e); }
        });
        var av = h('div', { class: 'gav', text: x.sound.emoji });
        tint(av, x.sound.name + x.sound.emoji);
        list.appendChild(h('div', { class: 'card' }, [
          av,
          h('div', { class: 'main' }, [
            h('div', { class: 'name', text: x.sound.name }),
            h('div', { class: 'meta', text: 'from ' + (x.sender ? x.sender.username : '?') })
          ]),
          playBtn, add, no
        ]));
      });
      ui.content.appendChild(list);
    } catch (e) { fail(e); }
  }

  // ---------- boot ----------
  async function boot() {
    try {
      me = await loadMe();
    } catch (e) {
      fail(e);
      me = null;
    }
    if (recovering) return;
    if (me && me.missing) {
      var pend = getPending();
      if (pend) {
        try {
          var f = await sb.rpc('finish_signup', { p_username: pend.username, p_code: pend.code });
          if (f.error) throw f.error;
          setPending(null);
          me = await loadMe();
        } catch (e) {
          authView('finish', niceError(e));
          return;
        }
      }
    }
    if (!me) authView('login');
    else if (me.missing) authView('finish');
    else appView();
  }

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; authView('recover'); }
    else if (ev === 'SIGNED_OUT') { me = null; stopAudio(); authView('login'); }
  });

  boot();
})();
