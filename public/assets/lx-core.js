/* lx-core.js — a Linux server that lives entirely in the browser (no cloud, no backend).
   Virtual filesystem with users/groups/permissions, a real shell (pipes, redirects, quotes,
   variables, globs, && || ;, $(...)), and the everyday commands. Server features (services,
   processes, packages, network, firewall, cron) are added by lx-system.js. */
(function (root) {
  'use strict';
  var LX = root.LX = root.LX || {};
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function padR(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function human(n) { var u = ['', 'K', 'M', 'G', 'T'], i = 0, x = n; while (x >= 1024 && i < 4) { x /= 1024; i++; } return i === 0 ? String(n) : ((x < 10 ? x.toFixed(1) : Math.round(x)) + u[i]); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function basename(p) { var a = p.replace(/\/+$/, '').split('/'); return a[a.length - 1] || '/'; }
  function dirname(p) { var s = p.replace(/\/+$/, ''); var i = s.lastIndexOf('/'); return i <= 0 ? '/' : s.slice(0, i); }
  LX.util = { p2: p2, padR: padR, padL: padL, human: human, escRe: escRe, basename: basename, dirname: dirname, MON: MON, DAY: DAY };

  var ERR = { ENOENT: 'No such file or directory', EACCES: 'Permission denied', ENOTDIR: 'Not a directory', EISDIR: 'Is a directory', EEXIST: 'File exists', ENOTEMPTY: 'Directory not empty', ELOOP: 'Too many levels of symbolic links', ENOSPC: 'No space left on device' };

  function Machine(opts) { this.opts = opts || {}; this.reset(); }
  LX.Machine = Machine;
  var M = Machine.prototype;
  M.cmds = {};      // name -> function(args, ctx) -> exit code
  M.builtins = {};  // shell builtins (see below)
  M.man = {};       // name -> {syn, desc, ex}
  M.hooks = [];     // functions run after Machine.reset() (lx-system.js adds its setup here)

  // ---------------------------------------------------------------- state
  M.reset = function () {
    this.t0 = Date.UTC(2026, 10, 27, 10, 42, 0);
    this.ticks = 0;
    this.hostname = 'devkit-server';
    this.users = {
      root: { name: 'root', uid: 0, gid: 0, home: '/root', shell: '/bin/bash', groups: ['root'], gecos: 'root' },
      daemon: { name: 'daemon', uid: 1, gid: 1, home: '/usr/sbin', shell: '/usr/sbin/nologin', groups: ['daemon'], gecos: 'daemon' },
      www: { name: 'www-data', uid: 33, gid: 33, home: '/var/www', shell: '/usr/sbin/nologin', groups: ['www-data'], gecos: 'www-data' },
      syslog: { name: 'syslog', uid: 107, gid: 113, home: '/home/syslog', shell: '/usr/sbin/nologin', groups: ['syslog', 'adm'], gecos: '' },
      learner: { name: 'learner', uid: 1000, gid: 1000, home: '/home/learner', shell: '/bin/bash', groups: ['learner', 'sudo', 'adm'], gecos: 'Learner' }
    };
    // index by real name (www-data has a dash)
    this.users['www-data'] = this.users.www; delete this.users.www;
    this.groups = { root: 0, daemon: 1, adm: 4, sudo: 27, 'www-data': 33, syslog: 113, learner: 1000, shadow: 42 };
    this.user = this.users.learner; this.userStack = [];
    this.cwd = '/home/learner'; this.oldpwd = '/home/learner';
    this.vars = { HOME: '/home/learner', USER: 'learner', LOGNAME: 'learner', SHELL: '/bin/bash', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'en_US.UTF-8', PWD: '/home/learner', TERM: 'xterm-256color', HOSTNAME: this.hostname };
    this.exported = { HOME: 1, USER: 1, LOGNAME: 1, SHELL: 1, PATH: 1, LANG: 1, PWD: 1, TERM: 1 };
    this.aliases = { ll: 'ls -alF', la: 'ls -A' };
    this.umask = 18; // 022
    this.lastCode = 0;
    this.hist = []; this.cmdlog = []; this.lineLog = []; this.flags = {}; this.counters = {};
    this.editor = null; this.screen = []; this.depth = 0;
    this.root = this.dirNode(493, 'root', 'root');
    this.buildFs();
    for (var i = 0; i < this.hooks.length; i++) this.hooks[i].call(this);
  };
  M.now = function () { return this.t0 + this.ticks * 13000; };
  M.advance = function (sec) { this.ticks += Math.ceil(sec / 13); };

  // ---------------------------------------------------------------- filesystem
  M.dirNode = function (mode, o, g) { return { t: 'd', m: mode, o: o || 'root', g: g || 'root', mt: this.now(), k: {} }; };
  M.fileNode = function (c, mode, o, g) { return { t: 'f', m: mode == null ? 420 : mode, o: o || 'root', g: g || 'root', mt: this.now(), c: c || '' }; };
  M.norm = function (p, cwd) {
    p = String(p == null ? '' : p);
    if (p === '~' || p.indexOf('~/') === 0) p = this.user.home + p.slice(1);
    if (p.charAt(0) !== '/') p = (cwd || this.cwd) + '/' + p;
    var out = [], parts = p.split('/');
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (!s || s === '.') continue;
      if (s === '..') { out.pop(); continue; }
      out.push(s);
    }
    return '/' + out.join('/');
  };
  M.perm = function (node, bit) {
    var u = this.user;
    if (u.uid === 0) return bit === 1 && node.t === 'f' ? (node.m & 73) !== 0 : true;
    var cls = node.o === u.name ? (node.m >> 6) & 7 : (u.groups.indexOf(node.g) >= 0 ? (node.m >> 3) & 7 : node.m & 7);
    return (cls & bit) !== 0;
  };
  // find(abs, follow): {node} | {err, parent, name}
  M.find = function (abs, follow, depth) {
    depth = depth || 0;
    var parts = abs.split('/').filter(Boolean), node = this.root, cur = '';
    for (var i = 0; i < parts.length; i++) {
      if (node.t !== 'd') return { err: 'ENOTDIR' };
      if (!this.perm(node, 1)) return { err: 'EACCES' };
      var child = node.k[parts[i]], last = i === parts.length - 1;
      if (!child) return { err: 'ENOENT', parent: last ? node : null, name: parts[i] };
      cur += '/' + parts[i];
      if (child.t === 'l' && (follow || !last)) {
        if (depth > 8) return { err: 'ELOOP' };
        var tgt = child.l.charAt(0) === '/' ? child.l : dirname(cur) + '/' + child.l;
        var r = this.find(this.norm(tgt, '/'), true, depth + 1);
        if (r.err) return r;
        child = r.node;
      }
      node = child;
    }
    return { node: node };
  };
  M.mkdirp = function (path, mode, o, g) {
    var parts = this.norm(path, '/').split('/').filter(Boolean), node = this.root;
    for (var i = 0; i < parts.length; i++) {
      if (!node.k[parts[i]]) node.k[parts[i]] = this.dirNode(mode == null ? 493 : mode, o, g);
      node = node.k[parts[i]];
    }
    return node;
  };
  M.put = function (path, content, mode, o, g) {
    path = this.norm(path, '/');
    var d = this.mkdirp(dirname(path), 493, 'root', 'root');
    var n = this.fileNode(content, mode, o, g); d.k[basename(path)] = n; return n;
  };
  M.link = function (path, target) {
    path = this.norm(path, '/'); var d = this.mkdirp(dirname(path), 493, 'root', 'root');
    d.k[basename(path)] = { t: 'l', m: 511, o: 'root', g: 'root', mt: this.now(), l: target };
  };
  // programmatic read for the engine itself (no permission checks)
  M.sysRead = function (path) { var r = this.find(this.norm(path, '/'), true); return r.node && r.node.t === 'f' ? r.node.c : null; };
  M.sysWrite = function (path, text, append) {
    path = this.norm(path, '/'); var r = this.find(path, true);
    if (r.node) { r.node.c = append ? r.node.c + text : text; r.node.mt = this.now(); return; }
    this.put(path, text, 420, 'root', 'root');
  };
  M.sysAppendLog = function (path, line) { var cur = this.sysRead(path); this.sysWrite(path, (cur || '') + line + '\n'); };

  // user-checked operations (return error code string or null)
  M.stat = function (p, follow) {
    var abs = this.norm(p), r = this.find(abs, follow !== false);
    if (r.err) return { err: r.err, abs: abs, parent: r.parent, name: r.name };
    return { node: r.node, abs: abs };
  };
  M.readText = function (p) {
    var s = this.stat(p); if (s.err) return { err: s.err };
    if (s.node.t === 'd') return { err: 'EISDIR' };
    if (!this.perm(s.node, 4)) return { err: 'EACCES' };
    if (s.node.dev === 'null') return { text: '' };
    return { text: s.node.c, node: s.node, abs: s.abs };
  };
  M.canCreateIn = function (parent) { return parent && parent.t === 'd' && this.perm(parent, 2) && this.perm(parent, 1); };
  // write text; creates file if needed. returns error code or null
  M.writeText = function (p, text, append) {
    var s = this.stat(p);
    if (s.err === 'ENOENT' && s.parent) {
      if (!this.canCreateIn(s.parent)) return 'EACCES';
      if (text.length && this.diskFull && this.diskFull()) return 'ENOSPC';
      var n = this.fileNode(text, 438 & ~this.umask, this.user.name, this.user.groups[0]);
      s.parent.k[s.name] = n; s.parent.mt = this.now(); return null;
    }
    if (s.err) return s.err;
    if (s.node.t === 'd') return 'EISDIR';
    if (s.node.dev === 'null') return null;
    if (!this.perm(s.node, 2)) return 'EACCES';
    if (text.length && this.diskFull && this.diskFull()) return 'ENOSPC';
    s.node.c = append ? s.node.c + text : text; s.node.mt = this.now(); return null;
  };
  M.fsMsg = function (code) { return ERR[code] || code; };
  // can the shell write this redirect target? (checked before the command runs)
  M.checkWritable = function (p) {
    var s = this.stat(p);
    if (s.err === 'ENOENT') return s.parent && this.canCreateIn(s.parent) ? null : (s.parent ? 'EACCES' : 'ENOENT');
    if (s.err) return s.err;
    if (s.node.t === 'd') return 'EISDIR';
    if (s.node.dev === 'null') return null;
    return this.perm(s.node, 2) ? null : 'EACCES';
  };
  M.walk = function (abs, fn, depth) { // depth-first over real tree (no perms), fn(path,node,depth)
    var r = this.find(abs, false); if (!r.node) return;
    var self = this;
    (function rec(path, node, d) {
      fn(path, node, d);
      if (node.t === 'd') Object.keys(node.k).sort().forEach(function (k) { rec((path === '/' ? '' : path) + '/' + k, node.k[k], d + 1); });
    })(abs, r.node, 0);
  };

  // ---------------------------------------------------------------- formatting helpers
  M.fmtDate = function (ms) { var d = new Date(ms); return MON[d.getUTCMonth()] + ' ' + padL(d.getUTCDate(), 2) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); };
  M.fmtFull = function (ms) { var d = new Date(ms); return DAY[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + padL(d.getUTCDate(), 2) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' UTC ' + d.getUTCFullYear(); };
  M.syslogTime = function (ms) { var d = new Date(ms == null ? this.now() : ms); return MON[d.getUTCMonth()] + ' ' + padL(d.getUTCDate(), 2) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); };
  M.modeStr = function (n) {
    var s = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : '-', m = n.m, i, c = 'rwxrwxrwx';
    for (i = 0; i < 9; i++) s += (m & (256 >> i)) ? c[i] : '-';
    if (m & 2048) s = s.slice(0, 3) + (s[3] === 'x' ? 's' : 'S') + s.slice(4);
    if (m & 1024) s = s.slice(0, 6) + (s[6] === 'x' ? 's' : 'S') + s.slice(7);
    if (m & 512) s = s.slice(0, 9) + (s[9] === 'x' ? 't' : 'T');
    return s;
  };
  M.sizeOf = function (n) { return n.t === 'd' ? 4096 : n.t === 'l' ? n.l.length : (n.bytes != null ? n.bytes : n.c.length); };
  M.color = function (ctx, kind, text) { return ctx && ctx.tty ? '\u0001' + kind + '\u0002' + text + '\u0003' : text; };

  // ---------------------------------------------------------------- lexer
  function lex(line) {
    var i = 0, n = line.length, toks = [], cur = null;
    function push() { if (cur) { toks.push({ w: cur }); cur = null; } }
    while (i < n) {
      var c = line[i], j, s;
      if (c === ' ' || c === '\t') { push(); i++; continue; }
      if (c === '#' && !cur) break;
      if (c === '|') { push(); if (line[i + 1] === '|') { toks.push({ op: '||' }); i += 2; } else { toks.push({ op: '|' }); i++; } continue; }
      if (c === '&') {
        push();
        if (line[i + 1] === '&') { toks.push({ op: '&&' }); i += 2; }
        else if (line[i + 1] === '>') { toks.push({ op: '&>' }); i += 2; }
        else { toks.push({ op: ';' }); i++; }
        continue;
      }
      if (c === ';') { push(); toks.push({ op: ';' }); i++; continue; }
      if (c === '>' || c === '<') {
        var fd = null;
        if (cur && cur.length === 1 && cur[0].q === '' && /^[0-9]$/.test(cur[0].s)) { fd = cur[0].s; cur = null; } else push();
        var op = c; i++;
        if (c === '>' && line[i] === '>') { op = '>>'; i++; }
        else if (c === '<' && line[i] === '<') return { err: "here-documents are not supported in this practice shell (use echo, printf, tee or nano)" };
        if (line[i] === '&' && /[0-9]/.test(line[i + 1] || '')) { toks.push({ op: (fd || '1') + '>&' + line[i + 1] }); i += 2; continue; }
        toks.push({ op: (fd && fd !== '1' ? fd : '') + op }); continue;
      }
      if (!cur) cur = [];
      if (c === "'") {
        j = line.indexOf("'", i + 1);
        if (j < 0) return { err: "unexpected EOF while looking for matching `''" };
        cur.push({ s: line.slice(i + 1, j), q: "'" }); i = j + 1; continue;
      }
      if (c === '"') {
        j = i + 1; s = '';
        while (j < n && line[j] !== '"') {
          if (line[j] === '\\' && '"\\$`'.indexOf(line[j + 1]) >= 0) { s += (line[j + 1] === '$' ? '\u0005' : line[j + 1]); j += 2; }
          else if (line[j] === '$' && line[j + 1] === '(') { var d2 = 0, k = j + 1; do { if (line[k] === '(') d2++; else if (line[k] === ')') d2--; k++; } while (k < n && d2 > 0); s += line.slice(j, k); j = k; }
          else { s += line[j]; j++; }
        }
        if (j >= n) return { err: "unexpected EOF while looking for matching `\"'" };
        cur.push({ s: s, q: '"' }); i = j + 1; continue;
      }
      if (c === '\\') { cur.push({ s: line[i + 1] || '', q: "'" }); i += 2; continue; }
      if (c === '$' && line[i + 1] === '(') {
        var depth = 0, k2 = i + 1;
        do { if (line[k2] === '(') depth++; else if (line[k2] === ')') depth--; k2++; } while (k2 < n && depth > 0);
        cur.push({ s: line.slice(i, k2), q: '' }); i = k2; continue;
      }
      s = '';
      while (i < n && ' \t|&;<>\'"\\'.indexOf(line[i]) < 0 && !(line[i] === '$' && line[i + 1] === '(')) { s += line[i]; i++; }
      if (s) cur.push({ s: s, q: '' }); else { cur.push({ s: line[i], q: '' }); i++; }
    }
    push();
    return { toks: toks };
  }

  // ---------------------------------------------------------------- expansion
  M.expandVars = function (s, quoted) {
    var self = this;
    s = s.replace(/\$\(\(([^()]*(?:\([^()]*\)[^()]*)*)\)\)/g, function (_, ex) {
      var e = ex.replace(/\$?([A-Za-z_][A-Za-z0-9_]*)/g, function (m, v) { var x = self.getVar(v); return /^-?\d+$/.test(x) ? x : '0'; });
      if (!/^[0-9+\-*\/%() .]+$/.test(e)) return '0';
      try { return String(Math.trunc(Function('"use strict";return (' + e + ')')())); } catch (err) { return '0'; }
    });
    s = s.replace(/\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, function (_, cmd) { return self.captureLine(cmd); });
    s = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, function (_, v, d) { var x = self.getVar(v); return x === '' && d !== undefined ? d : x; });
    s = s.replace(/\$([A-Za-z_][A-Za-z0-9_]*|\?|\$|#|0)/g, function (_, v) { return v === '?' ? String(self.lastCode) : v === '$' ? '1203' : v === '#' ? '0' : v === '0' ? 'bash' : self.getVar(v); });
    return s.replace(/\u0005/g, '$');
  };
  M.getVar = function (v) { return Object.prototype.hasOwnProperty.call(this.vars, v) ? this.vars[v] : ''; };
  function braceExpand(w) {
    var m = /\{([^{}]*)\}/.exec(w);
    if (!m) return [w];
    var pre = w.slice(0, m.index), post = w.slice(m.index + m[0].length), body = m[1], parts;
    var r = /^(-?\d+)\.\.(-?\d+)$/.exec(body);
    if (r) { var a = parseInt(r[1], 10), b = parseInt(r[2], 10); parts = []; if (a <= b) for (; a <= b; a++) parts.push(String(a)); else for (; a >= b; a--) parts.push(String(a)); }
    else if (body.indexOf(',') >= 0) parts = body.split(',');
    else return [w];
    var out = [];
    parts.forEach(function (p) { braceExpand(pre + p + post).forEach(function (x) { out.push(x); }); });
    return out;
  }
  function globToRe(pat) {
    var re = '^', i, c;
    for (i = 0; i < pat.length; i++) {
      c = pat[i];
      if (c === '\u0004') { re += escRe(pat[++i] || ''); }
      else if (c === '*') re += '[^/]*';
      else if (c === '?') re += '[^/]';
      else if (c === '[') { var j = pat.indexOf(']', i + 1); if (j > i) { re += '[' + pat.slice(i + 1, j).replace(/^!/, '^') + ']'; i = j; } else re += '\\['; }
      else re += escRe(c);
    }
    return new RegExp(re + '$');
  }
  M.glob = function (pat) { // pat may contain \u0004-escaped literals
    var abs = pat.charAt(0) === '/', comps = pat.split('/').filter(function (x) { return x !== ''; });
    var bases = [abs ? '/' : ''];
    for (var ci = 0; ci < comps.length; ci++) {
      var comp = comps[ci], next = [], hasMeta = /[*?\[]/.test(comp.replace(/\u0004./g, ''));
      for (var bi = 0; bi < bases.length; bi++) {
        var base = bases[bi];
        if (!hasMeta) { next.push((base === '/' ? '' : base) + (base === '' && !abs ? '' : (base === '' ? '' : '/')) + comp.replace(/\u0004/g, '')); continue; }
        var dirPath = base === '' ? this.cwd : base, d = this.find(this.norm(dirPath), true);
        if (!d.node || d.node.t !== 'd' || !this.perm(d.node, 4)) continue;
        var re = globToRe(comp), showDot = comp.charAt(0) === '.';
        Object.keys(d.node.k).sort().forEach(function (name) {
          if (name.charAt(0) === '.' && !showDot) return;
          if (re.test(name)) next.push((base === '/' ? '/' : base === '' ? '' : base + '/') + name);
        });
      }
      bases = next;
    }
    return bases.filter(function (p) { return p !== ''; });
  };
  M.expandWord = function (segs) {
    var self = this, str = '', pat = '', hasGlob = false, hadVar = false, quotedAny = false, first = true;
    segs.forEach(function (seg) {
      var t = seg.s;
      if (seg.q !== "'") { var t2 = self.expandVars(t, seg.q === '"'); if (t2 !== t) hadVar = true; t = t2; }
      if (seg.q === '' && first && t.charAt(0) === '~' && (t.length === 1 || t.charAt(1) === '/')) t = self.user.home + t.slice(1);
      first = false;
      if (seg.q) quotedAny = true;
      str += t;
      if (seg.q) pat += t.replace(/[*?\[\]\\]/g, function (ch) { return '\u0004' + ch; });
      else { pat += t; if (/[*?\[]/.test(t)) hasGlob = true; }
    });
    var words = [str], pats = [pat];
    if (!quotedAny && /\{[^{}]*[,.][^{}]*\}/.test(str)) { words = braceExpand(str); pats = words.slice(); }
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (hasGlob) { var g = this.glob(pats[i]); if (g.length) { out = out.concat(g); continue; } }
      if (hadVar && !quotedAny && segs.length === 1 && /\s/.test(w)) { out = out.concat(w.split(/\s+/).filter(Boolean)); continue; }
      out.push(w.replace(/\u0004/g, ''));
    }
    return out;
  };

  // ---------------------------------------------------------------- output plumbing
  M.emit = function (kind, text) {
    var lines = String(text).split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    for (var i = 0; i < lines.length; i++) this.screen.push({ k: kind, s: lines[i] });
  };
  M.captureLine = function (cmd) {
    if (this.depth > 5) return '';
    var cap = [], save = this.lastCode;
    this.depth++; this.execLine(cmd, cap); this.depth--;
    this.lastCode = save;
    return cap.join('').replace(/\n+$/, '');
  };

  // ---------------------------------------------------------------- command execution
  M.prompt = function () {
    var u = this.user, dir = this.cwd === u.home ? '~' : (this.cwd.indexOf(u.home + '/') === 0 ? '~' + this.cwd.slice(u.home.length) : this.cwd);
    return u.name + '@' + this.hostname + ':' + dir + (u.uid === 0 ? '# ' : '$ ');
  };
  M.run = function (line) {
    this.screen = []; this.ticks++; this.editor = null;
    line = String(line).replace(/\s+$/, '');
    if (!line.trim()) return this.screen;
    var t = line.trim();
    if (t === '!!') { line = this.hist[this.hist.length - 1] || ''; this.emit('out', line); }
    else if (/^!\d+$/.test(t)) { line = this.hist[parseInt(t.slice(1), 10) - 1] || ''; this.emit('out', line); }
    else if (/^!sudo|^sudo !!$/.test(t)) { line = 'sudo ' + (this.hist[this.hist.length - 1] || ''); this.emit('out', line); }
    if (!line) return this.screen;
    this.hist.push(line);
    this.depth = 0;
    this.execLine(line, null);
    this.lineLog.push({ line: line, code: this.lastCode, uid: this.user.uid });
    if (this.lineLog.length > 300) this.lineLog.shift();
    return this.screen;
  };
  M.did = function (re, okOnly) { return this.lineLog.some(function (l) { return re.test(l.line) && (!okOnly || l.code === 0); }); };

  // ---- compound statements: for / while / if (one-liners and multi-line script blocks)
  function splitTop(s, kw) { // split on ';' that are not inside quotes
    var out = [], cur = '', q = null, i;
    for (i = 0; i < s.length; i++) { var ch = s[i]; if (q) { cur += ch; if (ch === q) q = null; } else if (ch === '"' || ch === "'") { q = ch; cur += ch; } else if (ch === ';') { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }
  M.execCompound = function (line, capture) {
    var self = this, t = line.trim(), m;
    if ((m = /^for\s+(\w+)\s+in\s+(.*?);\s*do\s+(.*?);?\s*done\s*$/.exec(t))) {
      var lx = lex(m[2]); if (lx.err) return null;
      var items = []; lx.toks.forEach(function (tk) { if (tk.w) items = items.concat(self.expandWord(tk.w)); });
      var code = 0, guard = 0;
      for (var i = 0; i < items.length && guard++ < 200; i++) { this.vars[m[1]] = items[i]; code = this.execLine(m[3], capture); }
      return code;
    }
    if ((m = /^while\s+(.*?);\s*do\s+(.*?);?\s*done\s*$/.exec(t))) {
      var guard2 = 0, code2 = 0;
      while (guard2++ < 50) { if (this.execLine(m[1], []) !== 0) break; code2 = this.execLine(m[2], capture); }
      return code2;
    }
    if ((m = /^if\s+(.*?);\s*then\s+(.*?)(?:;\s*else\s+(.*?))?;?\s*fi\s*$/.exec(t))) {
      var cond = this.execLine(m[1], []);
      if (cond === 0) return this.execLine(m[2], capture);
      return m[3] ? this.execLine(m[3], capture) : 0;
    }
    return null;
  };

  // locate the first top-level for/while/if ... done/fi block: returns {start,end} or null
  function findBlock(line) {
    var i = 0, n = line.length, q = null, depth = 0, start = -1, word = '', wstart = 0;
    function flush(endIdx) {
      if (!word) return null;
      var w = word; word = '';
      if (w === 'for' || w === 'while' || w === 'if') { if (depth === 0) start = wstart; depth++; }
      else if ((w === 'done' || w === 'fi') && depth > 0) { depth--; if (depth === 0) return endIdx; }
      return null;
    }
    for (; i <= n; i++) {
      var ch = i < n ? line[i] : ' ';
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; word = ''; continue; }
      if (/[A-Za-z]/.test(ch)) { if (!word) wstart = i; word += ch; continue; }
      var prevOk = i - word.length === 0 || /[\s;&|(]/.test(line[i - word.length - 1] || ' ');
      if (word && !prevOk) word = '';
      var e = flush(i); if (e !== null) return { start: start, end: e };
    }
    return null;
  }
  M.execLine = function (line, capture) {
    if (/\b(for|while|if)\b/.test(line)) {
      var blk = findBlock(line);
      if (blk) {
        var before = line.slice(0, blk.start).replace(/(;|&&|\|\|)\s*$/, '').trim(), after = line.slice(blk.end).replace(/^\s*(;|&&|\|\|)?\s*/, '').trim();
        if (before) this.execLine(before, capture);
        var cc = this.execCompound(line.slice(blk.start, blk.end), capture);
        if (cc !== null) { this.lastCode = cc; if (after) return this.execLine(after, capture); return cc; }
      }
    }
    var lx = lex(line);
    if (lx.err) { this.emit('err', 'bash: ' + lx.err); this.lastCode = 2; return 2; }
    var toks = lx.toks, items = [], stages = [], stage = [], i;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.op === '|') { stages.push(stage); stage = []; }
      else if (t.op === '&&' || t.op === '||' || t.op === ';') {
        stages.push(stage); items.push({ stages: stages, op: t.op }); stages = []; stage = [];
      } else stage.push(t);
    }
    stages.push(stage); items.push({ stages: stages, op: null });
    var prev = ';', code = this.lastCode;
    for (i = 0; i < items.length; i++) {
      var it = items[i], onlyEmpty = it.stages.length === 1 && it.stages[0].length === 0;
      if (onlyEmpty) { if (it.op) { prev = it.op; } continue; }
      if (!((prev === '&&' && code !== 0) || (prev === '||' && code === 0))) {
        code = this.runPipeline(it.stages, capture);
        this.lastCode = code;
      }
      prev = it.op || ';';
    }
    return code;
  };
  M.parseStage = function (toks) {
    var words = [], redirs = [], i;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.op) {
        if (/^(2>&1|1>&2)$/.test(t.op)) { redirs.push({ op: t.op }); continue; }
        var nx = toks[i + 1];
        if (!nx || !nx.w) return { err: "syntax error near unexpected token `" + (nx && nx.op ? nx.op : 'newline') + "'" };
        redirs.push({ op: t.op, w: nx.w }); i++;
      } else words.push(t.w);
    }
    return { words: words, redirs: redirs };
  };
  M.runPipeline = function (stages, capture) {
    var stdin = '', code = 0, i;
    for (i = 0; i < stages.length; i++) {
      var st = this.parseStage(stages[i]);
      if (st.err) { this.emit('err', 'bash: ' + st.err); return 2; }
      var r = this.runStage(st, stdin, i === stages.length - 1, capture);
      code = r.code; stdin = r.stdout;
    }
    return code;
  };
  M.runStage = function (st, stdin, isLast, capture) {
    var self = this, i, args = [];
    var assigns = [];
    var wi = 0;
    while (wi < st.words.length) {
      var w0 = st.words[wi], m = w0[0] && w0[0].q === '' ? /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(w0[0].s) : null;
      if (!m) break;
      var rest = [{ s: m[2], q: '' }].concat(w0.slice(1));
      assigns.push([m[1], this.expandWord(rest).join(' ')]); wi++;
    }
    for (i = wi; i < st.words.length; i++) args = args.concat(this.expandWord(st.words[i]));
    // redirections
    var outFile = null, outAppend = false, errFile = null, errAppend = false, errToOut = false, bothFile = null, inText = null, bad = false;
    for (i = 0; i < st.redirs.length; i++) {
      var rd = st.redirs[i];
      if (rd.op === '2>&1') { errToOut = true; continue; }
      if (rd.op === '1>&2') continue;
      var target = this.expandWord(rd.w)[0] || '';
      if (rd.op === '<') {
        var rr = this.readText(target);
        if (rr.err) { this.emit('err', 'bash: ' + target + ': ' + this.fsMsg(rr.err)); bad = true; } else inText = rr.text;
        continue;
      }
      var ck = this.checkWritable(target);
      if (ck) { this.emit('err', 'bash: ' + target + ': ' + this.fsMsg(ck)); bad = true; continue; }
      if (rd.op === '>' || rd.op === '>>') { outFile = target; outAppend = rd.op === '>>'; }
      else if (rd.op === '2>' || rd.op === '2>>') { errFile = target; errAppend = rd.op === '2>>'; }
      else if (rd.op === '&>') { bothFile = target; }
    }
    if (bad) return { code: 1, stdout: '' };
    if (inText !== null) stdin = inText;
    var ctx = new Ctx(this, stdin, isLast && outFile === null && bothFile === null && !capture ? true : false);
    var code = 0;
    if (!args.length) {
      assigns.forEach(function (a) { self.vars[a[0]] = a[1]; });
    } else {
      var saved = {};
      assigns.forEach(function (a) { saved[a[0]] = self.vars[a[0]]; self.vars[a[0]] = a[1]; });
      code = this.dispatch(args, ctx);
      assigns.forEach(function (a) { if (saved[a[0]] === undefined) delete self.vars[a[0]]; else self.vars[a[0]] = saved[a[0]]; });
    }
    var outStr = '', errStr = '', logOrder = ctx.log;
    for (i = 0; i < logOrder.length; i++) { if (logOrder[i][0] === 'o') outStr += logOrder[i][1]; else errStr += logOrder[i][1]; }
    if (ctx.cleared) this.screen.push({ k: 'clear', s: '' });
    // stderr
    if (errFile !== null) { this.writeText(errFile, errStr, errAppend); }
    else if (errStr && !errToOut && bothFile === null) this.emit('err', errStr);
    // stdout
    if (errToOut) { outStr = ''; logOrder.forEach(function (e) { outStr += e[1]; }); }
    if (bothFile !== null) { this.writeText(bothFile, outStr + (errToOut ? '' : errStr), false); outStr = ''; }
    else if (outFile !== null) { this.writeText(outFile, outStr, outAppend); outStr = ''; }
    else if (isLast) {
      if (capture) { capture.push(outStr); } else if (outStr) { this.emitOut(outStr, ctx); }
      outStr = '';
    }
    this.cmdlog.push({ name: args[0] || '', args: args.slice(1), code: code, uid: this.user.uid, line: args.join(' '), li: this.lineLog.length });
    if (this.cmdlog.length > 400) this.cmdlog.shift();
    return { code: code, stdout: outStr };
  };
  M.emitOut = function (text, ctx) { this.emit('out', text); };

  function Ctx(m, stdin, tty) { this.m = m; this.stdin = stdin || ''; this.tty = tty; this.log = []; }
  Ctx.prototype.out = function (s) { this.log.push(['o', s + '\n']); };
  Ctx.prototype.raw = function (s) { this.log.push(['o', s]); };
  Ctx.prototype.err = function (s) { this.log.push(['e', s + '\n']); };
  LX.Ctx = Ctx;

  M.findCmd = function (name) {
    if (this.cmds[name] && this.cmdAvailable(name)) return this.cmds[name];
    return null;
  };
  M.cmdAvailable = function (name) {
    var need = this.cmdNeeds && this.cmdNeeds[name];
    return !need || (this.pkgInstalled && this.pkgInstalled(need));
  };
  M.dispatch = function (args, ctx) {
    var name = args[0];
    if (this.aliases[name] && !ctx.noAlias) {
      var al = this.aliases[name].split(/\s+/);
      args = al.concat(args.slice(1)); name = args[0];
    }
    if (this.builtins[name]) return this.builtins[name].call(this, args.slice(1), ctx);
    if (name.indexOf('/') >= 0) return this.runPath(name, args.slice(1), ctx);
    var fn = this.findCmd(name);
    if (fn) {
      if (this.helpable && args.length === 2 && args[1] === '--help' && this.man[name]) { ctx.out(this.manUsage(name)); return 0; }
      return fn.call(this, args.slice(1), ctx, name);
    }
    var hint = this.cmdNeeds && this.cmdNeeds[name];
    if (hint && this.cmds[name]) {
      ctx.err("Command '" + name + "' not found, but can be installed with:");
      ctx.err('sudo apt install ' + hint);
    } else ctx.err(name + ': command not found');
    return 127;
  };
  // run a script file (./deploy.sh) — needs the x bit
  M.runPath = function (path, args, ctx) {
    var s = this.stat(path);
    if (s.err) { ctx.err('bash: ' + path + ': ' + this.fsMsg(s.err)); return 127; }
    if (s.node.t === 'd') { ctx.err('bash: ' + path + ': Is a directory'); return 126; }
    if (!this.perm(s.node, 1)) { ctx.err('bash: ' + path + ': Permission denied'); return 126; }
    return this.runScript(s.node.c, args, ctx, s.abs);
  };
  M.runScript = function (text, args, ctx, abs) {
    var self = this, lines = text.split('\n'), code = 0, saveVars = {};
    if (this.depth > 4) { ctx.err('bash: too many nested scripts'); return 1; }
    this.depth++;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln || ln.charAt(0) === '#') continue;
      if (/^(for|while|if)\s/.test(ln) && !/(done|fi)\s*$/.test(ln)) {
        var block = [ln], depth2 = 1;
        while (++i < lines.length && depth2 > 0) { var l2 = lines[i].trim(); if (!l2 || l2.charAt(0) === '#') continue; if (/^(for|while|if)\s/.test(l2)) depth2++; if (/^(done|fi)\b/.test(l2)) depth2--; block.push(l2); }
        i--; ln = block.join('; ').replace(/;\s*do;/g, '; do').replace(/;\s*then;/g, '; then').replace(/\bdo;\s*/g, 'do ').replace(/\bthen;\s*/g, 'then ').replace(/\belse;\s*/g, 'else ');
      }
      var cap = [];
      var mark = this.screen.length;
      code = this.execLine(ln, cap);
      if (cap.length) ctx.raw(cap.join(''));
      // lines emitted to the screen by nested execution belong to this command's output
      var extra = this.screen.splice(mark);
      extra.forEach(function (e) { if (e.k === 'err') ctx.err(e.s); else ctx.out(e.s); });
      if (code !== 0 && /^set -e/.test(text)) break;
    }
    this.depth--;
    return code;
  };

  // ---------------------------------------------------------------- shell builtins
  var B = M.builtins;
  B.cd = function (args, ctx) {
    var t = args[0];
    if (t === undefined || t === '~') t = this.user.home;
    else if (t === '-') { t = this.oldpwd; ctx.out(t); }
    var s = this.stat(t);
    if (s.err) { ctx.err('bash: cd: ' + (args[0] === undefined ? t : args[0]) + ': ' + this.fsMsg(s.err)); return 1; }
    if (s.node.t !== 'd') { ctx.err('bash: cd: ' + args[0] + ': Not a directory'); return 1; }
    if (!this.perm(s.node, 1)) { ctx.err('bash: cd: ' + args[0] + ': Permission denied'); return 1; }
    this.oldpwd = this.cwd; this.cwd = s.abs; this.vars.PWD = s.abs; return 0;
  };
  B.pwd = function (args, ctx) { ctx.out(this.cwd); return 0; };
  B.echo = function (args, ctx) {
    var nl = true, esc = false;
    while (args.length && /^-[neE]+$/.test(args[0])) { if (args[0].indexOf('n') >= 0) nl = false; if (args[0].indexOf('e') >= 0) esc = true; args = args.slice(1); }
    var s = args.join(' ');
    if (esc) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    ctx.raw(s + (nl ? '\n' : '')); return 0;
  };
  B.export = function (args, ctx) {
    var self = this;
    if (!args.length) { Object.keys(this.exported).sort().forEach(function (k) { ctx.out('declare -x ' + k + '="' + self.getVar(k) + '"'); }); return 0; }
    args.forEach(function (a) { var m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/.exec(a); if (!m) { ctx.err("bash: export: `" + a + "': not a valid identifier"); return; } if (m[2] !== undefined) self.vars[m[1]] = m[2]; self.exported[m[1]] = 1; });
    return 0;
  };
  B.unset = function (args) { var self = this; args.forEach(function (a) { delete self.vars[a]; delete self.exported[a]; }); return 0; };
  B.env = B.printenv = function (args, ctx) {
    var self = this;
    if (args.length && !/=/.test(args[0]) && args[0][0] !== '-') { var v = this.vars[args[0]]; if (v === undefined) return 1; ctx.out(v); return 0; }
    Object.keys(this.exported).sort().forEach(function (k) { ctx.out(k + '=' + self.getVar(k)); }); return 0;
  };
  B.alias = function (args, ctx) {
    var self = this;
    if (!args.length) { Object.keys(this.aliases).sort().forEach(function (k) { ctx.out("alias " + k + "='" + self.aliases[k] + "'"); }); return 0; }
    args.forEach(function (a) { var m = /^([^=]+)=(.*)$/.exec(a); if (m) self.aliases[m[1]] = m[2]; else if (self.aliases[a]) ctx.out("alias " + a + "='" + self.aliases[a] + "'"); else ctx.err('bash: alias: ' + a + ': not found'); });
    return 0;
  };
  B.unalias = function (args) { var self = this; args.forEach(function (a) { delete self.aliases[a]; }); return 0; };
  B.history = function (args, ctx) {
    if (args[0] === '-c') { this.hist = []; return 0; }
    var n = parseInt(args[0], 10), start = n > 0 ? Math.max(0, this.hist.length - n) : 0;
    for (var i = start; i < this.hist.length; i++) ctx.out(padL(i + 1, 5) + '  ' + this.hist[i]);
    return 0;
  };
  B.clear = function (args, ctx) { ctx.cleared = true; return 0; };
  B.exit = B.logout = function (args, ctx) {
    if (this.userStack.length) { this.user = this.userStack.pop(); this.cwd = this.user.home; this.vars.HOME = this.user.home; this.vars.USER = this.user.name; ctx.out('logout'); return 0; }
    ctx.out('logout');
    ctx.out('(This is the only session — the practice server stays on. Keep going!)');
    return 0;
  };
  B.umask = function (args, ctx) {
    if (!args.length) { ctx.out('0' + padL(this.umask.toString(8), 3).replace(/ /g, '0')); return 0; }
    var v = parseInt(args[0], 8); if (isNaN(v)) { ctx.err('bash: umask: ' + args[0] + ': octal number out of range'); return 1; } this.umask = v; return 0;
  };
  B.source = B['.'] = function (args, ctx) {
    var r = this.readText(args[0] || ''); if (r.err) { ctx.err('bash: ' + args[0] + ': ' + this.fsMsg(r.err)); return 1; }
    return this.runScript(r.text, args.slice(1), ctx, r.abs);
  };
  B.type = function (args, ctx) {
    var self = this, code = 0;
    args.forEach(function (a) {
      if (self.builtins[a]) ctx.out(a + ' is a shell builtin');
      else if (self.aliases[a]) ctx.out(a + " is aliased to `" + self.aliases[a] + "'");
      else if (self.findCmd(a)) ctx.out(a + ' is /usr/bin/' + a);
      else { ctx.err('bash: type: ' + a + ': not found'); code = 1; }
    });
    return code;
  };
  B.command = function (args, ctx) {
    if (args[0] === '-v') { var a = args[1]; if (this.builtins[a]) ctx.out(a); else if (this.findCmd(a)) ctx.out('/usr/bin/' + a); else return 1; return 0; }
    ctx.noAlias = true; return this.dispatch(args, ctx);
  };
  B[':'] = B['true'] = function () { return 0; };
  B['false'] = function () { return 1; };
  B.test = B['['] = function (args, ctx) {
    var self = this;
    if (args[args.length - 1] === ']') args = args.slice(0, -1);
    var neg = false; if (args[0] === '!') { neg = true; args = args.slice(1); }
    var r = false, a = args;
    function st(p) { return self.stat(p); }
    if (a.length === 1) r = a[0] !== '';
    else if (a.length === 2) {
      var f = a[0], v = a[1], s;
      if (f === '-z') r = v === ''; else if (f === '-n') r = v !== '';
      else if (f === '-e') r = !st(v).err; else if (f === '-f') { s = st(v); r = !s.err && s.node.t === 'f'; }
      else if (f === '-d') { s = st(v); r = !s.err && s.node.t === 'd'; }
      else if (f === '-r') { s = st(v); r = !s.err && self.perm(s.node, 4); } else if (f === '-w') { s = st(v); r = !s.err && self.perm(s.node, 2); }
      else if (f === '-x') { s = st(v); r = !s.err && self.perm(s.node, 1); } else if (f === '-s') { s = st(v); r = !s.err && self.sizeOf(s.node) > 0; }
      else if (f === '-L') { s = st(v) ; r = false; }
    } else if (a.length === 3) {
      var x = a[0], op = a[1], y = a[2], nx = parseFloat(x), ny = parseFloat(y);
      if (op === '=' || op === '==') r = x === y; else if (op === '!=') r = x !== y;
      else if (op === '-eq') r = nx === ny; else if (op === '-ne') r = nx !== ny; else if (op === '-gt') r = nx > ny;
      else if (op === '-lt') r = nx < ny; else if (op === '-ge') r = nx >= ny; else if (op === '-le') r = nx <= ny;
    }
    return (neg ? !r : r) ? 0 : 1;
  };

  // ---------------------------------------------------------------- tab completion
  M.complete = function (buf) {
    var m = /^(.*?)(\S*)$/.exec(buf), before = m[1], word = m[2], isCmd = !/\S/.test(before) || /[|;&]\s*$/.test(before) || /^\s*sudo\s+$/.test(before);
    var cands = [], self = this;
    if (isCmd && word.indexOf('/') < 0) {
      var names = Object.keys(this.cmds).concat(Object.keys(this.builtins));
      names.forEach(function (n) { if (n.indexOf(word) === 0 && (self.builtins[n] || self.cmdAvailable(n)) && cands.indexOf(n) < 0) cands.push(n); });
    } else {
      var slash = word.lastIndexOf('/'), dirPart = slash >= 0 ? word.slice(0, slash + 1) : '', namePart = word.slice(slash + 1);
      var d = this.find(this.norm(dirPart || '.'), true);
      if (d.node && d.node.t === 'd' && this.perm(d.node, 4)) {
        Object.keys(d.node.k).sort().forEach(function (k) {
          if (k.indexOf(namePart) === 0 && (k.charAt(0) !== '.' || namePart.charAt(0) === '.')) cands.push(dirPart + k + (d.node.k[k].t === 'd' ? '/' : ''));
        });
      }
    }
    cands.sort();
    return { before: before, word: word, matches: cands };
  };

  LX.lex = lex;
})(typeof window !== 'undefined' ? window : global);
