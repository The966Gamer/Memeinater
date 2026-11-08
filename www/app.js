(function () {
  'use strict';

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  var CFG = window.MEMEINATER || {};
  var root = document.getElementById('root');
  var toastEl = document.getElementById('toast');
  var EMAIL_DOMAIN = '@memeinater.app';
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

  // ---------- audio ----------
  function urlFor(path) { return sb.storage.from('sounds').getPublicUrl(path).data.publicUrl; }
  function clearPlaying() { if (playingEl) { playingEl.classList.remove('playing'); playingEl = null; } }
  function stopAudio() { try { audio.pause(); audio.currentTime = 0; } catch (e) {} clearPlaying(); }
  audio.addEventListener('ended', clearPlaying);
  audio.addEventListener('error', function () { clearPlaying(); });

  function playSound(s, el) {
    stopAudio();
    playingEl = el;
    if (el) el.classList.add('playing');
    audio.src = urlFor(s.path);
    var p = audio.play();
    if (p && p.catch) p.catch(function () { clearPlaying(); toast('Could not play that one'); });
  }

  function tile(s, onLong) {
    var el = h('button', { class: 'tile' }, [
      h('span', { class: 'e', text: s.emoji }),
      h('span', { class: 'n', text: s.name })
    ]);
    var t = null, long = false;
    el.addEventListener('pointerdown', function () {
      long = false;
      t = setTimeout(function () { long = true; if (navigator.vibrate) navigator.vibrate(30); onLong(s); }, 500);
    });
    el.addEventListener('pointerup', function () { clearTimeout(t); if (!long) playSound(s, el); });
    el.addEventListener('pointercancel', function () { clearTimeout(t); });
    el.addEventListener('pointerleave', function () { clearTimeout(t); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return el;
  }

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
  function authView(mode) {
    root.innerHTML = '';
    var u = h('input', { class: 'field', placeholder: 'username', autocapitalize: 'none', autocomplete: 'username' });
    var p = h('input', { class: 'field', type: 'password', placeholder: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    var c = h('input', { class: 'field', placeholder: 'gang code', autocapitalize: 'characters' });
    var err = h('div', { class: 'err' });
    var go = h('button', { class: 'btn', text: mode === 'login' ? 'LOG IN' : (mode === 'signup' ? 'JOIN THE GANG' : 'FINISH') });

    function name() { return u.value.trim(); }

    go.addEventListener('click', async function () {
      err.textContent = '';
      go.disabled = true;
      try {
        if (mode === 'login') {
          var r = await sb.auth.signInWithPassword({ email: name().toLowerCase() + EMAIL_DOMAIN, password: p.value });
          if (r.error) throw new Error('Wrong username or password');
        } else if (mode === 'signup') {
          if (!/^[A-Za-z0-9_]{2,20}$/.test(name())) throw new Error('Username: 2-20 letters, numbers or _');
          if (p.value.length < 6) throw new Error('Password needs 6+ characters');
          var ok = await sb.rpc('check_code', { p_code: c.value });
          if (ok.error) throw ok.error;
          if (!ok.data) throw new Error('Wrong gang code');
          var s = await sb.auth.signUp({ email: name().toLowerCase() + EMAIL_DOMAIN, password: p.value });
          if (s.error) throw new Error(/registered/i.test(s.error.message) ? 'That username is taken' : s.error.message);
          if (!s.data.session) throw new Error('Supabase still has "Confirm email" turned on. Turn it off in Authentication settings.');
          var f = await sb.rpc('finish_signup', { p_username: name(), p_code: c.value });
          if (f.error) throw f.error;
        } else {
          var f2 = await sb.rpc('finish_signup', { p_username: name(), p_code: c.value });
          if (f2.error) throw f2.error;
        }
        await boot();
      } catch (e) {
        err.textContent = e.message || String(e);
        go.disabled = false;
      }
    });

    var box = h('div', { class: 'auth' }, [
      h('div', { class: 'logo', text: 'MEMEINATER 6700' }),
      h('div', { class: 'sub', text: mode === 'finish' ? 'pick a username and enter the gang code' : 'friends only' }),
      u
    ]);
    if (mode !== 'finish') box.appendChild(p);
    if (mode !== 'login') box.appendChild(c);
    box.appendChild(err);
    box.appendChild(go);

    if (mode === 'finish') {
      box.appendChild(h('div', { class: 'link', text: 'sign out', onclick: function () { sb.auth.signOut(); } }));
    } else {
      box.appendChild(h('div', {
        class: 'link',
        text: mode === 'login' ? 'new here? join the gang' : 'already in? log in',
        onclick: function () { authView(mode === 'login' ? 'signup' : 'login'); }
      }));
    }
    root.appendChild(box);
  }

  // ---------- app shell ----------
  function appView() {
    root.innerHTML = '';
    ui.back = h('button', { class: 'iconbtn', text: '<', onclick: function () { showGroups(); } });
    ui.title = h('div', { class: 'title' });
    ui.who = h('button', { class: 'iconbtn', text: me.username, onclick: accountSheet });
    var stop = h('button', { class: 'iconbtn stop', text: 'STOP', onclick: stopAudio });
    ui.content = h('div', { class: 'content' });
    ui.badge = h('span', { class: 'badge' });
    ui.badge.style.display = 'none';

    ui.nbBoard = h('button', { text: 'BOARD', onclick: showBoard });
    ui.nbGroups = h('button', { text: 'GROUPS', onclick: showGroups });
    ui.nbInbox = h('button', { onclick: showInbox }, ['INBOX', ui.badge]);

    root.appendChild(h('div', { class: 'top' }, [ui.back, ui.title, stop, ui.who]));
    root.appendChild(ui.content);
    root.appendChild(h('div', { class: 'nav' }, [ui.nbBoard, ui.nbGroups, ui.nbInbox]));
    showBoard();
  }

  function setView(name, title, showBack) {
    tab = name;
    ui.title.textContent = title;
    ui.back.style.display = showBack ? '' : 'none';
    ui.nbBoard.className = name === 'board' ? 'on' : '';
    ui.nbGroups.className = (name === 'groups' || name === 'group') ? 'on' : '';
    ui.nbInbox.className = name === 'inbox' ? 'on' : '';
    ui.content.innerHTML = '';
    ui.content.appendChild(h('div', { class: 'empty', text: 'loading...' }));
    refreshBadge().catch(function () {});
  }

  function accountSheet() {
    var s = sheet('Signed in as ' + me.username, [
      h('button', { class: 'btn red', text: 'SIGN OUT', onclick: function () { s.close(); stopAudio(); sb.auth.signOut(); } }),
      h('button', { class: 'btn ghost', text: 'CLOSE', onclick: function () { s.close(); } })
    ]);
  }

  // ---------- my board ----------
  var boardFilter = '';

  async function showBoard() {
    setView('board', 'MY BOARD', false);
    try {
      var list = await fetchMySounds();
      renderBoard(list);
    } catch (e) { fail(e); }
  }

  function renderBoard(list) {
    ui.content.innerHTML = '';
    var search = h('input', { class: 'field', placeholder: 'search...', value: boardFilter });
    var grid = h('div', { class: 'grid' });
    function fill() {
      grid.innerHTML = '';
      var q = boardFilter.toLowerCase();
      var shown = list.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) >= 0; });
      if (!shown.length) {
        grid.appendChild(h('div', { class: 'empty', text: list.length ? 'Nothing found.' : 'No sounds yet. Tap + SOUND to add your first one, or accept one from a friend in INBOX.' }));
        return;
      }
      shown.forEach(function (s) {
        grid.appendChild(tile(s, function (x) { boardActions(x, list); }));
      });
    }
    search.addEventListener('input', function () { boardFilter = search.value.trim(); fill(); });
    ui.content.appendChild(h('div', { class: 'bar' }, [search, h('button', { class: 'btn small', text: '+ SOUND', onclick: addSoundSheet })]));
    ui.content.appendChild(h('div', { class: 'hint', text: 'Tap to play. Hold a sound for more.' }));
    ui.content.appendChild(grid);
    fill();
  }

  function boardActions(s) {
    var sh = sheet(s.emoji + ' ' + s.name, []);
    var box = sh.box;
    box.appendChild(h('button', { class: 'btn', text: 'SEND TO A FRIEND', onclick: function () { sh.close(); sendSheet(s); } }));
    box.appendChild(h('button', { class: 'btn ghost', text: 'ADD TO A GROUP', onclick: function () { sh.close(); addToGroupSheet(s); } }));
    if (s.mine) {
      box.appendChild(h('button', { class: 'btn red', text: 'DELETE FOR EVERYONE', onclick: async function () {
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
      box.appendChild(h('button', { class: 'btn red', text: 'REMOVE FROM MY BOARD', onclick: async function () {
        sh.close();
        try {
          var r = await sb.from('saved_sounds').delete().eq('user_id', me.id).eq('sound_id', s.id);
          if (r.error) throw r.error;
          showBoard();
        } catch (e) { fail(e); }
      } }));
    }
    box.appendChild(h('button', { class: 'btn ghost', text: 'CLOSE', onclick: function () { sh.close(); } }));
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
    var go = h('button', { class: 'btn', text: 'UPLOAD' });
    var sh = sheet('Add a sound', [file, nameIn, row, err, go, h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } })]);

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
      go.textContent = 'UPLOADING...';
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
        go.textContent = 'UPLOAD';
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
      box.appendChild(h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } }));
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
      box.appendChild(h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } }));
    } catch (e) { sh.close(); fail(e); }
  }

  // ---------- groups ----------
  async function showGroups() {
    setView('groups', 'GROUPS', false);
    try {
      var groups = await fetchGroups();
      ui.content.innerHTML = '';
      ui.content.appendChild(h('div', { class: 'bar' }, [
        h('button', { class: 'btn small', text: '+ NEW GROUP', onclick: newGroupSheet }),
        h('button', { class: 'btn small ghost', text: 'JOIN WITH CODE', onclick: joinSheet })
      ]));
      var list = h('div', { class: 'list' });
      groups.forEach(function (g) {
        list.appendChild(h('div', { class: 'row', onclick: function () { showGroup(g); } }, [
          h('div', { class: 'emoji', text: g.is_everyone ? '\uD83C\uDF0D' : '\uD83D\uDC65' }),
          h('div', { class: 'main' }, [
            h('div', { class: 'name', text: g.name }),
            h('div', { class: 'meta' }, ['code ', h('span', { class: 'code', text: g.code })])
          ])
        ]));
      });
      ui.content.appendChild(list);
    } catch (e) { fail(e); }
  }

  function newGroupSheet() {
    var nameIn = h('input', { class: 'field', placeholder: 'group name', maxlength: '30' });
    var err = h('div', { class: 'err' });
    var go = h('button', { class: 'btn', text: 'CREATE' });
    var sh = sheet('New group', [nameIn, err, go, h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } })]);
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
    var go = h('button', { class: 'btn', text: 'JOIN' });
    var sh = sheet('Join a group', [codeIn, err, go, h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } })]);
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
    setView('group', g.name, true);
    try {
      var gs = await sb.from('group_sounds').select('added_by, sound:sounds(*)').eq('group_id', g.id).order('added_at', { ascending: false });
      if (gs.error) throw gs.error;
      var mem = await sb.from('group_members').select('profiles(username)').eq('group_id', g.id);
      if (mem.error) throw mem.error;
      var names = mem.data.map(function (m) { return m.profiles && m.profiles.username; }).filter(Boolean).join(', ');

      ui.content.innerHTML = '';
      ui.content.appendChild(h('div', { class: 'bar' }, [
        h('button', { class: 'btn small', text: '+ FROM MY BOARD', onclick: function () { pickFromBoardSheet(g); } }),
        h('button', { class: 'btn small ghost', text: 'CODE ' + g.code, onclick: function () {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(g.code).then(function () { toast('Code copied'); }, function () { toast('Code: ' + g.code); });
          else toast('Code: ' + g.code);
        } })
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
          h('button', { class: 'btn red', text: 'LEAVE GROUP', onclick: async function () {
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
    box.appendChild(h('button', { class: 'btn', text: 'SAVE TO MY BOARD', onclick: async function () {
      sh.close();
      try {
        var r = await sb.from('saved_sounds').insert({ user_id: me.id, sound_id: s.id });
        if (r.error && r.error.code !== '23505') throw r.error;
        toast(r.error ? 'Already on your board' : 'Saved to your board');
      } catch (e) { fail(e); }
    } }));
    box.appendChild(h('button', { class: 'btn ghost', text: 'SEND TO A FRIEND', onclick: function () { sh.close(); sendSheet(s); } }));
    if (s.added_by === me.id) {
      box.appendChild(h('button', { class: 'btn red', text: 'REMOVE FROM GROUP', onclick: async function () {
        sh.close();
        try {
          var r = await sb.from('group_sounds').delete().eq('group_id', g.id).eq('sound_id', s.id);
          if (r.error) throw r.error;
          showGroup(g);
        } catch (e) { fail(e); }
      } }));
    }
    box.appendChild(h('button', { class: 'btn ghost', text: 'CLOSE', onclick: function () { sh.close(); } }));
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
      box.appendChild(h('button', { class: 'btn ghost', text: 'CANCEL', onclick: function () { sh.close(); } }));
    } catch (e) { sh.close(); fail(e); }
  }

  // ---------- inbox ----------
  async function showInbox() {
    setView('inbox', 'INBOX', false);
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
        var playBtn = h('button', { class: 'iconbtn', text: 'PLAY' });
        playBtn.addEventListener('click', function () { playSound(x.sound, null); });
        var add = h('button', { class: 'iconbtn', text: 'ADD' });
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
        var no = h('button', { class: 'iconbtn', text: 'X' });
        no.addEventListener('click', async function () {
          try {
            var del = await sb.from('shares').delete().eq('id', x.id);
            if (del.error) throw del.error;
            showInbox();
          } catch (e) { fail(e); }
        });
        list.appendChild(h('div', { class: 'row' }, [
          h('div', { class: 'emoji', text: x.sound.emoji }),
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
    if (!me) authView('login');
    else if (me.missing) authView('finish');
    else appView();
  }

  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'SIGNED_OUT') { me = null; stopAudio(); authView('login'); }
  });

  boot();
})();
