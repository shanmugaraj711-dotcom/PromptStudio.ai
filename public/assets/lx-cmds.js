/* lx-cmds.js — everyday Linux commands for the browser server (files, text, permissions, help). */
(function (root) {
  'use strict';
  var LX = root.LX, M = LX.Machine.prototype, C = M.cmds, U = LX.util;
  var p2 = U.p2, padR = U.padR, padL = U.padL, human = U.human, basename = U.basename, dirname = U.dirname, escRe = U.escRe;

  function parseArgs(args, valued) {
    var f = {}, v = {}, rest = [], long = {}, done = false;
    valued = valued || '';
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (done || a === '-' || a.charAt(0) !== '-') { rest.push(a); continue; }
      if (a === '--') { done = true; continue; }
      if (a.slice(0, 2) === '--') { var eq = a.indexOf('='); if (eq > 0) long[a.slice(2, eq)] = a.slice(eq + 1); else long[a.slice(2)] = true; continue; }
      for (var j = 1; j < a.length; j++) {
        var c = a.charAt(j);
        if (valued.indexOf(c) >= 0) { var val = a.slice(j + 1); if (!val) val = args[++i]; v[c] = val; break; }
        f[c] = true;
      }
    }
    return { f: f, v: v, rest: rest, long: long };
  }
  LX.parseArgs = parseArgs;
  function man(name, syn, desc, ex, flags) { M.man[name] = { syn: syn, desc: desc, ex: ex || [], flags: flags || {} }; }
  LX.defMan = man;
  M.helpable = true;
  M.manUsage = function (name) {
    var m = this.man[name]; return 'Usage: ' + m.syn + '\n' + m.desc;
  };
  // inputs: files or stdin. returns array of {name,text}; prints errors
  M.inputs = function (ctx, files, cmd) {
    var self = this, out = [], bad = 0;
    if (!files.length) return { items: [{ name: '-', text: ctx.stdin }], bad: 0 };
    files.forEach(function (f) {
      if (f === '-') { out.push({ name: '-', text: ctx.stdin }); return; }
      var r = self.readText(f);
      if (r.err) { ctx.err(cmd + ': ' + f + ': ' + self.fsMsg(r.err)); bad++; } else out.push({ name: f, text: r.text });
    });
    return { items: out, bad: bad };
  };
  function lines(t) { if (t === '') return []; var a = t.split('\n'); if (a[a.length - 1] === '') a.pop(); return a; }
  function pat2re(pat, o) { // BRE/ERE -> JS
    var src = '';
    if (o.F) src = escRe(pat);
    else if (o.E || o.P) src = pat.replace(/\\</g, '\\b').replace(/\\>/g, '\\b');
    else {
      for (var i = 0; i < pat.length; i++) {
        var c = pat[i];
        if (c === '\\' && '(){}|+?'.indexOf(pat[i + 1]) >= 0) { src += pat[i + 1]; i++; }
        else if (c === '\\' && (pat[i + 1] === '<' || pat[i + 1] === '>')) { src += '\\b'; i++; }
        else if ('+?|(){}'.indexOf(c) >= 0) src += '\\' + c;
        else src += c;
      }
    }
    if (o.w) src = '\\b(?:' + src + ')\\b';
    if (o.x) src = '^(?:' + src + ')$';
    try { return new RegExp(src, o.i ? 'i' : ''); } catch (e) { return null; }
  }

  // ======================================================================= ls
  C.ls = function (args, ctx) {
    var self = this, o = parseArgs(args, ''), f = o.f, targets = o.rest.length ? o.rest : ['.'], code = 0;
    if (o.long.all) f.a = true; if (o.long['human-readable']) f.h = true;
    if (f.A && !f.a) f.A = true;
    var multi = targets.length > 1 || f.R, first = true;
    function name(n, nm) {
      var k = n.t === 'd' ? 'd' : n.t === 'l' ? 'l' : (n.m & 73 ? 'x' : 'f');
      var t = nm + (f.F ? (n.t === 'd' ? '/' : n.t === 'l' ? '@' : (n.m & 73 ? '*' : '')) : '');
      return self.color(ctx, k, t);
    }
    function sortEntries(arr) {
      arr.sort(function (a, b) {
        var x = a.name.replace(/^\./, '').toLowerCase(), y = b.name.replace(/^\./, '').toLowerCase();
        var r = x < y ? -1 : x > y ? 1 : 0;
        if (f.S) r = self.sizeOf(b.node) - self.sizeOf(a.node); else if (f.t) r = b.node.mt - a.node.mt;
        return f.r ? -r : r;
      });
      return arr;
    }
    function listDir(abs, node, label) {
      var ents = [];
      if (f.a) { ents.push({ name: '.', node: node }); ents.push({ name: '..', node: node }); }
      Object.keys(node.k).forEach(function (k) { if (k.charAt(0) === '.' && !f.a && !f.A) return; ents.push({ name: k, node: node.k[k] }); });
      sortEntries(ents);
      if (multi) { if (!first) ctx.out(''); ctx.out(label + ':'); }
      first = false;
      if (f.l) {
        var total = 0; ents.forEach(function (e) { total += Math.ceil(self.sizeOf(e.node) / 1024) * (self.sizeOf(e.node) ? 1 : 0) + (e.node.t === 'd' ? 4 : 0); });
        ctx.out('total ' + total);
        printLong(ents);
      } else printShort(ents);
      if (f.R) {
        ents.forEach(function (e) { if (e.node.t === 'd' && e.name !== '.' && e.name !== '..') { if (self.perm(e.node, 4)) listDir((abs === '/' ? '' : abs) + '/' + e.name, e.node, (label === '/' ? '' : label) + '/' + e.name); } });
      }
    }
    function printShort(ents) {
      if (!ents.length) return;
      if (ctx.tty && !f['1']) ctx.out(ents.map(function (e) { return name(e.node, e.name); }).join('  '));
      else ents.forEach(function (e) { ctx.out(name(e.node, e.name)); });
    }
    function printLong(ents) {
      var rows = ents.map(function (e) {
        var n = e.node, links = n.t === 'd' ? 2 + Object.keys(n.k).filter(function (k) { return n.k[k].t === 'd'; }).length : 1;
        var sz = self.sizeOf(n);
        return { mode: self.modeStr(n), links: links, o: n.o, g: n.g, size: f.h ? human(sz) : String(sz), date: self.fmtDate(n.mt), nm: name(n, e.name) + (n.t === 'l' ? ' -> ' + n.l : '') };
      });
      var wl = 0, wo = 0, wg = 0, ws = 0;
      rows.forEach(function (r) { wl = Math.max(wl, String(r.links).length); wo = Math.max(wo, r.o.length); wg = Math.max(wg, r.g.length); ws = Math.max(ws, r.size.length); });
      rows.forEach(function (r) { ctx.out(r.mode + ' ' + padL(r.links, wl) + ' ' + padR(r.o, wo) + ' ' + padR(r.g, wg) + ' ' + padL(r.size, ws) + ' ' + r.date + ' ' + r.nm); });
    }
    var fileItems = [], dirItems = [];
    targets.forEach(function (t) {
      var s = self.stat(t, !f.d && !f.l);
      if (s.err) { ctx.err("ls: cannot access '" + t + "': " + self.fsMsg(s.err)); code = 2; return; }
      if (s.node.t === 'd' && !f.d) {
        if (!self.perm(s.node, 4)) { ctx.err("ls: cannot open directory '" + t + "': Permission denied"); code = 2; return; }
        dirItems.push({ t: t, abs: s.abs, node: s.node });
      } else fileItems.push({ name: t, node: s.node });
    });
    if (fileItems.length) { if (f.l) printLong(fileItems); else printShort(fileItems); first = false; }
    dirItems.forEach(function (d) { listDir(d.abs, d.node, d.t); });
    return code;
  };
  man('ls', 'ls [OPTION]... [FILE]...', 'List what is inside a folder.', ['ls', 'ls -la', 'ls -lh /var/log'],
    { '-l': 'long format: permissions, owner, size, date', '-a': 'show hidden files (names starting with a dot)', '-h': 'human-readable sizes (K, M, G)', '-R': 'also list sub-folders', '-t': 'newest first', '-r': 'reverse the order', '-S': 'biggest first', '-1': 'one name per line' });

  // ======================================================================= cat / head / tail
  C.cat = function (args, ctx) {
    var o = parseArgs(args), inp = this.inputs(ctx, o.rest, 'cat'), n = 0;
    inp.items.forEach(function (it) {
      var ls = lines(it.text);
      ls.forEach(function (l) { ctx.out((o.f.n ? padL(++n, 6) + '\t' : '') + l); });
    });
    return inp.bad ? 1 : 0;
  };
  man('cat', 'cat [FILE]...', 'Show the contents of a file.', ['cat notes.txt', 'cat -n file'], { '-n': 'number the lines' });
  function nOpt(args) { // handles -n 5, -5
    var a = [], n = 10, i;
    for (i = 0; i < args.length; i++) {
      if (/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
      else if (args[i] === '-n') { n = parseInt(args[++i], 10); }
      else if (/^-n\d+$/.test(args[i])) n = parseInt(args[i].slice(2), 10);
      else a.push(args[i]);
    }
    return { n: n, args: a };
  }
  C.head = function (args, ctx) {
    var no = nOpt(args), o = parseArgs(no.args), inp = this.inputs(ctx, o.rest, 'head'), multi = inp.items.length > 1;
    inp.items.forEach(function (it, i) { if (multi) ctx.out((i ? '\n' : '') + '==> ' + it.name + ' <=='); lines(it.text).slice(0, no.n).forEach(function (l) { ctx.out(l); }); });
    return inp.bad ? 1 : 0;
  };
  C.tail = function (args, ctx) {
    var no = nOpt(args), o = parseArgs(no.args), inp = this.inputs(ctx, o.rest, 'tail'), multi = inp.items.length > 1;
    inp.items.forEach(function (it, i) {
      if (multi) ctx.out((i ? '\n' : '') + '==> ' + it.name + ' <==');
      var ls = lines(it.text); ls.slice(Math.max(0, ls.length - no.n)).forEach(function (l) { ctx.out(l); });
    });
    if (o.f.f || o.f.F) ctx.out('(-f follows a file live on a real server. Here it shows the last lines once — press Ctrl+C on a real machine to stop.)');
    return inp.bad ? 1 : 0;
  };
  man('head', 'head [-n N] [FILE]', 'Show the first lines of a file (10 by default).', ['head -n 3 file']);
  man('tail', 'tail [-n N] [-f] [FILE]', 'Show the last lines of a file. -f keeps watching it (great for logs).', ['tail -n 20 /var/log/syslog', 'tail -f /var/log/nginx/access.log']);
  C.less = C.more = function (args, ctx) { return C.cat.call(this, args, ctx); };

  // ======================================================================= grep
  C.grep = function (args, ctx) {
    var self = this, o = parseArgs(args, 'ABCme'), f = o.f, pat = o.rest.shift(), code = 1;
    if (o.v.e) { o.rest.unshift(pat); pat = o.v.e; }
    if (pat === undefined) { ctx.err('Usage: grep [OPTION]... PATTERN [FILE]...'); return 2; }
    f.E = f.E || f.P; f.r = f.r || f.R;
    var re = pat2re(pat, f); if (!re) { ctx.err('grep: Invalid regular expression'); return 2; }
    var files = o.rest, items = [];
    if (f.r) {
      var base = files.length ? files : ['.'];
      base.forEach(function (b) {
        var s = self.stat(b); if (s.err) { ctx.err('grep: ' + b + ': ' + self.fsMsg(s.err)); return; }
        self.walk(s.abs, function (path, node) { if (node.t === 'f' && !node.bin) { var shown = b === '.' ? path.replace(self.cwd + '/', '') : (b + path.slice(s.abs.length)); items.push({ name: shown, node: node, path: path }); } });
      });
    }
    var multi = f.r || files.length > 1, inputs;
    if (f.r) { inputs = items.map(function (it) { var r = self.readText(it.path); return r.err ? null : { name: it.name, text: r.text }; }).filter(Boolean); }
    else { var inp = self.inputs(ctx, files, 'grep'); inputs = inp.items; if (inp.bad) code = 2; }
    var ctxN = f.C ? parseInt(o.v.C, 10) : 0, aN = o.v.A ? parseInt(o.v.A, 10) : ctxN, bN = o.v.B ? parseInt(o.v.B, 10) : ctxN;
    inputs.forEach(function (it) {
      var ls = lines(it.text), hits = 0, shown = {};
      ls.forEach(function (l, i) {
        var m = re.test(l); if (f.v) m = !m;
        if (!m) return;
        hits++; code = code === 2 ? 2 : 0;
        if (f.q || f.l || f.c) return;
        for (var b = Math.max(0, i - bN); b <= Math.min(ls.length - 1, i + aN); b++) {
          if (shown[b]) continue; shown[b] = true;
          var line = ls[b];
          if (b === i && !f.v) {
            if (f.o) { var mm = line.match(new RegExp(re.source, 'g' + (f.i ? 'i' : ''))); if (mm) mm.forEach(function (x) { ctx.out((multi && !f.h ? it.name + ':' : '') + (f.n ? (b + 1) + ':' : '') + x); }); continue; }
            line = line.replace(new RegExp(re.source, 'g' + (f.i ? 'i' : '')), function (x) { return x ? self.color(ctx, 'm', x) : x; });
          }
          ctx.out((multi && !f.h ? it.name + (b === i ? ':' : '-') : '') + (f.n ? (b + 1) + (b === i ? ':' : '-') : '') + line);
        }
      });
      if (f.c) ctx.out((multi && !f.h ? it.name + ':' : '') + hits);
      if (f.l && hits) ctx.out(it.name);
    });
    return code;
  };
  man('grep', 'grep [OPTION]... PATTERN [FILE]...', 'Search text for a pattern. The most-used tool for reading logs.', ['grep error /var/log/syslog', 'grep -i fail auth.log', 'ps aux | grep nginx', 'grep -rn "TODO" .'],
    { '-i': 'ignore upper/lower case', '-v': 'show lines that do NOT match', '-n': 'show line numbers', '-c': 'count matching lines', '-r': 'search inside folders', '-l': 'only list file names', '-E': 'extended regular expressions', '-w': 'match whole words', '-o': 'print only the matching part', '-A': 'also show N lines After', '-B': 'also show N lines Before', '-C': 'also show N lines around' });
  C.egrep = function (a, c) { return C.grep.call(this, ['-E'].concat(a), c); };
  C.fgrep = function (a, c) { return C.grep.call(this, ['-F'].concat(a), c); };

  // ======================================================================= wc sort uniq cut tr tee xargs
  C.wc = function (args, ctx) {
    var o = parseArgs(args), inp = this.inputs(ctx, o.rest, 'wc'), f = o.f, any = f.l || f.w || f.c || f.m;
    var rows = inp.items.map(function (it) {
      var t = it.text, l = (t.match(/\n/g) || []).length, w = (t.trim() ? t.trim().split(/\s+/).length : 0), c = t.length;
      return { name: it.name, v: [l, w, c] };
    });
    var tot = [0, 0, 0]; rows.forEach(function (r) { for (var i = 0; i < 3; i++) tot[i] += r.v[i]; });
    if (rows.length > 1) rows.push({ name: 'total', v: tot });
    var cols = any ? ((f.l ? 1 : 0) + (f.w ? 1 : 0) + ((f.c || f.m) ? 1 : 0)) : 3, width;
    if (!o.rest.length) width = cols === 1 ? 0 : 7;
    else { var mx = 0; inp.items.forEach(function (it) { mx += it.text.length; }); width = (cols === 1 && rows.length === 1) ? 0 : String(Math.max(mx, 1)).length; }
    rows.forEach(function (r) {
      var parts = [];
      if (!any || f.l) parts.push(padL(r.v[0], width)); if (!any || f.w) parts.push(padL(r.v[1], width)); if (!any || f.c || f.m) parts.push(padL(r.v[2], width));
      ctx.out(parts.join(' ') + (r.name !== '-' ? ' ' + r.name : ''));
    });
    return inp.bad ? 1 : 0;
  };
  man('wc', 'wc [-lwc] [FILE]', 'Count lines, words and bytes.', ['wc -l file', 'ls | wc -l'], { '-l': 'count lines', '-w': 'count words', '-c': 'count bytes' });
  C.sort = function (args, ctx) {
    var o = parseArgs(args, 'kt'), inp = this.inputs(ctx, o.rest, 'sort'), all = [];
    inp.items.forEach(function (it) { all = all.concat(lines(it.text)); });
    var sep = o.v.t, k = o.v.k ? parseInt(o.v.k, 10) : 0;
    function key(l) { if (!k) return l; var p = sep ? l.split(sep) : l.trim().split(/\s+/); return p[k - 1] || ''; }
    all.sort(function (a, b) {
      var x = key(a), y = key(b), r;
      if (o.f.n || o.f.h) { var nx = parseFloat(x), ny = parseFloat(y); r = (isNaN(nx) ? 0 : nx) - (isNaN(ny) ? 0 : ny); if (r === 0) r = a < b ? -1 : a > b ? 1 : 0; }
      else { if (o.f.f) { x = x.toLowerCase(); y = y.toLowerCase(); } r = x < y ? -1 : x > y ? 1 : 0; }
      return o.f.r ? -r : r;
    });
    if (o.f.u) all = all.filter(function (l, i) { return i === 0 || l !== all[i - 1]; });
    all.forEach(function (l) { ctx.out(l); });
    return inp.bad ? 1 : 0;
  };
  man('sort', 'sort [-nrk] [FILE]', 'Sort lines of text.', ['sort names.txt', 'sort -n numbers.txt', 'sort -r file'], { '-n': 'sort as numbers', '-r': 'reverse', '-u': 'remove duplicates', '-k': 'sort by column N' });
  C.uniq = function (args, ctx) {
    var o = parseArgs(args), inp = this.inputs(ctx, o.rest, 'uniq'), ls = [];
    inp.items.forEach(function (it) { ls = ls.concat(lines(it.text)); });
    var groups = [];
    ls.forEach(function (l) { if (groups.length && groups[groups.length - 1].l === l) groups[groups.length - 1].n++; else groups.push({ l: l, n: 1 }); });
    groups.forEach(function (g) { if (o.f.d && g.n < 2) return; if (o.f.u && g.n > 1) return; ctx.out((o.f.c ? padL(g.n, 7) + ' ' : '') + g.l); });
    return 0;
  };
  man('uniq', 'uniq [-c] [FILE]', 'Remove repeated neighbouring lines. Use with sort. -c counts them.', ['sort file | uniq -c']);
  C.cut = function (args, ctx) {
    var o = parseArgs(args, 'dfc'), inp = this.inputs(ctx, o.rest, 'cut'), d = o.v.d === undefined ? '\t' : o.v.d;
    function pick(spec, len) { var idx = []; String(spec).split(',').forEach(function (p) { var m = /^(\d*)-(\d*)$/.exec(p); if (m) { var a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : len; for (var i = a; i <= b; i++) idx.push(i); } else idx.push(+p); }); return idx; }
    inp.items.forEach(function (it) {
      lines(it.text).forEach(function (l) {
        if (o.v.c) { var ch = l.split(''); ctx.out(pick(o.v.c, ch.length).map(function (i) { return ch[i - 1] || ''; }).join('')); return; }
        if (l.indexOf(d) < 0) { ctx.out(l); return; }
        var p = l.split(d); ctx.out(pick(o.v.f || '1', p.length).map(function (i) { return p[i - 1]; }).filter(function (x) { return x !== undefined; }).join(d));
      });
    });
    return 0;
  };
  man('cut', 'cut -d DELIM -f FIELDS [FILE]', 'Cut out columns from each line.', ['cut -d: -f1 /etc/passwd', 'cut -c1-5 file']);
  C.tr = function (args, ctx) {
    var o = parseArgs(args), a = o.rest[0] || '', b = o.rest[1] || '', t = ctx.stdin;
    function expand(s) { return s.replace(/([a-zA-Z0-9])-([a-zA-Z0-9])/g, function (_, x, y) { var r = ''; for (var c = x.charCodeAt(0); c <= y.charCodeAt(0); c++) r += String.fromCharCode(c); return r; }).replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz').replace(/\\n/g, '\n'); }
    a = expand(a); b = expand(b);
    if (o.f.d) t = t.split('').filter(function (c) { return a.indexOf(c) < 0; }).join('');
    else t = t.split('').map(function (c) { var i = a.indexOf(c); return i < 0 ? c : (b[Math.min(i, b.length - 1)] || ''); }).join('');
    ctx.raw(t); return 0;
  };
  C.tee = function (args, ctx) {
    var o = parseArgs(args), self = this, code = 0;
    ctx.raw(ctx.stdin);
    o.rest.forEach(function (f) { var e = self.writeText(f, ctx.stdin, !!o.f.a); if (e) { ctx.err('tee: ' + f + ': ' + self.fsMsg(e)); code = 1; } });
    return code;
  };
  man('tee', 'tee [-a] FILE', 'Show output AND save it to a file. With sudo it lets you write to protected files: echo hi | sudo tee /etc/file', ['echo hello | sudo tee /etc/motd']);
  C.xargs = function (args, ctx) {
    var o = parseArgs(args, 'nI'), cmd = o.rest.length ? o.rest : ['echo'], items = ctx.stdin.split(/\s+/).filter(Boolean), self = this;
    if (o.v.I) { items.forEach(function (it) { var a = cmd.map(function (x) { return x.split(o.v.I).join(it); }); var c2 = new LX.Ctx(self, '', false); self.dispatch(a, c2); c2.log.forEach(function (e) { ctx.log.push(e); }); }); return 0; }
    var n = o.v.n ? parseInt(o.v.n, 10) : items.length || 1;
    for (var i = 0; i < Math.max(1, items.length); i += n) { var c3 = new LX.Ctx(this, '', false); this.dispatch(cmd.concat(items.slice(i, i + n)), c3); c3.log.forEach(function (e) { ctx.log.push(e); }); }
    return 0;
  };

  // ======================================================================= sed / awk
  C.sed = function (args, ctx) {
    var self = this, o = parseArgs(args, 'e'), scripts = [], n = o.f.n, inplace = o.f.i;
    var rest = o.rest.slice();
    if (o.v.e) scripts.push(o.v.e); else if (rest.length) scripts.push(rest.shift());
    var cmds = [];
    scripts.join(';').split(/;(?![^\/]*\/[^\/]*$)/).forEach(function (s) {
      s = s.trim(); if (!s) return;
      var m = /^(?:(\d+|\$|\/[^\/]*\/)(?:,(\d+|\$))?)?\s*(s|d|p)(.*)$/.exec(s);
      if (!m) return;
      var cmd = { a1: m[1], a2: m[2], c: m[3] };
      if (m[3] === 's') {
        var del = m[4].charAt(0), parts = m[4].slice(1).split(del);
        var re; try { re = new RegExp(parts[0].replace(/\\\(/g, '(').replace(/\\\)/g, ')'), (parts[2] || '').indexOf('g') >= 0 ? 'g' + ((parts[2] || '').indexOf('i') >= 0 ? 'i' : '') : ((parts[2] || '').indexOf('i') >= 0 ? 'i' : '')); } catch (e) { re = null; }
        cmd.re = re; cmd.rep = (parts[1] || '').replace(/\\([0-9])/g, '$$$1').replace(/&/g, '$$&');
      }
      cmds.push(cmd);
    });
    function addr(c, i, total, line) {
      if (!c.a1) return true;
      var t1 = c.a1;
      function match(a) { if (a === '$') return i === total; if (a[0] === '/') return new RegExp(a.slice(1, -1)).test(line); return i === +a; }
      if (!c.a2) return match(t1);
      var lo = t1 === '$' ? total : (t1[0] === '/' ? null : +t1), hi = c.a2 === '$' ? total : +c.a2;
      return lo !== null ? (i >= lo && i <= hi) : (match(t1));
    }
    function process(text) {
      var ls = lines(text), out = [];
      ls.forEach(function (l, idx) {
        var i = idx + 1, deleted = false, printed = false;
        cmds.forEach(function (c) {
          if (deleted || !addr(c, i, ls.length, l)) return;
          if (c.c === 's' && c.re) l = l.replace(c.re, c.rep); else if (c.c === 'd') deleted = true; else if (c.c === 'p') { out.push(l); printed = true; }
        });
        if (!deleted && !n) out.push(l);
      });
      return out;
    }
    if (inplace) {
      var code = 0;
      rest.forEach(function (f) {
        var r = self.readText(f); if (r.err) { ctx.err('sed: can\'t read ' + f + ': ' + self.fsMsg(r.err)); code = 2; return; }
        var e = self.writeText(f, process(r.text).join('\n') + '\n', false); if (e) { ctx.err('sed: couldn\'t open temporary file ' + dirname(self.norm(f)) + '/sedXXXX: ' + self.fsMsg(e)); code = 4; }
      });
      return code;
    }
    var inp = this.inputs(ctx, rest, 'sed');
    inp.items.forEach(function (it) { process(it.text).forEach(function (l) { ctx.out(l); }); });
    return inp.bad ? 2 : 0;
  };
  man('sed', "sed 's/old/new/g' [FILE]", 'Find and replace text in a stream or file. -i edits the file in place.', ["sed 's/foo/bar/g' file", "sed -i 's/PORT=80/PORT=3000/' /etc/myapp/config.env", "sed -n '1,5p' file"]);
  C.awk = function (args, ctx) {
    var o = parseArgs(args, 'F'), prog = o.rest.shift() || '', inp = this.inputs(ctx, o.rest, 'awk'), sep = o.v.F, endBlock = null;
    var em = /^(.*?)\s*END\s*\{([^}]*)\}\s*$/.exec(prog); if (em) { prog = em[1]; endBlock = em[2]; }
    var pm = /^\s*(?:(\/[^\/]*\/|NR\s*(?:==|>|<|>=|<=)\s*\d+|\$\d+\s*(?:==|!=|>|<|>=|<=|~)\s*(?:"[^"]*"|[\w.]+)))?\s*\{([^}]*)\}\s*$/.exec(prog) || [null, '', 'print'];
    var cond = (pm[1] || '').trim(), action = (pm[2] || 'print').trim(), sums = {}, NR = 0;
    function fields(l) { return sep ? l.split(sep) : l.trim().split(/\s+/); }
    function val(expr, F, l) {
      expr = expr.trim();
      if (expr === '$0') return l; if (expr === 'NR') return NR; if (expr === 'NF') return F.length;
      var m = /^\$(NF|\d+)$/.exec(expr); if (m) return m[1] === 'NF' ? F[F.length - 1] : (F[+m[1] - 1] === undefined ? '' : F[+m[1] - 1]);
      if (/^".*"$/.test(expr)) return expr.slice(1, -1);
      return expr;
    }
    function test(l, F) {
      if (!cond) return true;
      if (cond.charAt(0) === '/') return new RegExp(cond.slice(1, -1)).test(l);
      var m = /^(NR|\$\d+)\s*(==|!=|>=|<=|>|<|~)\s*(.+)$/.exec(cond); if (!m) return true;
      var a = m[1] === 'NR' ? NR : (F[+m[1].slice(1) - 1] || ''), b = m[3].replace(/^"|"$/g, '');
      if (m[2] === '~') return new RegExp(b).test(a);
      var na = parseFloat(a), nb = parseFloat(b), num = !isNaN(na) && !isNaN(nb);
      var x = num ? na : a, y = num ? nb : b;
      return m[2] === '==' ? x == y : m[2] === '!=' ? x != y : m[2] === '>' ? x > y : m[2] === '<' ? x < y : m[2] === '>=' ? x >= y : x <= y;
    }
    inp.items.forEach(function (it) {
      lines(it.text).forEach(function (l) {
        NR++; var F = fields(l);
        if (!test(l, F)) return;
        action.split(';').forEach(function (st) {
          st = st.trim();
          var pr = /^print\s*(.*)$/.exec(st);
          if (pr) { ctx.out(pr[1] ? pr[1].split(',').map(function (e) { return val(e, F, l); }).join(' ') : l); return; }
          var ad = /^(\w+)\s*\+=\s*(.+)$/.exec(st); if (ad) sums[ad[1]] = (sums[ad[1]] || 0) + (parseFloat(val(ad[2], F, l)) || 0);
          var inc = /^(\w+)\+\+$/.exec(st); if (inc) sums[inc[1]] = (sums[inc[1]] || 0) + 1;
        });
      });
    });
    if (endBlock) { var pe = /print\s+(\w+)/.exec(endBlock); if (pe) ctx.out(String(sums[pe[1]] !== undefined ? sums[pe[1]] : (pe[1] === 'NR' ? NR : ''))); }
    return 0;
  };
  man('awk', "awk '{print $1}' [FILE]", 'Pick columns and do quick maths on text.', ["awk '{print $1}' access.log", "awk -F: '{print $1}' /etc/passwd", "awk '{s+=$2} END {print s}' sales.csv"]);

  // ======================================================================= find
  C.find = function (args, ctx) {
    var self = this, paths = [], i = 0, tests = {}, exec = null, del = false;
    while (i < args.length && args[i].charAt(0) !== '-' && args[i] !== '!') paths.push(args[i++]);
    if (!paths.length) paths = ['.'];
    for (; i < args.length; i++) {
      var a = args[i];
      if (a === '-name' || a === '-iname') { tests.name = args[++i]; tests.icase = a === '-iname'; }
      else if (a === '-type') tests.type = args[++i]; else if (a === '-maxdepth') tests.max = +args[++i]; else if (a === '-mindepth') tests.min = +args[++i];
      else if (a === '-size') tests.size = args[++i]; else if (a === '-user') tests.user = args[++i]; else if (a === '-empty') tests.empty = true;
      else if (a === '-perm') tests.perm = args[++i]; else if (a === '-delete') del = true; else if (a === '-print') { /* default */ }
      else if (a === '-exec') { exec = []; i++; while (i < args.length && args[i] !== ';' && args[i] !== '+') exec.push(args[i++]); }
    }
    var re = tests.name ? new RegExp('^' + tests.name.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', tests.icase ? 'i' : '') : null, code = 0;
    function sizeOk(n) {
      if (!tests.size) return true; var m = /^([+-]?)(\d+)([kMGc]?)$/.exec(tests.size); if (!m) return true;
      var mult = { '': 512, c: 1, k: 1024, M: 1048576, G: 1073741824 }[m[3]], want = +m[2] * mult, sz = self.sizeOf(n);
      return m[1] === '+' ? sz > want : m[1] === '-' ? sz < want : Math.ceil(sz / mult) === +m[2];
    }
    paths.forEach(function (p) {
      var s = self.stat(p); if (s.err) { ctx.err("find: '" + p + "': " + self.fsMsg(s.err)); code = 1; return; }
      (function rec(abs, shown, node, d) {
        var ok = true, nm = basename(abs);
        if (tests.min !== undefined && d < tests.min) ok = false;
        if (tests.max !== undefined && d > tests.max) return;
        if (re && !re.test(nm)) ok = false;
        if (tests.type && ({ f: 'f', d: 'd', l: 'l' }[tests.type] !== node.t)) ok = false;
        if (tests.user && node.o !== tests.user) ok = false;
        if (tests.empty && !(node.t === 'd' ? !Object.keys(node.k).length : self.sizeOf(node) === 0)) ok = false;
        if (tests.perm && (node.m & 4095).toString(8) !== tests.perm.replace(/^-/, '')) ok = false;
        if (!sizeOk(node)) ok = false;
        if (ok) {
          if (exec) { var c2 = new LX.Ctx(self, '', false); self.dispatch(exec.map(function (x) { return x === '{}' ? shown : x; }), c2); c2.log.forEach(function (e) { ctx.log.push(e); }); }
          else if (del) { if (abs !== '/') { var par = self.find(dirname(abs), true).node; if (par && self.perm(par, 2)) delete par.k[nm]; else ctx.err("find: cannot delete '" + shown + "': Permission denied"); } }
          else ctx.out(shown);
        }
        if (node.t === 'd' && self.perm(node, 4) && self.perm(node, 1)) Object.keys(node.k).sort().forEach(function (k) { rec((abs === '/' ? '' : abs) + '/' + k, (shown === '/' ? '' : shown) + '/' + k, node.k[k], d + 1); });
        else if (node.t === 'd') ctx.err("find: '" + shown + "': Permission denied");
      })(s.abs, p, s.node, 0);
    });
    return code;
  };
  man('find', 'find [PATH] [-name PATTERN] [-type f|d] [-size +1M]', 'Search for files and folders.', ['find /var/log -name "*.log"', 'find . -type f -size +1M', 'find /tmp -name "*.tmp" -delete'],
    { '-name': 'match the file name (wildcards ok)', '-type': 'f = files, d = folders', '-size': 'bigger (+) or smaller (-) than', '-exec': 'run a command on each result', '-delete': 'delete what it finds', '-user': 'owned by this user' });

  // ======================================================================= create / copy / move / remove
  C.touch = function (args, ctx) {
    var self = this, code = 0;
    args.filter(function (a) { return a.charAt(0) !== '-'; }).forEach(function (f) {
      var s = self.stat(f);
      if (s.err === 'ENOENT' && s.parent) { var e = self.writeText(f, '', false); if (e) { ctx.err("touch: cannot touch '" + f + "': " + self.fsMsg(e)); code = 1; } }
      else if (s.err) { ctx.err("touch: cannot touch '" + f + "': " + self.fsMsg(s.err)); code = 1; }
      else if (self.perm(s.node, 2) || self.user.uid === 0) s.node.mt = self.now(); else { ctx.err("touch: cannot touch '" + f + "': Permission denied"); code = 1; }
    });
    if (!args.length) { ctx.err('touch: missing file operand'); return 1; }
    return code;
  };
  C.mkdir = function (args, ctx) {
    var self = this, o = parseArgs(args, 'm'), code = 0;
    if (!o.rest.length) { ctx.err('mkdir: missing operand'); return 1; }
    o.rest.forEach(function (d) {
      var abs = self.norm(d), s = self.stat(d);
      if (!s.err) { if (!o.f.p) { ctx.err("mkdir: cannot create directory '" + d + "': File exists"); code = 1; } return; }
      var comps = abs.split('/').filter(Boolean), node = self.root, path = '';
      for (var i = 0; i < comps.length; i++) {
        path += '/' + comps[i];
        var next = node.k[comps[i]], last = i === comps.length - 1;
        if (!next) {
          if (!last && !o.f.p) { ctx.err("mkdir: cannot create directory '" + d + "': No such file or directory"); code = 1; return; }
          if (!self.canCreateIn(node)) { ctx.err("mkdir: cannot create directory '" + d + "': Permission denied"); code = 1; return; }
          next = self.dirNode(o.v.m ? parseInt(o.v.m, 8) : (511 & ~self.umask), self.user.name, self.user.groups[0]); node.k[comps[i]] = next; node.mt = self.now();
        } else if (next.t !== 'd') { ctx.err("mkdir: cannot create directory '" + d + "': Not a directory"); code = 1; return; }
        node = next;
      }
    });
    return code;
  };
  man('mkdir', 'mkdir [-p] DIR...', 'Make a new folder. -p also makes missing parent folders.', ['mkdir projects', 'mkdir -p app/src/utils'], { '-p': 'create parent folders too' });
  C.rmdir = function (args, ctx) {
    var self = this, code = 0;
    args.forEach(function (d) {
      var s = self.stat(d); if (s.err) { ctx.err("rmdir: failed to remove '" + d + "': " + self.fsMsg(s.err)); code = 1; return; }
      if (s.node.t !== 'd') { ctx.err("rmdir: failed to remove '" + d + "': Not a directory"); code = 1; return; }
      if (Object.keys(s.node.k).length) { ctx.err("rmdir: failed to remove '" + d + "': Directory not empty"); code = 1; return; }
      var par = self.find(dirname(s.abs), true).node; if (!self.perm(par, 2)) { ctx.err("rmdir: failed to remove '" + d + "': Permission denied"); code = 1; return; }
      delete par.k[basename(s.abs)];
    });
    return code;
  };
  C.rm = function (args, ctx) {
    var self = this, o = parseArgs(args), code = 0, rec = o.f.r || o.f.R;
    if (!o.rest.length && !o.f.f) { ctx.err('rm: missing operand'); return 1; }
    o.rest.forEach(function (t) {
      var abs = self.norm(t);
      if (abs === '/') { ctx.err("rm: it is dangerous to operate recursively on '/'"); ctx.err('rm: use --no-preserve-root to override this failsafe'); code = 1; return; }
      if (basename(t) === '.' || basename(t) === '..') { ctx.err("rm: refusing to remove '.' or '..' directory: skipping '" + t + "'"); code = 1; return; }
      var s = self.stat(t, false);
      if (s.err) { if (!o.f.f) { ctx.err("rm: cannot remove '" + t + "': " + self.fsMsg(s.err)); code = 1; } return; }
      if (s.node.t === 'd' && !rec) { ctx.err("rm: cannot remove '" + t + "': Is a directory"); code = 1; return; }
      var par = self.find(dirname(s.abs), true).node;
      if (!par || !self.perm(par, 2) || (par.m & 512 && self.user.uid !== 0 && s.node.o !== self.user.name && par.o !== self.user.name)) { ctx.err("rm: cannot remove '" + t + "': Permission denied"); code = 1; return; }
      if (s.node.protect) { ctx.err("rm: cannot remove '" + t + "': Operation not permitted"); code = 1; return; }
      delete par.k[basename(s.abs)];
      if (o.f.v) ctx.out("removed '" + t + "'");
    });
    return code;
  };
  man('rm', 'rm [-rf] FILE...', 'Delete files. There is NO recycle bin on Linux — deleted means gone. -r deletes folders too.', ['rm old.txt', 'rm -r old-folder'], { '-r': 'delete folders and what is inside', '-f': 'do not ask, ignore missing files', '-v': 'say what was removed' });
  function clone(node, self, owner) {
    var n = JSON.parse(JSON.stringify(node)); n.mt = self.now();
    (function fix(x) { if (owner) { x.o = owner.name; x.g = owner.groups[0]; } if (x.t === 'd') Object.keys(x.k).forEach(function (k) { fix(x.k[k]); }); })(n);
    return n;
  }
  C.cp = function (args, ctx) {
    var self = this, o = parseArgs(args), rec = o.f.r || o.f.R || o.f.a, srcs = o.rest.slice(0, -1), dst = o.rest[o.rest.length - 1], code = 0;
    if (o.rest.length < 2) { ctx.err('cp: missing destination file operand after \'' + (o.rest[0] || '') + '\''); return 1; }
    var ds = self.stat(dst), dstIsDir = !ds.err && ds.node.t === 'd';
    if (srcs.length > 1 && !dstIsDir) { ctx.err("cp: target '" + dst + "' is not a directory"); return 1; }
    srcs.forEach(function (s) {
      var ss = self.stat(s); if (ss.err) { ctx.err("cp: cannot stat '" + s + "': " + self.fsMsg(ss.err)); code = 1; return; }
      if (ss.node.t === 'd' && !rec) { ctx.err("cp: -r not specified; omitting directory '" + s + "'"); code = 1; return; }
      if (!self.perm(ss.node, 4)) { ctx.err("cp: cannot open '" + s + "' for reading: Permission denied"); code = 1; return; }
      var targetPath = dstIsDir ? ds.abs + '/' + basename(ss.abs) : self.norm(dst);
      var ts = self.stat(targetPath), par = ts.err === 'ENOENT' ? ts.parent : self.find(dirname(targetPath), true).node;
      if (!par || !self.canCreateIn(par)) { ctx.err("cp: cannot create regular file '" + targetPath + "': " + (par ? 'Permission denied' : 'No such file or directory')); code = 1; return; }
      var n = clone(ss.node, self, self.user); if (!o.f.p && !o.f.a) n.m = ss.node.m & ~self.umask | (ss.node.m & 73 ? 0 : 0);
      par.k[basename(targetPath)] = n; if (o.f.v) ctx.out("'" + s + "' -> '" + targetPath + "'");
    });
    return code;
  };
  C.mv = function (args, ctx) {
    var self = this, o = parseArgs(args), srcs = o.rest.slice(0, -1), dst = o.rest[o.rest.length - 1], code = 0;
    if (o.rest.length < 2) { ctx.err('mv: missing destination file operand after \'' + (o.rest[0] || '') + '\''); return 1; }
    var ds = self.stat(dst), dstIsDir = !ds.err && ds.node.t === 'd';
    srcs.forEach(function (s) {
      var ss = self.stat(s, false); if (ss.err) { ctx.err("mv: cannot stat '" + s + "': " + self.fsMsg(ss.err)); code = 1; return; }
      var targetPath = dstIsDir ? ds.abs + '/' + basename(ss.abs) : self.norm(dst);
      var oldPar = self.find(dirname(ss.abs), true).node;
      var ts = self.stat(targetPath), par = ts.err === 'ENOENT' ? ts.parent : self.find(dirname(targetPath), true).node;
      if (!self.perm(oldPar, 2) || !par || !self.canCreateIn(par)) { ctx.err("mv: cannot move '" + s + "' to '" + dst + "': Permission denied"); code = 1; return; }
      if (ss.node.t === 'd' && (targetPath + '/').indexOf(ss.abs + '/') === 0) { ctx.err("mv: cannot move '" + s + "' to a subdirectory of itself, '" + targetPath + "'"); code = 1; return; }
      delete oldPar.k[basename(ss.abs)]; par.k[basename(targetPath)] = ss.node;
    });
    return code;
  };
  C.ln = function (args, ctx) {
    var o = parseArgs(args), self = this;
    if (o.rest.length < 2) { ctx.err('ln: missing file operand'); return 1; }
    var tgt = o.rest[0], lp = self.norm(o.rest[1]), s = self.stat(lp);
    if (!s.err && s.node.t === 'd') lp += '/' + basename(tgt);
    var ps = self.stat(dirname(lp)); if (ps.err || !self.canCreateIn(ps.node)) { ctx.err("ln: failed to create symbolic link '" + o.rest[1] + "': Permission denied"); return 1; }
    if (o.f.s) ps.node.k[basename(lp)] = { t: 'l', m: 511, o: self.user.name, g: self.user.groups[0], mt: self.now(), l: tgt };
    else { var ts = self.stat(tgt); if (ts.err) { ctx.err("ln: failed to access '" + tgt + "': " + self.fsMsg(ts.err)); return 1; } ps.node.k[basename(lp)] = ts.node; }
    return 0;
  };
  man('ln', 'ln -s TARGET LINKNAME', 'Make a shortcut (symbolic link) to a file or folder.', ['ln -s /var/log/syslog ~/syslog']);

  // ======================================================================= stat / file / paths
  C.stat = function (args, ctx) {
    var self = this, code = 0;
    args.forEach(function (a) {
      var s = self.stat(a, false); if (s.err) { ctx.err("stat: cannot statx '" + a + "': " + self.fsMsg(s.err)); code = 1; return; }
      var n = s.node, kind = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : (self.sizeOf(n) ? 'regular file' : 'regular empty file'), d = self.fmtFull(n.mt).split(' '), ts = new Date(n.mt).toISOString().replace('T', ' ').replace('Z', '.000000000 +0000');
      ctx.out('  File: ' + a + (n.t === 'l' ? ' -> ' + n.l : ''));
      ctx.out('  Size: ' + padR(self.sizeOf(n), 10) + ' Blocks: ' + padR(Math.ceil(self.sizeOf(n) / 512), 8) + ' IO Block: 4096   ' + kind);
      ctx.out('Access: (' + padL((n.m & 4095).toString(8), 4).replace(/ /g, '0') + '/' + self.modeStr(n) + ')  Uid: (' + padL(self.uidOf(n.o), 5) + '/' + padL(n.o, 8) + ')   Gid: (' + padL(self.gidOf(n.g), 5) + '/' + padL(n.g, 8) + ')');
      ctx.out('Modify: ' + ts); ctx.out('Change: ' + ts);
    });
    return code;
  };
  M.uidOf = function (n) { var u = this.users[n]; return u ? u.uid : 0; };
  M.gidOf = function (n) { return this.groups[n] !== undefined ? this.groups[n] : 0; };
  C.file = function (args, ctx) {
    var self = this;
    args.forEach(function (a) {
      var s = self.stat(a, false); if (s.err) { ctx.out(a + ': cannot open `' + a + "' (" + self.fsMsg(s.err) + ')'); return; }
      var n = s.node, d = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link to ' + n.l : n.bin ? 'ELF 64-bit LSB pie executable, x86-64' : !n.c ? 'empty' : /^#!/.test(n.c) ? (/bash|sh/.test(n.c.split('\n')[0]) ? 'Bourne-Again shell script, ASCII text executable' : 'script, ASCII text executable') : (/^\u0000TAR/.test(n.c) ? 'gzip compressed data' : 'ASCII text');
      ctx.out(a + ': ' + d);
    });
    return 0;
  };
  C.basename = function (a, ctx) { var b = basename(a[0] || ''); if (a[1] && b.slice(-a[1].length) === a[1]) b = b.slice(0, -a[1].length); ctx.out(b); return 0; };
  C.dirname = function (a, ctx) { ctx.out(dirname(a[0] || '.')); return 0; };
  C.realpath = function (a, ctx) { ctx.out(this.norm(a[0] || '.')); return 0; };
  C.readlink = function (a, ctx) { var s = this.stat(a[a.length - 1], false); if (s.err || s.node.t !== 'l') return 1; ctx.out(s.node.l); return 0; };

  // ======================================================================= permissions
  function applyMode(self, node, spec) {
    var m = node.m;
    if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8);
    var ok = spec.split(',').every(function (part) {
      var mm = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(part); if (!mm) return false;
      var who = mm[1] || 'a', bits = 0, v = mm[3];
      var r = v.indexOf('r') >= 0 ? 4 : 0, w = v.indexOf('w') >= 0 ? 2 : 0, x = (v.indexOf('x') >= 0 || (v.indexOf('X') >= 0 && (node.t === 'd' || (m & 73)))) ? 1 : 0, rwx = r | w | x;
      var mask = 0;
      if (who.indexOf('a') >= 0 || who.indexOf('u') >= 0) { mask |= rwx << 6; if (v.indexOf('s') >= 0) bits |= 2048; }
      if (who.indexOf('a') >= 0 || who.indexOf('g') >= 0) { mask |= rwx << 3; if (v.indexOf('s') >= 0) bits |= 1024; }
      if (who.indexOf('a') >= 0 || who.indexOf('o') >= 0) { mask |= rwx; if (v.indexOf('t') >= 0) bits |= 512; }
      var clear = 0; if (who.indexOf('a') >= 0 || who.indexOf('u') >= 0) clear |= 448; if (who.indexOf('a') >= 0 || who.indexOf('g') >= 0) clear |= 56; if (who.indexOf('a') >= 0 || who.indexOf('o') >= 0) clear |= 7;
      if (mm[2] === '+') m |= mask | bits; else if (mm[2] === '-') m &= ~(mask | bits); else m = (m & ~clear) | mask | bits;
      return true;
    });
    return ok ? m : null;
  }
  C.chmod = function (args, ctx) {
    var self = this, o = parseArgs(args.filter(function (a) { return !/^-[rwxXst+=,ugoa0-7]/.test(a) || /^-[R]/.test(a) || a === '-v'; })), mode = null, files = [];
    var raw = args.filter(function (a) { return a !== '-R' && a !== '-v'; });
    mode = raw[0]; files = raw.slice(1);
    if (!mode) { ctx.err('chmod: missing operand'); return 1; }
    if (!files.length) { ctx.err("chmod: missing operand after '" + mode + "'"); return 1; }
    var code = 0, rec = args.indexOf('-R') >= 0;
    files.forEach(function (f) {
      var s = self.stat(f); if (s.err) { ctx.err("chmod: cannot access '" + f + "': " + self.fsMsg(s.err)); code = 1; return; }
      function setOne(node) {
        if (self.user.uid !== 0 && node.o !== self.user.name) { ctx.err("chmod: changing permissions of '" + f + "': Operation not permitted"); code = 1; return; }
        var nm = applyMode(self, node, mode); if (nm === null) { ctx.err("chmod: invalid mode: '" + mode + "'"); code = 1; return false; }
        node.m = nm;
      }
      if (rec) self.walk(s.abs, function (p, n) { setOne(n); }); else setOne(s.node);
    });
    return code;
  };
  man('chmod', 'chmod MODE FILE...', 'Change who may read (r), write (w) or run (x) a file. MODE can be numbers (755) or letters (u+x).', ['chmod +x script.sh', 'chmod 644 file.txt', 'chmod 600 ~/.ssh/id_ed25519', 'chmod -R 755 /var/www'],
    { '+x': 'allow running it', '644': 'owner read+write, everyone else read', '755': 'owner all, everyone else read+run', '600': 'only the owner can read and write', '-R': 'apply to everything inside a folder' });
  C.chown = function (args, ctx) {
    var self = this, o = parseArgs(args), spec = o.rest[0], files = o.rest.slice(1), code = 0;
    if (!spec || !files.length) { ctx.err('chown: missing operand'); return 1; }
    var m = /^([^:.]*)(?:[:.](.*))?$/.exec(spec), user = m[1], grp = m[2];
    if (user && !self.users[user]) { ctx.err("chown: invalid user: '" + spec + "'"); return 1; }
    if (grp && self.groups[grp] === undefined) { ctx.err("chown: invalid group: '" + spec + "'"); return 1; }
    files.forEach(function (f) {
      var s = self.stat(f); if (s.err) { ctx.err("chown: cannot access '" + f + "': " + self.fsMsg(s.err)); code = 1; return; }
      if (self.user.uid !== 0) { ctx.err("chown: changing ownership of '" + f + "': Operation not permitted"); code = 1; return; }
      function set(n) { if (user) n.o = user; if (grp) n.g = grp; }
      if (o.f.R) self.walk(s.abs, function (p, n) { set(n); }); else set(s.node);
    });
    return code;
  };
  man('chown', 'chown USER[:GROUP] FILE...', 'Change the owner (and group) of a file. Needs sudo.', ['sudo chown learner:learner file', 'sudo chown -R www-data /var/www']);
  C.chgrp = function (args, ctx) { return C.chown.call(this, [':' + args[0]].concat(args.slice(1)), ctx); };

  // ======================================================================= info commands
  C.whoami = function (a, ctx) { ctx.out(this.user.name); return 0; };
  C.id = function (a, ctx) {
    var u = a[0] ? this.users[a[0]] : this.user, self = this;
    if (!u) { ctx.err('id: \'' + a[0] + '\': no such user'); return 1; }
    ctx.out('uid=' + u.uid + '(' + u.name + ') gid=' + u.gid + '(' + u.groups[0] + ') groups=' + u.groups.map(function (g) { return self.gidOf(g) + '(' + g + ')'; }).join(','));
    return 0;
  };
  C.groups = function (a, ctx) { var u = a[0] ? this.users[a[0]] : this.user; if (!u) { ctx.err('groups: \'' + a[0] + '\': no such user'); return 1; } ctx.out((a[0] ? u.name + ' : ' : '') + u.groups.join(' ')); return 0; };
  C.hostname = function (a, ctx) { ctx.out(this.hostname); return 0; };
  C.uname = function (a, ctx) {
    var all = a.indexOf('-a') >= 0, parts = { s: 'Linux', n: this.hostname, r: '6.8.0-45-generic', v: '#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024', m: 'x86_64', o: 'GNU/Linux' };
    if (all) ctx.out([parts.s, parts.n, parts.r, parts.v, parts.m, parts.m, parts.m, parts.o].join(' '));
    else if (a.indexOf('-r') >= 0) ctx.out(parts.r); else if (a.indexOf('-m') >= 0) ctx.out(parts.m); else if (a.indexOf('-n') >= 0) ctx.out(parts.n); else ctx.out(parts.s);
    return 0;
  };
  C.date = function (a, ctx) {
    var d = new Date(this.now()), fmt = a.filter(function (x) { return x.charAt(0) === '+'; })[0];
    if (!fmt) { ctx.out(this.fmtFull(this.now())); return 0; }
    ctx.out(fmt.slice(1).replace(/%([YmdHMSjAaBbFTZsyep%])/g, function (_, c) {
      var map = { Y: d.getUTCFullYear(), m: p2(d.getUTCMonth() + 1), d: p2(d.getUTCDate()), H: p2(d.getUTCHours()), M: p2(d.getUTCMinutes()), S: p2(d.getUTCSeconds()), y: p2(d.getUTCFullYear() % 100), A: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()], a: U.DAY[d.getUTCDay()], b: U.MON[d.getUTCMonth()], B: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()], F: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), T: p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()), Z: 'UTC', s: Math.floor(d.getTime() / 1000), '%': '%', j: '331', p: d.getUTCHours() < 12 ? 'AM' : 'PM', e: U.padL(d.getUTCDate(), 2) };
      return String(map[c]);
    }));
    return 0;
  };
  C.printf = function (a, ctx) {
    var fmt = a[0] || '', args = a.slice(1), i = 0;
    var out = fmt.replace(/%(-?\d*)([sdf%])/g, function (_, w, c) { if (c === '%') return '%'; var v = args[i++]; if (v === undefined) v = c === 's' ? '' : '0'; v = c === 'd' ? String(parseInt(v, 10) || 0) : c === 'f' ? (parseFloat(v) || 0).toFixed(6) : v; var n = parseInt(w, 10); if (n) v = n < 0 ? padR(v, -n) : padL(v, n); return v; }).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    ctx.raw(out); return 0;
  };
  C.sleep = function (a, ctx) { var n = parseFloat(a[0]) || 0; this.advance(n); if (this.onTime) this.onTime(Math.ceil(n)); return 0; };
  man('sleep', 'sleep SECONDS', 'Wait. (Here it fast-forwards the server clock so cron jobs can run.)', ['sleep 60']);
  C.seq = function (a, ctx) { var s = a.length > 1 ? +a[0] : 1, e = +a[a.length > 1 ? 1 : 0]; for (var i = s; i <= e; i++) ctx.out(String(i)); return 0; };
  C.yes = function (a, ctx) { for (var i = 0; i < 5; i++) ctx.out(a[0] || 'y'); return 0; };
  C.which = function (a, ctx) { var self = this, code = 0; a.forEach(function (n) { if (self.findCmd(n)) ctx.out('/usr/bin/' + n); else code = 1; }); return code; };
  C.whereis = function (a, ctx) { var self = this; a.forEach(function (n) { ctx.out(n + ':' + (self.findCmd(n) ? ' /usr/bin/' + n + ' /usr/share/man/man1/' + n + '.1.gz' : '')); }); return 0; };
  C.nproc = function (a, ctx) { ctx.out('2'); return 0; };
  C.tty = function (a, ctx) { ctx.out('/dev/pts/0'); return 0; };

  // ======================================================================= tar / gzip
  C.tar = function (args, ctx) {
    var self = this, flags = (args[0] || '').replace(/^-/, ''), rest = args.slice(1), file, c = flags.indexOf('c') >= 0, x = flags.indexOf('x') >= 0, t = flags.indexOf('t') >= 0, v = flags.indexOf('v') >= 0;
    var fi = args.indexOf('-f'); if (flags.indexOf('f') >= 0) { file = rest.shift(); }
    if (!file) { ctx.err('tar: Refusing to read archive contents from terminal (missing -f option)'); return 2; }
    var dIdx = rest.indexOf('-C'), destDir = null; if (dIdx >= 0) { destDir = rest[dIdx + 1]; rest.splice(dIdx, 2); }
    if (c) {
      var entries = {}, code = 0;
      rest.forEach(function (r) {
        var s = self.stat(r); if (s.err) { ctx.err('tar: ' + r + ': Cannot stat: ' + self.fsMsg(s.err)); code = 2; return; }
        self.walk(s.abs, function (p, n) { var rel = p === s.abs ? r : r.replace(/\/$/, '') + p.slice(s.abs.length); entries[rel] = n.t === 'd' ? null : n.c; if (v) ctx.out(rel + (n.t === 'd' ? '/' : '')); });
      });
      var e = self.writeText(file, '\u0000TAR' + JSON.stringify(entries), false);
      if (e) { ctx.err('tar: ' + file + ': Cannot open: ' + self.fsMsg(e)); return 2; }
      var fs = self.stat(file); if (fs.node) fs.node.bytes = Math.max(120, Math.round(JSON.stringify(entries).length * 0.4));
      return code;
    }
    var r = self.readText(file); if (r.err) { ctx.err('tar: ' + file + ': Cannot open: ' + self.fsMsg(r.err)); return 2; }
    if (r.text.indexOf('\u0000TAR') !== 0) { ctx.err('tar: This does not look like a tar archive'); return 2; }
    var data = JSON.parse(r.text.slice(4));
    if (t) { Object.keys(data).forEach(function (k) { ctx.out(k); }); return 0; }
    if (x) {
      var base = destDir ? self.norm(destDir) : self.cwd;
      Object.keys(data).forEach(function (k) {
        var path = self.norm(base + '/' + k, '/');
        if (data[k] === null) { var ds = self.stat(path); if (ds.err === 'ENOENT' && ds.parent && self.canCreateIn(ds.parent)) ds.parent.k[ds.name] = self.dirNode(493, self.user.name, self.user.groups[0]); }
        else { var ps = self.stat(dirname(path)); if (!ps.err) { var er = self.writeText(path, data[k], false); if (er) ctx.err('tar: ' + k + ': Cannot open: ' + self.fsMsg(er)); } else ctx.err('tar: ' + k + ': Cannot open: No such file or directory'); }
        if (v) ctx.out(k);
      });
      return 0;
    }
    return 2;
  };
  man('tar', 'tar -czf ARCHIVE.tar.gz FILES   |   tar -xzf ARCHIVE.tar.gz', 'Pack files into one archive, or unpack one. Used for backups.', ['tar -czf backup.tar.gz projects', 'tar -tzf backup.tar.gz', 'tar -xzf backup.tar.gz -C /tmp'], { c: 'create', x: 'extract', t: 'list', z: 'gzip', f: 'the archive file name', v: 'verbose' });
  C.gzip = function (a, ctx) { var self = this; a.filter(function (x) { return x[0] !== '-'; }).forEach(function (f) { var r = self.readText(f); if (r.err) { ctx.err('gzip: ' + f + ': ' + self.fsMsg(r.err)); return; } self.writeText(f + '.gz', '\u0000GZ' + r.text, false); var s = self.stat(f); var par = self.find(dirname(s.abs), true).node; delete par.k[basename(s.abs)]; }); return 0; };
  C.gunzip = function (a, ctx) { var self = this; a.filter(function (x) { return x[0] !== '-'; }).forEach(function (f) { var r = self.readText(f); if (r.err) { ctx.err('gzip: ' + f + ': ' + self.fsMsg(r.err)); return; } if (r.text.indexOf('\u0000GZ') !== 0) { ctx.err('gzip: ' + f + ': not in gzip format'); return; } self.writeText(f.replace(/\.gz$/, ''), r.text.slice(3), false); var s = self.stat(f); delete self.find(dirname(s.abs), true).node.k[basename(s.abs)]; }); return 0; };
  C.zcat = function (a, ctx) { var r = this.readText(a[0] || ''); if (r.err) { ctx.err('gzip: ' + a[0] + ': ' + this.fsMsg(r.err)); return 1; } ctx.raw(r.text.replace(/^\u0000GZ/, '')); return 0; };

  // ======================================================================= tree / du
  C.tree = function (args, ctx) {
    var self = this, o = parseArgs(args, 'L'), target = o.rest[0] || '.', s = this.stat(target), dirs = 0, files = 0, max = o.v.L ? +o.v.L : 99;
    if (s.err) { ctx.err(target + ' [error opening dir]'); return 2; }
    ctx.out(target);
    (function rec(node, prefix, d) {
      if (d >= max) return;
      var names = Object.keys(node.k).filter(function (k) { return o.f.a || k.charAt(0) !== '.'; }).sort();
      names.forEach(function (k, i) {
        var n = node.k[k], last = i === names.length - 1;
        ctx.out(prefix + (last ? '└── ' : '├── ') + (n.t === 'd' ? self.color(ctx, 'd', k) : k));
        if (n.t === 'd') { dirs++; if (self.perm(n, 4)) rec(n, prefix + (last ? '    ' : '│   '), d + 1); } else files++;
      });
    })(s.node, '', 0);
    ctx.out(''); ctx.out(dirs + ' directories, ' + files + ' files');
    return 0;
  };
  M.cmdNeeds = M.cmdNeeds || {}; M.cmdNeeds.tree = 'tree';
  function dirSize(self, node) { var t = self.sizeOf(node); if (node.t === 'd') Object.keys(node.k).forEach(function (k) { t += dirSize(self, node.k[k]); }); return t; }
  C.du = function (args, ctx) {
    var self = this, o = parseArgs(args, 'd'), targets = o.rest.length ? o.rest : ['.'], code = 0;
    targets.forEach(function (t) {
      var s = self.stat(t); if (s.err) { ctx.err("du: cannot access '" + t + "': " + self.fsMsg(s.err)); code = 1; return; }
      var fmt = function (n) { return o.f.h ? human(n) : String(Math.ceil(n / 1024)); };
      if (o.f.s) { ctx.out(fmt(Math.max(dirSize(self, s.node), s.node.bytes || 0)) + '\t' + t); return; }
      (function rec(node, shown, d) {
        if (node.t === 'd') Object.keys(node.k).sort().forEach(function (k) { if (node.k[k].t === 'd' && (o.v.d === undefined || d < +o.v.d)) rec(node.k[k], shown + '/' + k, d + 1); });
        ctx.out(fmt(dirSize(self, node)) + '\t' + shown);
      })(s.node, t, 0);
    });
    return code;
  };
  man('du', 'du -sh PATH', 'How much disk space a folder uses.', ['du -sh /var/log', 'du -h --max-depth=1 /var'], { '-s': 'summary only', '-h': 'human-readable sizes' });

  // ======================================================================= editor (nano / vi) — UI opens a full-screen editor
  C.nano = C.vi = C.vim = function (args, ctx, name) {
    var f = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (!f) { ctx.err(name + ': please give a file name, e.g. ' + name + ' notes.txt'); return 1; }
    var s = this.stat(f), text = '', isNew = false;
    if (s.err === 'ENOENT') isNew = true;
    else if (s.err) { ctx.err(name + ': ' + f + ': ' + this.fsMsg(s.err)); return 1; }
    else if (s.node.t === 'd') { ctx.err(name + ': ' + f + ': Is a directory'); return 1; }
    else if (!this.perm(s.node, 4)) { ctx.err(name + ': ' + f + ': Permission denied'); return 1; }
    else text = s.node.c;
    this.editor = { path: this.norm(f), shown: f, text: text, isNew: isNew, name: name, uid: this.user.uid };
    return 0;
  };
  M.saveEditor = function (path, text, uid) { // called by the UI; runs as the user who opened the editor
    var self = this, u = this.user;
    Object.keys(this.users).forEach(function (k) { if (self.users[k].uid === uid) u = self.users[k]; });
    var e = this.withUser ? this.withUser(u, function () { return self.writeText(path, text, false); }) : this.writeText(path, text, false);
    if (!e) this.flags['edited:' + path] = (this.flags['edited:' + path] || 0) + 1;
    return e ? this.fsMsg(e) : null;
  };
  man('nano', 'nano FILE', 'A simple text editor. Opens a full-screen editor: Ctrl+O saves, Ctrl+X exits. To edit protected files use sudo nano.', ['nano notes.txt', 'sudo nano /etc/myapp/config.env']);

  // ======================================================================= help / man / explain
  C.man = function (args, ctx) {
    var n = args[args.length - 1], m = this.man[n];
    if (!n) { ctx.err('What manual page do you want?'); return 1; }
    if (!m) { ctx.err('No manual entry for ' + n); return 16; }
    ctx.out('NAME'); ctx.out('       ' + n + ' - ' + m.desc.split('.')[0]); ctx.out('');
    ctx.out('SYNOPSIS'); ctx.out('       ' + m.syn); ctx.out('');
    ctx.out('DESCRIPTION'); ctx.out('       ' + m.desc);
    var fk = Object.keys(m.flags || {});
    if (fk.length) { ctx.out(''); ctx.out('OPTIONS'); fk.forEach(function (k) { ctx.out('       ' + padR(k, 8) + m.flags[k]); }); }
    if (m.ex && m.ex.length) { ctx.out(''); ctx.out('EXAMPLES'); m.ex.forEach(function (e) { ctx.out('       $ ' + e); }); }
    return 0;
  };
  C.explain = function (args, ctx) {
    var self = this;
    if (!args.length) { ctx.out('Type  explain <command>  and I will say what it does in plain English.'); ctx.out('Example:  explain ls -la'); return 0; }
    var name = args[0] === 'sudo' ? args[1] : args[0], m = this.man[name];
    if (args[0] === 'sudo') ctx.out('sudo   → run the next command with administrator (root) power.');
    if (!m) { ctx.out("I don't have a lesson card for '" + name + "' yet. Try:  man " + name); return 0; }
    ctx.out(name + '   → ' + m.desc);
    var seen = 0;
    args.slice(args[0] === 'sudo' ? 2 : 1).forEach(function (a) {
      if (a.charAt(0) === '-' && a.charAt(1) !== '-') {
        if (m.flags && m.flags[a]) { ctx.out('  ' + a + '   → ' + m.flags[a]); seen++; return; }
        a.slice(1).split('').forEach(function (c) { var d = m.flags && m.flags['-' + c]; if (d) { ctx.out('  -' + c + '   → ' + d); seen++; } });
      } else if (m.flags && m.flags[a]) { ctx.out('  ' + a + '   → ' + m.flags[a]); seen++; }
      else if (a.charAt(0) !== '-') ctx.out('  ' + a + '   → the thing to work on (a file, folder or value)');
    });
    if (m.ex && m.ex.length) ctx.out('Try: ' + m.ex[0]);
    return 0;
  };
  C.help = function (args, ctx) {
    var self = this;
    ctx.out('This is a practice Linux server running in your browser. Everything here is safe to try.');
    ctx.out('');
    ctx.out('Start here:        pwd   ls   cd   cat   mkdir   touch   nano');
    ctx.out('Need a reminder?   man <command>      explain <command>      <command> --help');
    ctx.out('Handy keys:        Tab = auto-complete    ↑ = previous command    Ctrl+C = cancel    Ctrl+L = clear');
    var names = Object.keys(this.cmds).filter(function (n) { return self.cmdAvailable(n); }).sort();
    ctx.out(''); ctx.out(names.length + ' commands available:');
    var line = '  ';
    names.forEach(function (n) { if ((line + n).length > 76) { ctx.out(line); line = '  '; } line += n + '  '; });
    ctx.out(line);
    return 0;
  };
  C.reset = function (a, ctx) { ctx.out('(Use the "Reset server" button above the terminal to start over.)'); return 0; };
  man('explain', 'explain COMMAND [OPTIONS]', 'Plain-English help: what a command and its options do.', ['explain ls -la', 'explain chmod 755 file']);
  man('help', 'help', 'Show the beginner guide and the list of commands.', []);
  ['pwd', 'cd', 'echo', 'cp', 'mv', 'touch', 'history', 'export', 'clear', 'cut', 'tr', 'xargs', 'whoami', 'id', 'date', 'stat', 'file', 'chown'].forEach(function (n) { });
  man('pwd', 'pwd', 'Print Working Directory: show which folder you are in.', ['pwd']);
  man('cd', 'cd [DIR]', 'Change directory: move into another folder. "cd .." goes up, "cd" alone goes home, "cd -" goes back.', ['cd /var/log', 'cd ..', 'cd ~']);
  man('echo', 'echo [TEXT]', 'Print text. With > it writes the text into a file; >> adds to the end.', ['echo hello', 'echo "line" > file.txt', 'echo "more" >> file.txt']);
  man('cp', 'cp [-r] SOURCE DEST', 'Copy a file (or folder with -r).', ['cp a.txt b.txt', 'cp -r folder folder-backup'], { '-r': 'copy folders too' });
  man('mv', 'mv SOURCE DEST', 'Move or rename a file or folder.', ['mv old.txt new.txt', 'mv file.txt ~/projects/']);
  man('touch', 'touch FILE...', 'Create an empty file (or update its time).', ['touch notes.txt']);
  man('history', 'history', 'List the commands you typed before. Use !! to repeat the last one, or !N for number N.', ['history', '!!']);
  man('export', 'export NAME=value', 'Set an environment variable for programs you run.', ['export PORT=3000', 'echo $PORT']);
  man('whoami', 'whoami', 'Print which user you are.', ['whoami']);
  man('id', 'id [USER]', 'Show a user\'s numbers (uid, gid) and groups.', ['id', 'id www-data']);
  man('date', 'date [+FORMAT]', 'Show the date and time.', ['date', 'date +%F']);
  man('stat', 'stat FILE', 'Show everything about a file: size, owner, permissions, times.', ['stat notes.txt']);
  man('file', 'file FILE', 'Tell what type a file is.', ['file deploy.sh']);
  man('clear', 'clear', 'Clear the screen (or press Ctrl+L).', []);
})(typeof window !== 'undefined' ? window : global);
