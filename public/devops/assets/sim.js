// sim.js — a simulated shell for the DevOps Kit learning site.
// No DOM dependency in the core: createShell(data) can run in a browser
// or under Node for tests. The DOM binding at the bottom only runs when
// window.SIM_DATA exists.
//
// What the shell understands: the real lab commands (docker compose
// up/down/ps/logs/exec/stop/start/run, docker exec, kafka-topics,
// kafka-console-producer/consumer, psql -c, redis-cli, aws s3, curl,
// heredocs, for-loops, pipes to grep, && chains) plus common shell
// commands (ls, cd, pwd, echo, cat, history, help, clear, whoami, date)
// plus quick checks (python --version, ip addr, uname) and a hint for
// ipconfig, which is a Windows command.
// Wrong commands get a realistic error, like a real terminal.
// The simulated world is state-driven: containers start/stop, topics
// gain messages, keys get set, rows get inserted, mirrors copy files.
// Guided steps complete when the typed command matches OR when the
// simulated world reaches the right state (state wins for learning).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.SIMSHELL = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- small helpers ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function trimEnd(s) { return s.replace(/[ \t]+$/, ''); }
  function padRight(s, w) { s = String(s); while (s.length < w) s += ' '; return s; }
  function padLeft(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padCenter(s, w) {
    s = String(s); var n = w - s.length;
    if (n <= 0) return s;
    var l = Math.floor(n / 2), r = n - l;
    return ' '.repeat(l) + s + ' '.repeat(r);
  }
  function isNum(s) { return /^-?\d+(\.\d+)?$/.test(String(s)); }

  // Short fixed hashes for practice git commits (deterministic, in order).
  function gitHash(i) {
    var hs = ['a1b2c3d', 'e4f5a6b', 'c7d8e9f', 'b2a3c4d', 'f6e5d4c', '9a8b7c6', '1f2e3d4', '5a6b7c8'];
    return hs[i % hs.length];
  }

  // Deterministic 12-hex-char id from a name, for practice image listings.
  function fakeId(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 4294967291; }
    var hex = h.toString(16);
    while (hex.length < 12) hex = '0' + hex;
    return hex;
  }

  // Split file text into lines the way cat shows them:
  // a trailing newline does not make an extra blank line.
  function textLines(s) {
    var a = String(s).split('\n');
    if (a.length && a[a.length - 1] === '') a.pop();
    return a;
  }

  // Split a line into tokens, respecting single/double quotes.
  function tokenize(line) {
    var toks = [], cur = '', q = null, i, c;
    for (i = 0; i < line.length; i++) {
      c = line[i];
      if (q) {
        if (c === q) { q = null; }
        else if (c === '\\' && i + 1 < line.length) { cur += line[++i]; }
        else { cur += c; }
      } else if (c === "'" || c === '"') { q = c; }
      else if (c === ' ' || c === '\t') { if (cur !== '') { toks.push(cur); cur = ''; } }
      else if (c === '|' || c === ';' || c === '>' || c === '<') {
        if (cur !== '') { toks.push(cur); cur = ''; }
        if ((c === '>' || c === '<') && line[i + 1] === c) { toks.push(c + c); i++; }
        else { toks.push(c); }
      } else if (c === '&' && line[i + 1] === '&') {
        if (cur !== '') { toks.push(cur); cur = ''; }
        toks.push('&&'); i++;
      } else { cur += c; }
    }
    if (cur !== '') toks.push(cur);
    return toks;
  }

  // Normalize a command so equivalent spellings match a guided step:
  // collapse spaces, strip sudo, docker-compose -> docker compose,
  // -it/-i/-t on docker exec, trailing semicolons.
  function normalizeCmd(s) {
    s = String(s).replace(/\s+/g, ' ').trim();
    s = s.replace(/^sudo\s+/, '');
    s = s.replace(/docker-compose/g, 'docker compose');
    s = s.replace(/docker exec -[a-z]*t[a-z]* /g, 'docker exec ');
    s = s.replace(/docker exec -i /g, 'docker exec ');
    s = s.replace(/;$/, '');
    return s;
  }

  // Split tokens on a top-level operator (&& or |).
  function splitOn(toks, op) {
    var parts = [[]], t;
    for (var i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t === op) { parts.push([]); } else { parts[parts.length - 1].push(t); }
    }
    return parts;
  }

  // ---------- world ----------
  function initWorld(spec) {
    var w = {
      spec: spec,
      containers: {},   // name -> {project, status: 'down'|'up'|'stopped', role}
      redis: {},        // name -> {keys: {k: {v, exp}}, replica_of}
      kafka: {},        // cluster -> {topics: {name: [messages]}, heartbeats: bool}
      pg: { tables: {}, roles: {}, patroni: null },
      s3: {},           // store -> {buckets: {name: {file: {size, content, mirrorAt}}}}
      fs: {},           // dir -> [names]
      fileContents: {}, // path -> text
      curlIdx: 0, curlSeen: {}, curlCount: 0, curlAfterRestart: false,
      flags: {},        // string -> count
      filesWritten: {},
      producerSessions: 0,
      worker: { status: 'down', dbHost: null, saved: [], waiting: false },
      ingestProcessed: [], // file names processed by ingest
      timeOffset: 0,
      git: { initialized: false, branch: 'main', branches: ['main'], staged: [], commits: [], conflict: false, conflictFile: null, resolved: false, config: {} },
      gitConflict: null, // world spec {file, branch}: merging that branch conflicts
      k8s: { pods: {}, deployments: {}, services: {}, forwards: {} },
      k8sSuffix: 'abc12', // pod name suffix for deployments created by apply
      kind: { clusters: [], images: [] },
      tf: { initialized: false, planned: false, applied: false },
      dockerRunSeq: 0
    };
    // containers + projects
    var cn, pr;
    for (cn in (spec.containers || {})) {
      w.containers[cn] = { project: spec.containers[cn].project || 'root', status: 'down', role: spec.containers[cn].role || null };
    }
    // redis stores
    for (cn in (spec.redis || {})) {
      w.redis[cn] = { keys: {}, replica_of: spec.redis[cn].replica_of || null };
    }
    // kafka clusters
    (spec.kafka_clusters || []).forEach(function (cl) {
      w.kafka[cl] = { topics: {}, heartbeats: cl === 'kafka-b' };
      if (cl === 'kafka-b') { w.kafka[cl].topics['heartbeats'] = ['hb']; }
    });
    // s3 stores
    (spec.s3_stores || []).forEach(function (st) {
      w.s3[st] = { buckets: {} };
    });
    // fake file system
    w.fs = clone(spec.fs || {});
    w.fileContents = clone(spec.file_contents || {});
    // patroni
    if (spec.patroni) {
      w.pg.patroni = {
        members: clone(spec.patroni.members), // name -> {role}
        leader: spec.patroni.leader,
        table: { cols: [], rows: [] }
      };
    }
    // initial order files (end-to-end): they sit in /incoming at up time
    (spec.initial_files || []).forEach(function (f) {
      w.fileContents[f.path] = f.content;
    });
    // git seed (new lesson sims): a repo the learner starts inside
    if (spec.git) {
      var g = spec.git;
      if (g.initialized) w.git.initialized = true;
      if (g.branch) w.git.branch = g.branch;
      if (g.branches) w.git.branches = g.branches.slice();
      if (w.git.branches.indexOf(w.git.branch) === -1) w.git.branches.push(w.git.branch);
      if (g.staged) w.git.staged = g.staged.slice();
      (g.commits || []).forEach(function (c, i) {
        w.git.commits.push(typeof c === 'string' ? { hash: gitHash(i), msg: c } : { hash: c.hash || gitHash(i), msg: c.msg || '' });
      });
    }
    if (spec.git_conflict) w.gitConflict = spec.git_conflict;
    // k8s seed (new lesson sims): deployments, pods, services already there
    var k8sSpec = spec.k8s || {};
    w.k8sSuffix = k8sSpec.podSuffix || spec.k8s_pod_suffix || 'abc12';
    w.k8s.services['kubernetes'] = { name: 'kubernetes', type: 'ClusterIP', clusterIP: '10.96.0.1', ports: '443/TCP', age: '10m' };
    (k8sSpec.services || []).forEach(function (s) {
      w.k8s.services[s.name] = { name: s.name, type: s.type || 'ClusterIP', clusterIP: s.clusterIP || '10.96.0.10', ports: s.ports || '80/TCP', age: s.age || '5m' };
    });
    (k8sSpec.deployments || []).forEach(function (d) {
      var dep = { name: d.name, image: d.image || 'nginx:1.25', ready: '1/1', upToDate: 1, available: 1, age: d.age || '5m', replicas: d.replicas || 1 };
      w.k8s.deployments[d.name] = dep;
      var podName = d.name + '-' + w.k8sSuffix;
      w.k8s.pods[podName] = { name: podName, ready: '1/1', status: 'Running', restarts: 0, age: '5m', deployment: d.name, image: dep.image };
    });
    (k8sSpec.pods || []).forEach(function (p) {
      w.k8s.pods[p.name] = { name: p.name, ready: p.ready || '1/1', status: p.status || 'Running', restarts: p.restarts || 0, age: p.age || '5m', deployment: p.deployment || null, image: p.image || 'nginx:1.25' };
    });
    if (spec.kind) {
      w.kind.clusters = (spec.kind.clusters || []).slice();
      w.kind.images = (spec.kind.images || []).slice();
    }
    if (spec.tf) {
      w.tf.initialized = !!spec.tf.initialized;
      w.tf.planned = !!spec.tf.planned;
      w.tf.applied = !!spec.tf.applied;
    }
    return w;
  }

  function now(w) { return Date.now() + w.timeOffset; }

  function flag(w, name) { w.flags[name] = (w.flags[name] || 0) + 1; }

  // ---------- shell ----------
  function createShell(data) {
    var w = initWorld(data.world || {});
    var cwd = '/home/learner';
    var history = [];
    var mode = null; // {type:'producer', cluster, topic} | {type:'heredoc', file, delim, lines}
    var pgTableName = 'orders'; // default table for the pg lab

    function prompt() {
      if (mode) return '>';
      var short = cwd === '/home/learner' ? '~' : '~' + cwd.slice('/home/learner'.length);
      return 'learner@devops:' + short + '$';
    }

    function project() {
      return cwd === '/home/learner/patroni' ? 'patroni' : 'root';
    }

    function containersOf(proj) {
      var out = [];
      for (var n in w.containers) { if (w.containers[n].project === proj) out.push(n); }
      return out;
    }

    function serviceToContainer(svc) {
      // services map to containers; in most labs the names are the same,
      // but the postgresql lab uses service names primary/replica
      var map = w.spec.services || {};
      if (map[svc]) return map[svc];
      if (w.containers[svc]) return svc;
      return null;
    }

    // MirrorMaker 2: copy messages from kafka-a topic to kafka-b as a.<topic>
    function mm2Mirror(topic, msg) {
      var b = w.kafka['kafka-b'];
      if (!b) return;
      var at = 'a.' + topic;
      if (!b.topics[at]) b.topics[at] = [];
      b.topics[at].push(msg);
    }

    // Ingest (end-to-end): a new order file in /incoming is processed:
    // stored in the object store bucket, sent to Kafka, saved by the worker.
    function ingestFile(path) {
      var name = path.split('/').pop();
      var content = w.fileContents[path] || '';
      var order = null;
      try { order = JSON.parse(content); } catch (e) { order = null; }
      // store in bucket 'incoming' on the object store
      // (ingest creates the bucket itself, like the real one)
      var moto = w.s3[w.spec.s3_main || 'moto-a'];
      if (moto) {
        if (!moto.buckets['incoming']) moto.buckets['incoming'] = {};
        moto.buckets['incoming'][name] = { size: content.length, content: content, mirrorAt: now(w) + (w.spec.mirror_delay_ms || 3000) };
      }
      // send to kafka topic 'orders'
      if (w.kafka['kafka']) {
        if (!w.kafka['kafka'].topics['orders']) w.kafka['kafka'].topics['orders'] = [];
        w.kafka['kafka'].topics['orders'].push(content);
        mm2Mirror2('orders', content);
      }
      w.ingestProcessed.push(name);
      // worker saves it if it is running and its database is up
      if (order && w.worker.status === 'up') {
        var db = w.worker.dbHost;
        var cont = db && w.containers[db];
        if (cont && cont.status === 'up') {
          var tb = w.pg.tables['orders'];
          if (tb) {
            var row = tb.cols.map(function (c) { return order[c] === undefined ? '' : order[c]; });
            tb.rows.push(row);
            w.worker.saved.push('Saved order ' + order.id + ': ' + order.item + ' (' + order.amount + ')');
            // counter in redis
            var rs = w.redis['redis'];
            if (rs) {
              var cur = rs.keys['orders:count'];
              var n = cur ? parseInt(cur.v, 10) : 0;
              rs.keys['orders:count'] = { v: String(n + 1) };
              mirrorRedis('redis', 'orders:count');
            }
          }
        } else {
          w.worker.waiting = true;
        }
      }
    }

    function mm2Mirror2(topic, msg) { /* end-to-end has no second kafka cluster */ }

    function mirrorRedis(store, key) {
      for (var n in w.redis) {
        if (w.redis[n].replica_of === store) {
          w.redis[n].keys[key] = clone(w.redis[store].keys[key]);
        }
      }
    }

    function sweepMirror() {
      // copy files whose mirror time has passed from moto-a to moto-b
      var a = w.s3['moto-a'], b = w.s3['moto-b'];
      if (!a || !b) return;
      var t = now(w);
      for (var bk in a.buckets) {
        if (!b.buckets[bk]) b.buckets[bk] = {};
        for (var f in a.buckets[bk]) {
          var file = a.buckets[bk][f];
          if (file.mirrorAt && file.mirrorAt <= t && !b.buckets[bk][f]) {
            b.buckets[bk][f] = clone(file);
          }
        }
      }
    }

    function errOut(lines) { return { lines: lines, kind: 'err' }; }
    function okOut(lines) { return { lines: lines, kind: 'out' }; }

    // ---------- psql table printer ----------
    function printTable(cols, rows) {
      var widths = cols.map(function (c, i) {
        var m = String(c).length;
        rows.forEach(function (r) { m = Math.max(m, String(r[i]).length); });
        return m;
      });
      var head = cols.map(function (c, i) { return ' ' + padCenter(c, widths[i]) + ' '; }).join('|');
      var sep = widths.map(function (wd) { return '-'.repeat(wd + 2); }).join('+');
      var lines = [trimEnd(head), sep];
      rows.forEach(function (r) {
        var cells = r.map(function (v, i) {
          var s = String(v);
          return ' ' + (isNum(s) ? padLeft(s, widths[i]) : padRight(s, widths[i])) + ' ';
        });
        lines.push(trimEnd(cells.join('|')));
      });
      lines.push('(' + rows.length + (rows.length === 1 ? ' row)' : ' rows)'));
      return lines;
    }

    // ---------- SQL executor ----------
    function runSql(container, db, sql) {
      sql = sql.trim().replace(/;$/, '');
      var m, i;
      // CREATE TABLE
      if ((m = /^CREATE TABLE (\w+) \((.+)\)$/i.exec(sql))) {
        var tname = m[1];
        var cols = splitTopLevel(m[2]).map(function (c) { return c.trim().split(/\s+/)[0]; });
        var target = patroniDb(container) ? 'patroni:orders' : tname;
        w.pg.tables[target] = { cols: cols, rows: [] };
        return okOut(['CREATE TABLE']);
      }
      // INSERT INTO
      if ((m = /^INSERT INTO (\w+) VALUES (.+)$/i.exec(sql))) {
        var t2 = m[1];
        var target2 = patroniDb(container) ? 'patroni:orders' : t2;
        var tb = w.pg.tables[target2];
        if (!tb) return errOut(['ERROR:  relation "' + t2 + '" does not exist']);
        if (isReadOnly(container)) { flag(w, 'readonly_error'); return errOut(['ERROR:  cannot execute INSERT in a read-only transaction']); }
        var vals = m[2];
        var tuples = vals.split(/\),\s*\(/).map(function (t) { return t.replace(/^\(|\)$/g, ''); });
        var count = 0;
        tuples.forEach(function (t) {
          var parts = splitCsv(t);
          var row = parts.map(function (p) {
            p = p.trim();
            if (p[0] === "'" && p[p.length - 1] === "'") return p.slice(1, -1);
            return isNum(p) ? Number(p) : p;
          });
          tb.rows.push(row); count++;
        });
        return okOut(['INSERT 0 ' + count]);
      }
      // SELECT * FROM
      if ((m = /^SELECT \* FROM (\w+)( ORDER BY (\w+))?$/i.exec(sql))) {
        var t3 = m[1];
        var target3 = patroniDb(container) ? 'patroni:orders' : t3;
        var tb3 = w.pg.tables[target3];
        if (!tb3) return errOut(['ERROR:  relation "' + t3 + '" does not exist']);
        flag(w, 'selected:' + container);
        var rows = tb3.rows.slice();
        if (m[3]) {
          var ci = tb3.cols.indexOf(m[3]);
          if (ci >= 0) rows.sort(function (a, b) { return a[ci] - b[ci]; });
        }
        return okOut(printTable(tb3.cols, rows));
      }
      // pg_promote
      if (/^SELECT pg_promote\(\)$/i.test(sql)) {
        var cont = w.containers[container];
        if (cont) { cont.role = 'primary'; }
        flag(w, 'promoted:' + container);
        return okOut(printTable(['pg_promote'], [['t']]));
      }
      // pg_is_in_recovery
      if (/^SELECT pg_is_in_recovery\(\)$/i.test(sql)) {
        var cont2 = w.containers[container];
        var rec = !(cont2 && cont2.role === 'primary');
        flag(w, 'recovery_checked');
        var tbl = printTable(['pg_is_in_recovery'], [[rec ? 't' : 'f']]);
        return okOut(tbl);
      }
      return errOut(['ERROR:  syntax error at or near "' + sql.split(' ')[0] + '"']);
    }

    function patroniDb(container) {
      return container === 'patroni-1' || container === 'patroni-2';
    }
    function isReadOnly(container) {
      var c = w.containers[container];
      if (!c) return false;
      if (c.role === 'replica') return true;
      if (patroniDb(container)) {
        var p = w.pg.patroni;
        return p && p.leader !== container;
      }
      return false;
    }
    function splitCsv(s) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c === "'") { q = !q; cur += c; }
        else if (c === ',' && !q) { out.push(cur); cur = ''; }
        else { cur += c; }
      }
      out.push(cur);
      return out;
    }

    // Split on commas that are NOT inside parentheses or quotes,
    // so column types like NUMERIC(10,2) stay whole.
    function splitTopLevel(s) {
      var out = [], cur = '', depth = 0, q = null;
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (q) {
          cur += c;
          if (c === q) q = null;
        } else if (c === "'" || c === '"') { q = c; cur += c; }
        else if (c === '(') { depth++; cur += c; }
        else if (c === ')') { if (depth > 0) depth--; cur += c; }
        else if (c === ',' && depth === 0) { out.push(cur); cur = ''; }
        else { cur += c; }
      }
      out.push(cur);
      return out;
    }

    // ---------- the main runner ----------
    function run(rawLine, opts) {
      var line = rawLine;
      // interactive modes first
      if (mode && mode.type === 'producer') return producerInput(line);
      if (mode && mode.type === 'heredoc') return heredocInput(line);
      if (!line.trim()) return { lines: [], kind: 'out', clear: false };
      if (!opts || !opts.noHistory) history.push(line);
      // for-loop (whole line)
      if (/^\s*for\s+\w+\s+in\s+/.test(line)) return runForLoop(line);
      var parts = splitOn(tokenize(line), '&&');
      var all = [], kind = 'out', clear = false, i;
      for (i = 0; i < parts.length; i++) {
        if (parts[i].length === 0) continue;
        var r = runSingle(parts[i]);
        if (r.clear) clear = true;
        if (r.kind === 'err') kind = 'err';
        all = all.concat(r.lines);
        if (r.stop) break;
      }
      return { lines: all, kind: kind, clear: clear };
    }

    function runForLoop(line) {
      var m = /^\s*for\s+(\w+)\s+in\s+([^;]+);\s*do\s+(.+?);\s*done\s*$/.exec(line);
      if (!m) return errOut(['bash: syntax error near unexpected token `for\'']);
      var vname = m[1];
      var items = m[2].trim().split(/\s+/);
      var body = m[3].trim();
      var all = [];
      flag(w, 'forloop');
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        // substitute the loop variable ($i and ${i}) with the current item
        var sub = body.replace(new RegExp('\\${' + vname + '}', 'g'), item)
                      .replace(new RegExp('\\$' + vname + '(?![A-Za-z0-9_])', 'g'), item);
        // run the body without pushing it into history on every iteration
        var r = run(sub, { noHistory: true });
        all = all.concat(r.lines);
      }
      return okOut(all);
    }

    function runSingle(toks) {
      // pipes: cmd | grep pattern
      var pipe = splitOn(toks, '|');
      if (pipe.length > 1) {
        var first = runSingleNoPipe(pipe[0]);
        var lines = first.lines;
        for (var i = 1; i < pipe.length; i++) {
          var g = pipe[i];
          if (g[0] === 'grep' && g[1]) {
            var pat = g[1];
            lines = lines.filter(function (l) { return l.indexOf(pat) !== -1; });
          } else {
            return errOut(['bash: ' + (g[0] || '') + ': command not found']);
          }
        }
        return { lines: lines, kind: first.kind, clear: false };
      }
      return runSingleNoPipe(toks);
    }

    function runSingleNoPipe(toks) {
      sweepMirror();
      var cmd = toks[0];
      if (!cmd) return okOut([]);
      if (cmd === 'sudo') return runSingleNoPipe(toks.slice(1));
      // Running a script by path: ./kit-doctor.sh or /home/learner/x.sh
      if (cmd.indexOf('./') === 0 || (/\.sh$/.test(cmd) && cmd.indexOf('/') >= 0)) {
        return scriptCmd([cmd].concat(toks.slice(1)), cmd);
      }
      // Windows users type Ipconfig out of habit; answer the confusion
      // instead of "command not found" (matched case-insensitively).
      if (cmd.toLowerCase() === 'ipconfig') return okOut(['ipconfig is a Windows command. On Linux, try: ip addr']);
      switch (cmd) {
        case 'help': return okOut(helpText());
        case 'clear': return { lines: [], kind: 'out', clear: true };
        case 'history': return okOut(history.map(function (h, i) { return '  ' + (i + 1) + '  ' + h; }));
        case 'pwd': return okOut([cwd]);
        case 'whoami': return okOut(['learner']);
        case 'date': return okOut([new Date(now(w)).toString()]);
        case 'exit': return okOut(['logout']);
        case 'echo': return okOut([toks.slice(1).join(' ')]);
        case 'ls': return lsCmd(toks.slice(1));
        case 'cd': return cdCmd(toks.slice(1));
        case 'cat': return catCmd(toks.slice(1));
        case 'chmod': return chmodCmd(toks.slice(1));
        case 'docker': return dockerCmd(toks.slice(1));
        case 'curl': return curlCmd(toks.slice(1));
        case 'python':
        case 'python3': return pythonCmd(toks.slice(1));
        case 'ip': return ipCmd(toks.slice(1));
        case 'uname': return unameCmd(toks.slice(1));
        case 'git': return gitCmd(toks.slice(1));
        case 'kubectl': return kubectlCmd(toks.slice(1));
        case 'kind': return kindCmd(toks.slice(1));
        case 'terraform': return tfCmd(toks.slice(1));
        case 'mkdir': return mkdirCmd(toks.slice(1));
        case 'rm': return rmCmd(toks.slice(1));
        case 'cp': return cpCmd(toks.slice(1));
        case 'mv': return mvCmd(toks.slice(1));
        case 'touch': return touchCmd(toks.slice(1));
        case 'df': return dfCmd(toks.slice(1));
        case 'free': return freeCmd(toks.slice(1));
        case 'ps': return psCmd(toks.slice(1));
        case 'top': return topCmd(toks.slice(1));
        case 'bash': return scriptCmd(toks.slice(1), 'bash');
        case 'sh': return scriptCmd(toks.slice(1), 'sh');
        default:
          return errOut(['bash: ' + cmd + ': command not found', 'Type help to see what this practice terminal understands.']);
      }
    }

    // Quick checks people type first in a new box. Fixed outputs, in
    // the same style as the rest of the engine: real syntax, one answer.
    function pythonCmd(args) {
      if (args[0] === '--version' || args[0] === '-V') return okOut(['Python 3.12.3']);
      return okOut(['Python 3.12.3', 'Interactive mode and scripts are not available in this practice terminal. Try: python --version']);
    }

    function ipCmd(args) {
      if (args[0] === 'addr' || args[0] === 'a') return okOut([
        '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536',
        '    inet 127.0.0.1/8 scope host lo',
        '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
        '    inet 172.18.0.5/16 scope global eth0'
      ]);
      return errOut(['ip: this practice terminal only answers "ip addr". Try: ip addr']);
    }

    function unameCmd(args) {
      if (args[0] === '-a') return okOut(['Linux devops-kit 6.8.0-generic x86_64 GNU/Linux']);
      return okOut(['Linux']);
    }

    function helpText() {
      return [
        'What this practice terminal understands:',
        '',
        '  docker compose up -d        start the lab',
        '  docker compose down -v      stop everything',
        '  docker compose ps           list the containers',
        '  docker compose logs <name>  read a container\'s logs',
        '  docker compose stop <name>  stop one container',
        '  docker compose start <name> start it again',
        '  docker exec <name> <tool>   run a tool inside a container',
        '  kafka-topics / producer / consumer   (inside a kafka container)',
        '  psql -U learner -d orders -c "SQL"   (inside a postgres container)',
        '  redis-cli -h redis-a PING / SET / GET / INCR / TTL / INFO',
        '  aws --endpoint-url http://moto-a:5000 s3 ls / mb / cp',
        '  curl http://localhost:8080/  try the load balancer',
        '  docker --version / docker version   check the Docker version',
        '  docker run -d --name web nginx     run one container',
        '  docker stop / start / rm <name>    stop, start or remove it',
        '  git init / status / add / commit / log / branch / checkout / merge',
        '  kubectl get pods / apply -f file.yaml / logs <pod> / port-forward',
        '  kind create cluster --name demo    start a local cluster',
        '  terraform init / plan / apply / destroy',
        '  mkdir / rm / cp / mv / touch / df -h / free -h / ps aux / top',
        '  bash kit-doctor.sh / ./kit-doctor.sh   run a script',
        '  cat > file << \'EOF\'         write a file (type EOF to finish)',
        '  python --version / ip addr / uname   quick checks this box answers',
        '',
        '  ls  cd  pwd  echo  cat  chmod  history  clear  help  bash',
        '',
        'Up and Down arrows repeat earlier commands. Tab completes names.',
        'Type exit or press Ctrl+C to leave a running program.'
      ];
    }

    function resolvePath(p) {
      if (!p) return cwd;
      if (p === '~') return '/home/learner';
      if (p[0] === '/') return p;
      var base = cwd;
      if (p === '.') return base;
      if (p === '..') return base.split('/').slice(0, -1).join('/') || '/';
      return base + '/' + p;
    }

    function lsCmd(args) {
      var path = resolvePath(args[0] || '.');
      var names = w.fs[path];
      if (!names) return errOut(['ls: cannot access \'' + (args[0] || '.') + '\': No such file or directory']);
      var shown = names.slice();
      // dynamic: files written into a dir appear here
      for (var p in w.fileContents) {
        var dir = p.split('/').slice(0, -1).join('/') || '/';
        if (dir === path) {
          var base = p.split('/').pop();
          if (shown.indexOf(base) === -1) shown.push(base);
        }
      }
      return okOut([shown.join('  ')]);
    }

    function cdCmd(args) {
      if (!args[0]) { cwd = '/home/learner'; return okOut([]); }
      var path = resolvePath(args[0]);
      if (!w.fs[path] && path !== '/home/learner') return errOut(['bash: cd: ' + args[0] + ': No such file or directory']);
      cwd = path;
      return okOut([]);
    }

    function catCmd(args) {
      // heredoc start: cat > file << 'EOF'
      var gt = args.indexOf('>');
      if (gt >= 0 && args.indexOf('<<') >= 0) {
        var file = args[gt + 1];
        var delim = args[args.indexOf('<<') + 1].replace(/['"]/g, '');
        mode = { type: 'heredoc', file: resolvePath(file), delim: delim, lines: [] };
        return okOut([]);
      }
      var path = resolvePath(args[0]);
      var content = w.fileContents[path];
      if (content === undefined) return errOut(['cat: ' + (args[0] || '') + ': No such file or directory']);
      return okOut(textLines(content));
    }

    function chmodCmd(args) {
      if (args.length === 0) return errOut(['chmod: missing operand', 'Try \'chmod --help\' for more information.']);
      if (args.indexOf('-R') >= 0 && args.length < 3) {
        // e.g. "chmod -R a+r" with no target — the classic mistake
        return errOut(['chmod: missing operand after \'a+r\'', 'Try \'chmod --help\' for more information.']);
      }
      flag(w, 'chmod');
      return okOut([]);
    }

    function heredocInput(line) {
      var t = line.trim();
      if (t === '^C' || t === 'exit') {
        // Ctrl+C cancels the heredoc — the file is not written
        mode = null;
        return { lines: ['^C', '(cancelled — the file was not written)'], kind: 'out', clear: false };
      }
      if (t === mode.delim) {
        var file = mode.file;
        var content = mode.lines.join('\n');
        mode = null;
        w.fileContents[file] = content;
        w.filesWritten[file] = true;
        flag(w, 'file_written:' + file);
        // an order file in /incoming is processed by the ingest service
        if (file.indexOf('/incoming/') >= 0 && file.slice(-5) === '.json') ingestFile(file);
        return { lines: [], kind: 'out', clear: false };
      }
      mode.lines.push(line);
      return { lines: [], kind: 'out', clear: false };
    }

    function producerInput(line) {
      var t = line.trim();
      if (t === 'exit' || t === '^C') {
        var topic = mode.topic, cluster = mode.cluster;
        mode = null;
        w.producerSessions++;
        flag(w, 'producer_exit');
        return { lines: ['^C'], kind: 'out', clear: false };
      }
      var cl = w.kafka[mode.cluster];
      if (cl) {
        if (!cl.topics[mode.topic]) cl.topics[mode.topic] = [];
        cl.topics[mode.topic].push(line);
        mm2Mirror(mode.topic, line);
      }
      return { lines: [], kind: 'out', clear: false };
    }

    // ---------- docker ----------
    function dockerCmd(args) {
      if (args[0] === 'compose') return composeCmd(args.slice(1));
      if (args[0] === '--version' || args[0] === 'version') return okOut(['Docker version 26.1.3, build 26.1.3-0ubuntu1']);
      if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') return okOut(dockerHelpText());
      if (args[0] === 'run') return dockerRunCmd(args.slice(1));
      if (args[0] === 'stop') return dockerStopCmd(args.slice(1));
      if (args[0] === 'start') return dockerStartCmd(args.slice(1));
      if (args[0] === 'rm') return dockerRmCmd(args.slice(1));
      if (args[0] === 'images') return dockerImagesCmd(args.slice(1));
      if (args[0] === 'ps') {
        var showAll = args.indexOf('-a') >= 0 || args.indexOf('--all') >= 0;
        var ups = [];
        for (var n in w.containers) {
          var st = w.containers[n].status;
          if (st === 'up') ups.push(n + '  Up');
          else if (showAll && st === 'stopped') ups.push(n + '  Exited');
          else if (showAll && st === 'down') ups.push(n + '  Created');
        }
        if (!ups.length) return okOut(['No containers are running yet. Run docker compose up -d first.']);
        return okOut(ups);
      }
      if (args[0] === 'exec') return execCmd(args.slice(1));
      if (args[0] === 'logs') return logsCmd([args[1]]);
      return errOut(['docker: \'' + (args[0] || '') + '\' is not a docker command', 'See \'docker --help\'.']);
    }

    function composeCmd(args) {
      var sub = args[0];
      if (sub === 'version' || sub === '--version') return okOut(['Docker Compose version v2.27.0']);
      if (sub === 'up') {
        var proj = project();
        var names = containersOf(proj);
        names.forEach(function (n) { w.containers[n].status = 'up'; });
        var upOut = (w.spec.up_out && w.spec.up_out[proj]) || names.map(function (n) { return '✔ Container ' + n + '  Started'; });
        flag(w, 'up:' + proj);
        if (proj === 'root' && w.spec.initial_files) {
          // the ingest service processes the files that were already there.
          // The worker creates the orders table itself, like the real one.
          if (!w.pg.tables['orders']) {
            w.pg.tables['orders'] = { cols: ['id', 'item', 'amount', 'buyer'], rows: [] };
          }
          w.spec.initial_files.forEach(function (f) {
            var order = null;
            try { order = JSON.parse(f.content); } catch (e) {}
            if (order) {
              if (!w.kafka['kafka']) w.kafka['kafka'] = { topics: {} };
              if (!w.kafka['kafka'].topics['orders']) w.kafka['kafka'].topics['orders'] = [];
              w.kafka['kafka'].topics['orders'].push(f.content);
              var moto = w.s3[w.spec.s3_main || 'moto-a'];
              if (moto) {
                if (!moto.buckets['incoming']) moto.buckets['incoming'] = {};
                moto.buckets['incoming'][f.path.split('/').pop()] = { size: f.content.length, content: f.content, mirrorAt: now(w) + (w.spec.mirror_delay_ms || 3000) };
              }
              var tb = w.pg.tables['orders'];
              if (tb && tb.cols.length) {
                tb.rows.push(tb.cols.map(function (c) { return order[c] === undefined ? '' : order[c]; }));
              }
              w.worker.saved.push('Saved order ' + order.id + ': ' + order.item + ' (' + order.amount + ')');
              var rs = w.redis['redis'];
              if (rs) rs.keys['orders:count'] = { v: String((rs.keys['orders:count'] ? parseInt(rs.keys['orders:count'].v, 10) : 0) + 1) };
              w.ingestProcessed.push(f.path.split('/').pop());
            }
          });
          w.worker.status = 'up';
          w.worker.dbHost = 'postgres-primary';
        }
        return okOut(upOut);
      }
      if (sub === 'down') {
        var proj2 = project();
        var n2 = 0;
        containersOf(proj2).forEach(function (cn) { if (w.containers[cn].status !== 'down') { w.containers[cn].status = 'down'; n2++; } });
        w.worker.status = 'down';
        flag(w, 'down');
        var downOut = w.spec.down_out || (n2 + ' containers removed');
        return okOut([downOut]);
      }
      if (sub === 'ps') {
        flag(w, 'ps');
        var rows = [];
        containersOf(project()).forEach(function (cn) {
          var st = w.containers[cn].status;
          if (st === 'up') rows.push(cn + '  Up');
          else if (st === 'stopped') rows.push(cn + '  Exited');
        });
        if (!rows.length) return okOut(['No containers are running yet. Run docker compose up -d first.']);
        return okOut(rows);
      }
      if (sub === 'logs') return logsCmd(args.slice(1));
      if (sub === 'exec') return execCmd(args.slice(1), true);
      if (sub === 'stop') {
        var svc = args[1];
        var cont = serviceToContainer(svc);
        if (!cont) return errOut(['no such service: ' + svc]);
        w.containers[cont].status = 'stopped';
        flag(w, 'stopped:' + cont);
        if (cont === 'postgres-primary') w.worker.waiting = true;
        // Patroni: stopping the leader hands the job to the other member
        if (cont === 'patroni-1' && w.pg.patroni && w.pg.patroni.leader === 'patroni-1') {
          w.pg.patroni.leader = 'patroni-2';
        }
        return okOut(['✔ Container ' + cont + '  Stopped']);
      }
      if (sub === 'start') {
        var svc2 = args[1];
        var cont2 = serviceToContainer(svc2);
        if (!cont2) return errOut(['no such service: ' + svc2]);
        w.containers[cont2].status = 'up';
        flag(w, 'started:' + cont2);
        if (cont2 === 'web2') w.curlAfterRestart = true;
        // a backend that just came back gets the next request
        var hosts = w.spec.curl_hosts || [];
        var hi = hosts.indexOf(cont2);
        if (hi >= 0) w.curlIdx = hi;
        return okOut(['✔ Container ' + cont2 + '  Started']);
      }
      if (sub === 'run') return runCmd(args.slice(1));
      return errOut(['unknown command "' + (sub || '') + '" for "docker compose"', 'Run \'docker compose --help\' for usage.']);
    }

    function execCmd(args, isCompose) {
      // strip flags like -it / -i / -t
      var i = 0;
      while (i < args.length && /^-/.test(args[i])) i++;
      var target = args[i];
      var inner = args.slice(i + 1);
      if (!target) return errOut(['"docker exec" requires a container name']);
      var cont = serviceToContainer(target);
      if (!cont) return errOut(['Error: No such container: ' + target]);
      var c = w.containers[cont];
      if (c.status !== 'up') return errOut(['Error: container ' + cont + ' is not running']);
      return execInside(cont, inner);
    }

    function logsCmd(args) {
      var svc = args[0];
      var cont = serviceToContainer(svc);
      if (!cont) return errOut(['no such service: ' + svc]);
      flag(w, 'logs:' + svc);
      if (svc === 'replica' || svc === 'postgres-replica') {
        return okOut(['Copy done.']);
      }
      if (svc === 'ingest') {
        var lines = ['Connected to Kafka.', 'Connected to the object store.', 'Watching /incoming for new order files...'];
        w.ingestProcessed.forEach(function (f) {
          var content = w.fileContents['/home/learner/incoming/' + f] || '';
          lines.push('Sent ' + f + ': ' + content);
        });
        return okOut(lines);
      }
      if (svc === 'worker') {
        var wl = ['Connected to PostgreSQL.', 'Connected to Redis.', 'Connected to Kafka. Waiting for orders...'];
        wl = wl.concat(w.worker.saved);
        if (w.worker.waiting) wl.push('Waiting for PostgreSQL...');
        return okOut(wl);
      }
      return okOut(['(no logs yet — this service prints nothing)']);
    }

    function runCmd(args) {
      // docker compose run [--no-deps] [--rm] [-e KEY=VAL]... <service>
      var env = {}, svc = null;
      for (var i = 0; i < args.length; i++) {
        if (args[i] === '-e' && args[i + 1]) {
          var kv = args[i + 1].split('=');
          env[kv[0]] = kv[1]; i++;
        } else if (args[i][0] !== '-') { svc = args[i]; }
      }
      if (!svc) return errOut(['"docker compose run" requires a service name']);
      var cont = serviceToContainer(svc);
      if (!cont) return errOut(['no such service: ' + svc]);
      w.containers[cont].status = 'up';
      if (svc === 'worker') {
        w.worker.status = 'up';
        w.worker.dbHost = env.PG_HOST || 'postgres-primary';
        w.worker.saved = [];
        w.worker.waiting = false;
        flag(w, 'worker_rerun');
        return okOut(['Connected to PostgreSQL.', 'Connected to Redis.', 'Connected to Kafka. Waiting for orders...']);
      }
      return okOut(['✔ Container ' + cont + '  Started']);
    }

    function execInside(cont, inner) {
      var tool = inner[0];
      if (!tool) return okOut([]);
      if (tool.indexOf('kafka-topics') >= 0) return kafkaTopics(cont, inner.slice(1));
      if (tool.indexOf('kafka-console-producer') >= 0) return kafkaProducer(cont, inner.slice(1));
      if (tool.indexOf('kafka-console-consumer') >= 0) return kafkaConsumer(cont, inner.slice(1));
      if (tool === 'psql') return psqlCmd(cont, inner.slice(1));
      if (tool === 'redis-cli') return redisCmd(cont, inner.slice(1));
      if (tool === 'aws') return awsCmd(cont, inner.slice(1));
      if (tool === 'curl') return curlCmd(inner.slice(1));
      if (tool === 'sh' || tool === 'bash') return okOut([]);
      return errOut(['bash: ' + tool + ': command not found']);
    }

    // ---------- kafka ----------
    function optVal(args, name) {
      var i = args.indexOf(name);
      return i >= 0 && args[i + 1] ? args[i + 1] : null;
    }

    function kafkaTopics(cont, args) {
      var cl = w.kafka[cont];
      if (!cl) return errOut(['Error: ' + cont + ' is not a kafka broker']);
      if (args.indexOf('--list') >= 0) {
        flag(w, 'listed:' + cont);
        var names = Object.keys(cl.topics);
        if (cl.heartbeats && names.indexOf('heartbeats') === -1) names.push('heartbeats');
        return okOut(names.sort());
      }
      if (args.indexOf('--create') >= 0) {
        var t = optVal(args, '--topic');
        if (!t) return errOut(['kafka-topics: --topic is required']);
        if (!cl.topics[t]) cl.topics[t] = [];
        return okOut(['Created topic ' + t + '.']);
      }
      return errOut(['Try \'kafka-topics.sh --list\' or \'--create --topic <name>\'.']);
    }

    function kafkaProducer(cont, args) {
      var cl = w.kafka[cont];
      if (!cl) return errOut(['Error: ' + cont + ' is not a kafka broker']);
      var t = optVal(args, '--topic');
      if (!t) return errOut(['kafka-console-producer: --topic is required']);
      if (!cl.topics[t]) return errOut(['Error: topic ' + t + ' does not exist. Create it first with kafka-topics.sh --create.']);
      mode = { type: 'producer', cluster: cont, topic: t };
      return { lines: [], kind: 'out', clear: false, mode: 'producer' };
    }

    function kafkaConsumer(cont, args) {
      var cl = w.kafka[cont];
      if (!cl) return errOut(['Error: ' + cont + ' is not a kafka broker']);
      var t = optVal(args, '--topic');
      if (!t) return errOut(['kafka-console-consumer: --topic is required']);
      var msgs = cl.topics[t];
      if (!msgs) return errOut(['Error: topic ' + t + ' does not exist.']);
      flag(w, 'consumed:' + t);
      return okOut(msgs);
    }

    // ---------- psql ----------
    function psqlCmd(cont, args) {
      var sql = optVal(args, '-c');
      if (!sql) return okOut(['psql: interactive mode is not available in this practice terminal.', 'Use -c "SQL" instead, for example: psql -U learner -d orders -c "SELECT * FROM orders;"']);
      // one -c can hold several statements separated by ;
      var stmts = sql.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
      var all = [], kind = 'out';
      stmts.forEach(function (s) {
        var r = runSql(cont, optVal(args, '-d') || 'orders', s);
        if (r.kind === 'err') kind = 'err';
        all = all.concat(r.lines);
      });
      return { lines: all, kind: kind };
    }

    // ---------- redis ----------
    function redisCmd(cont, args) {
      // redis-cli [-h host] CMD ...
      var host = optVal(args, '-h') || cont;
      var rest = args.filter(function (a, i) { return !(a === '-h' || args[i - 1] === '-h'); });
      var store = w.redis[host];
      if (!store) return errOut(['Could not connect to Redis at ' + host + ':6379: Connection refused']);
      var cmd = (rest[0] || '').toUpperCase();
      var key = rest[1];
      if (cmd === 'PING') { flag(w, 'ping'); return okOut(['PONG']); }
      if (cmd === 'SET') {
        if (store.replica_of) { flag(w, 'readonly_error'); return errOut(['(error) READONLY You can\'t write against a read only replica.']); }
        store.keys[key] = { v: rest[2] };
        mirrorRedis(host, key);
        return okOut(['OK']);
      }
      if (cmd === 'SETEX') {
        if (store.replica_of) { flag(w, 'readonly_error'); return errOut(['(error) READONLY You can\'t write against a read only replica.']); }
        store.keys[key] = { v: rest[3], exp: now(w) + parseInt(rest[2], 10) * 1000 };
        mirrorRedis(host, key);
        return okOut(['OK']);
      }
      if (cmd === 'GET') {
        var e = store.keys[key];
        flag(w, (store.replica_of ? 'getb:' : 'get:') + key);
        if (!e) return okOut(['(nil)']);
        if (e.exp && e.exp <= now(w)) { delete store.keys[key]; return okOut(['(nil)']); }
        return okOut(['"' + e.v + '"']);
      }
      if (cmd === 'TTL') {
        var e2 = store.keys[key];
        flag(w, 'ttl:' + key);
        if (!e2) return okOut(['(integer) -2']);
        if (!e2.exp) return okOut(['(integer) -1']);
        return okOut(['(integer) ' + Math.max(0, Math.ceil((e2.exp - now(w)) / 1000))]);
      }
      if (cmd === 'INCR') {
        if (store.replica_of) { flag(w, 'readonly_error'); return errOut(['(error) READONLY You can\'t write against a read only replica.']); }
        var cur = store.keys[key];
        var n = cur ? parseInt(cur.v, 10) : 0;
        n++;
        store.keys[key] = { v: String(n) };
        mirrorRedis(host, key);
        return okOut(['(integer) ' + n]);
      }
      if (cmd === 'DEL') {
        if (store.replica_of) { flag(w, 'readonly_error'); return errOut(['(error) READONLY You can\'t write against a read only replica.']); }
        var had = store.keys[key] ? 1 : 0;
        delete store.keys[key];
        mirrorRedis(host, key);
        return okOut(['(integer) ' + had]);
      }
      if (cmd === 'INFO' && (rest[1] || '').toLowerCase() === 'replication') {
        flag(w, 'info:replication');
        if (store.replica_of) {
          return okOut(['# Replication', 'role:slave', 'master_host:' + store.replica_of, 'master_port:6379', 'master_link_status:up']);
        }
        return okOut(['# Replication', 'role:master', 'connected_slaves:1', 'master_replid:abc123def456', 'master_repl_offset:0']);
      }
      if (!cmd) return okOut(['redis-cli: type a command, for example: redis-cli PING']);
      return errOut(['(error) ERR unknown command \'' + (rest[0] || '') + '\'']);
    }
    // ---------- aws s3 ----------
    function awsCmd(cont, args) {
      var ep = optVal(args, '--endpoint-url') || '';
      var store = null;
      if (ep.indexOf('moto-a') >= 0) store = 'moto-a';
      else if (ep.indexOf('moto-b') >= 0) store = 'moto-b';
      else return errOut(['Could not connect to the endpoint URL: "' + (ep || '(none)') + '"', 'Use --endpoint-url http://moto-a:5000 (or moto-b:5000).']);
      var s3i = args.indexOf('s3');
      if (s3i < 0) return errOut(['aws: the s3 subcommand is required']);
      var sub = args[s3i + 1];
      var st = w.s3[store];
      if (sub === 'ls') {
        var target = args[s3i + 2];
        if (!target) {
          flag(w, 's3ls');
          var bks = Object.keys(st.buckets);
          if (!bks.length) return okOut(['(empty — no buckets yet, no error)']);
          return okOut(bks.map(function (b) { return '2026-11-20 00:00:00  ' + b; }));
        }
        var m = /s3:\/\/([^\/]+)\/?/.exec(target);
        var bk = m ? m[1] : null;
        flag(w, 'ls:' + store + ':' + bk);
        if (!bk || !st.buckets[bk]) return errOut(['An error occurred (NoSuchBucket) when calling the ListObjects operation: The specified bucket does not exist']);
        var files = Object.keys(st.buckets[bk]);
        if (!files.length) return okOut(['(empty)']);
        var dateStr = new Date(now(w)).toISOString().slice(0, 10) + ' 00:00:00';
        return okOut(files.map(function (f) {
          var sz = String(st.buckets[bk][f].size);
          return dateStr + ' ' + padLeft(sz, 10) + ' ' + f;
        }));
      }
      if (sub === 'mb') {
        var m2 = /s3:\/\/([^\/]+)/.exec(args[s3i + 2] || '');
        if (!m2) return errOut(['aws s3 mb: usage: aws s3 mb s3://<bucket>']);
        var bk2 = m2[1];
        if (!st.buckets[bk2]) st.buckets[bk2] = {};
        flag(w, 'bucket:' + bk2);
        return okOut(['make_bucket: ' + bk2]);
      }
      if (sub === 'cp') {
        var src = args[s3i + 2], dst = args[s3i + 3];
        if (!src || !dst) return errOut(['aws s3 cp: usage: aws s3 cp <source> <destination>']);
        // download: s3://bucket/file -
        if (src.indexOf('s3://') === 0 && dst === '-') {
          var m3 = /s3:\/\/([^\/]+)\/(.+)/.exec(src);
          if (!m3 || !st.buckets[m3[1]] || !st.buckets[m3[1]][m3[2]]) return errOut(['An error occurred (NoSuchKey) when calling the GetObject operation: The specified key does not exist.']);
          flag(w, 'cat:' + m3[2]);
          return okOut(textLines(st.buckets[m3[1]][m3[2]].content));
        }
        // upload: /files/name.txt s3://bucket/
        if (src[0] === '/' && dst.indexOf('s3://') === 0) {
          var content = w.fileContents[src];
          if (content === undefined) return errOut(['The user-provided path ' + src + ' does not exist.']);
          var m4 = /s3:\/\/([^\/]+)\/?(.*)/.exec(dst);
          if (!m4) return errOut(['aws s3 cp: invalid S3 destination "' + dst + '"']);
          var bk4 = m4[1];
          if (!st.buckets[bk4]) return errOut(['An error occurred (NoSuchBucket) when calling the PutObject operation: The specified bucket does not exist']);
          var fname = src.split('/').pop();
          st.buckets[bk4][fname] = { size: content.length, content: content, mirrorAt: now(w) + (w.spec.mirror_delay_ms || 3000) };
          return okOut(['upload: ' + src + ' to s3://' + bk4 + '/' + fname]);
        }
        return errOut(['aws s3 cp: this practice terminal only copies /files/* up to s3://, and s3:// files down to -']);
      }
      return errOut(['aws: unknown s3 subcommand \'' + (sub || '') + '\'. Try ls, mb or cp.']);
    }

    // ---------- docker top-level helpers ----------
    function dockerHelpText() {
      return [
        'Usage:  docker [OPTIONS] COMMAND',
        '',
        'Commands:',
        '  compose     Define and run multi-container applications with Docker',
        '  exec        Execute a command in a running container',
        '  images      List images',
        '  logs        Fetch the logs of a container',
        '  ps          List containers',
        '  rm          Remove one or more containers',
        '  run         Run a command in a new container',
        '  start       Start one or more stopped containers',
        '  stop        Stop one or more running containers',
        '  version     Show the Docker version information',
        '',
        'Run \'docker COMMAND --help\' for more information on a command.'
      ];
    }

    function dockerImagesAllow() {
      var list = w.spec.images;
      if (list && list.length) return list.map(function (i) { return String(i).split(':')[0]; });
      return ['nginx', 'ubuntu', 'postgres', 'redis', 'alpine', 'busybox'];
    }

    function dockerImageDisplay() {
      var list = w.spec.images;
      if (list && list.length) return list.map(function (i) { return String(i).indexOf(':') >= 0 ? String(i) : String(i) + ':latest'; });
      return ['nginx:latest', 'ubuntu:latest', 'postgres:latest', 'redis:latest', 'alpine:latest', 'busybox:latest'];
    }

    function dockerRunCmd(args) {
      var name = null, image = null;
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (a === '--name' && args[i + 1]) { name = args[i + 1]; i++; }
        else if (a.indexOf('--name=') === 0) { name = a.slice(7); }
        else if (a[0] !== '-') { image = a; }
      }
      if (!image) return errOut(['"docker run" requires an image name']);
      var base = image.split(':')[0];
      var allow = dockerImagesAllow();
      if (allow.indexOf(base) === -1) {
        var shown = image.indexOf(':') >= 0 ? image : image + ':latest';
        return errOut(["Unable to find image '" + shown + "' locally",
          "docker: Error response from daemon: pull access denied for " + base + ", repository does not exist or may require 'docker login': denied: requested access to the resource is denied."]);
      }
      w.dockerRunSeq++;
      if (!name) name = base + '-' + w.dockerRunSeq;
      if (w.containers[name]) return errOut(['docker: Error response from daemon: Conflict. The container name "/' + name + '" is already in use.']);
      w.containers[name] = { project: '', status: 'up', role: null, image: image.indexOf(':') >= 0 ? image : image + ':latest' };
      flag(w, 'docker_run:' + name);
      var id = ('a1b2c3d4e5f6'.repeat(6)).slice(0, 64 - String(w.dockerRunSeq).length) + w.dockerRunSeq;
      return okOut([id]);
    }

    function dockerStopCmd(args) {
      var name = args.filter(function (a) { return a[0] !== '-'; })[0];
      if (!name) return errOut(['"docker stop" requires a container name']);
      var c = w.containers[name];
      if (!c) return errOut(['Error: No such container: ' + name]);
      c.status = 'stopped';
      flag(w, 'stopped:' + name);
      return okOut([name]);
    }

    function dockerStartCmd(args) {
      var name = args.filter(function (a) { return a[0] !== '-'; })[0];
      if (!name) return errOut(['"docker start" requires a container name']);
      var c = w.containers[name];
      if (!c) return errOut(['Error: No such container: ' + name]);
      c.status = 'up';
      flag(w, 'started:' + name);
      return okOut([name]);
    }

    function dockerRmCmd(args) {
      var force = args.some(function (a) { return a === '-f' || a === '--force'; });
      var names = args.filter(function (a) { return a[0] !== '-'; });
      if (!names.length) return errOut(['"docker rm" requires a container name']);
      var out = [];
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var c = w.containers[name];
        if (!c) return errOut(['Error: No such container: ' + name]);
        if (c.status === 'up' && !force) return errOut(['Error response from daemon: You cannot remove a running container ' + name + '. Stop the container before attempting removal or force remove']);
        delete w.containers[name];
        flag(w, 'docker_rm:' + name);
        out.push(name);
      }
      return okOut(out);
    }

    function dockerImagesCmd(args) {
      var lines = [padRight('REPOSITORY', 13) + padRight('TAG', 10) + padRight('IMAGE ID', 15) + padRight('CREATED', 15) + 'SIZE'];
      dockerImageDisplay().forEach(function (entry) {
        var parts = entry.split(':');
        var repo = parts[0], tag = parts[1] || 'latest';
        lines.push(padRight(repo, 13) + padRight(tag, 10) + padRight(fakeId(repo), 15) + padRight('2 weeks ago', 15) + (100 + repo.length * 7) + 'MB');
      });
      return okOut(lines);
    }

    // ---------- file utils (mkdir / rm / cp / mv / touch / df / free) ----------
    function parentDir(path) { var d = path.split('/').slice(0, -1).join('/'); return d === '' ? '/' : d; }
    function baseName(path) { return path.split('/').pop(); }

    function ensureDir(path) {
      if (w.fs[path]) return;
      var parts = path.split('/').filter(function (p) { return p.length > 0; });
      var cur = '';
      for (var i = 0; i < parts.length; i++) {
        cur += '/' + parts[i];
        if (!w.fs[cur]) {
          w.fs[cur] = [];
          var parent = parentDir(cur);
          if (w.fs[parent] && w.fs[parent].indexOf(parts[i]) === -1) w.fs[parent].push(parts[i]);
        }
      }
    }

    function addToDir(path) {
      var dir = parentDir(path), base = baseName(path);
      if (w.fs[dir] && w.fs[dir].indexOf(base) === -1) w.fs[dir].push(base);
    }

    function removeFromDir(path) {
      var dir = parentDir(path), base = baseName(path);
      if (w.fs[dir]) { var i = w.fs[dir].indexOf(base); if (i >= 0) w.fs[dir].splice(i, 1); }
    }

    function mkdirCmd(args) {
      var targets = args.filter(function (a) { return a[0] !== '-'; });
      var recursive = args.some(function (a) { return a === '-p' || a === '--parents'; });
      if (!targets.length) return errOut(['mkdir: missing operand', 'Try \'mkdir --help\' for more information.']);
      for (var i = 0; i < targets.length; i++) {
        var path = resolvePath(targets[i]);
        if (w.fs[path] || w.fileContents[path] !== undefined) return errOut(["mkdir: cannot create directory '" + targets[i] + "': File exists"]);
        if (!recursive && !w.fs[parentDir(path)]) return errOut(["mkdir: cannot create directory '" + targets[i] + "': No such file or directory"]);
        ensureDir(path);
        flag(w, 'mkdir:' + path);
      }
      return okOut([]);
    }

    function rmCmd(args) {
      var recursive = args.some(function (a) { return a[0] === '-' && a.indexOf('r') >= 0; });
      var force = args.some(function (a) { return a[0] === '-' && a.indexOf('f') >= 0; });
      var targets = args.filter(function (a) { return a[0] !== '-'; });
      if (!targets.length) return errOut(['rm: missing operand', 'Try \'rm --help\' for more information.']);
      for (var i = 0; i < targets.length; i++) {
        var path = resolvePath(targets[i]);
        var isDir = w.fs[path] !== undefined;
        var isFile = w.fileContents[path] !== undefined;
        if (!isDir && !isFile) {
          if (force) continue;
          return errOut(["rm: cannot remove '" + targets[i] + "': No such file or directory"]);
        }
        if (isDir && !recursive) return errOut(["rm: cannot remove '" + targets[i] + "': Is a directory"]);
        if (isDir) {
          var prefix = path === '/' ? '/' : path + '/';
          for (var p in w.fs) { if (p === path || p.indexOf(prefix) === 0) delete w.fs[p]; }
          for (var f in w.fileContents) { if (f === path || f.indexOf(prefix) === 0) { delete w.fileContents[f]; delete w.filesWritten[f]; } }
          removeFromDir(path);
        } else {
          delete w.fileContents[path];
          delete w.filesWritten[path];
          removeFromDir(path);
        }
        flag(w, 'rm:' + path);
      }
      return okOut([]);
    }

    function cpCmd(args) {
      var targets = args.filter(function (a) { return a[0] !== '-'; });
      if (targets.length < 2) return errOut(['cp: missing file operand', 'Try \'cp --help\' for more information.']);
      var src = resolvePath(targets[0]), dst = resolvePath(targets[1]);
      if (w.fileContents[src] === undefined) return errOut(["cp: cannot stat '" + targets[0] + "': No such file or directory"]);
      if (w.fs[dst] !== undefined) dst = dst + '/' + baseName(src);
      w.fileContents[dst] = w.fileContents[src];
      w.filesWritten[dst] = true;
      addToDir(dst);
      flag(w, 'cp:' + dst);
      return okOut([]);
    }

    function mvCmd(args) {
      var targets = args.filter(function (a) { return a[0] !== '-'; });
      if (targets.length < 2) return errOut(['mv: missing file operand', 'Try \'mv --help\' for more information.']);
      var src = resolvePath(targets[0]), dst = resolvePath(targets[1]);
      if (w.fileContents[src] === undefined && w.fs[src] === undefined) return errOut(["mv: cannot stat '" + targets[0] + "': No such file or directory"]);
      if (w.fs[dst] !== undefined) dst = dst + '/' + baseName(src);
      if (w.fileContents[src] !== undefined) {
        w.fileContents[dst] = w.fileContents[src];
        w.filesWritten[dst] = true;
        delete w.fileContents[src];
        delete w.filesWritten[src];
      } else {
        w.fs[dst] = w.fs[src];
        delete w.fs[src];
      }
      removeFromDir(src);
      addToDir(dst);
      flag(w, 'mv:' + dst);
      return okOut([]);
    }

    function touchCmd(args) {
      var targets = args.filter(function (a) { return a[0] !== '-'; });
      if (!targets.length) return errOut(['touch: missing file operand', 'Try \'touch --help\' for more information.']);
      for (var i = 0; i < targets.length; i++) {
        var path = resolvePath(targets[i]);
        if (!w.fs[parentDir(path)]) return errOut(["touch: cannot touch '" + targets[i] + "': No such file or directory"]);
        if (w.fs[path] === undefined && w.fileContents[path] === undefined) {
          w.fileContents[path] = '';
          w.filesWritten[path] = true;
          addToDir(path);
        }
        flag(w, 'touch:' + path);
      }
      return okOut([]);
    }

    function dfCmd(args) {
      return okOut([
        padRight('Filesystem', 14) + padRight('Size', 7) + padRight('Used', 7) + padRight('Avail', 7) + padRight('Use%', 5) + 'Mounted on',
        padRight('/dev/sda1', 14) + padRight('20G', 7) + padRight('8.5G', 7) + padRight('11G', 7) + padRight('44%', 5) + '/',
        padRight('tmpfs', 14) + padRight('3.9G', 7) + padRight('0', 7) + padRight('3.9G', 7) + padRight('0%', 5) + '/dev/shm'
      ]);
    }

    function freeCmd(args) {
      return okOut([
        '               total        used        free      shared  buff/cache   available',
        'Mem:           7.7Gi       1.2Gi       4.9Gi       210Mi       1.6Gi       6.2Gi',
        'Swap:          2.0Gi          0B       2.0Gi'
      ]);
    }

    // ---------- ps / top ----------
    function psCmd(args) {
      if (args[0] === 'aux' || args[0] === '-aux' || args[0] === '-ef' || args[0] === 'ef') {
        return okOut([
          'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
          'learner        1  0.0  0.1   1234   512 ?        Ss   09:00   0:00 /bin/bash',
          'learner       42  0.0  0.2   5678  1024 ?        S    09:01   0:00 nginx: worker process',
          'learner      101  0.1  0.3   9100  2048 ?        Sl   09:02   0:01 node server.js'
        ]);
      }
      return okOut([
        '  PID TTY          TIME CMD',
        '  101 ?        00:00:01 bash',
        '  202 ?        00:00:00 ps'
      ]);
    }

    function topCmd(args) {
      return okOut([
        'top - 09:00:00 up 1 day,  1 user,  load average: 0.10, 0.05, 0.01',
        'Tasks:   3 total,   1 running,   2 sleeping,   0 stopped,   0 zombie',
        '%Cpu(s):  1.0 us,  0.5 sy,  0.0 ni, 98.5 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st',
        'MiB Mem :   7888.0 total,   5012.0 free,   1234.0 used,   1642.0 buff/cache',
        'MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   6356.0 avail Mem',
        '',
        '  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
        '    1 learner   20   0    1234    512    256 S   0.0   0.1   0:00.00 bash',
        '  101 learner   20   0    9100   2048   1024 S   0.1   0.3   0:01.00 node'
      ]);
    }

    // ---------- script execution: bash x.sh / ./x.sh ----------
    function scriptCmd(args, invoked) {
      var file = null;
      for (var i = 0; i < args.length; i++) { if (args[i][0] !== '-') { file = args[i]; break; } }
      if (!file) return okOut(['bash: interactive mode is not available in this practice terminal.', 'Run a script instead, for example: bash kit-doctor.sh']);
      var clean = file.replace(/^\.\//, '');
      var path = resolvePath(clean);
      var specScripts = w.spec.scripts || {};
      var canned = specScripts[path] || specScripts[clean] || specScripts[file] || specScripts[baseName(clean)];
      var exists = w.fileContents[path] !== undefined || canned !== undefined;
      if (!exists) return errOut(['bash: ' + file + ': No such file or directory']);
      flag(w, 'script:' + baseName(clean));
      if (canned) return okOut(canned.slice());
      return okOut([]);
    }

    // ---------- git ----------
    function gitCmd(args) {
      var sub = args[0];
      if (!sub || sub === '--help' || sub === '-h') {
        return okOut([
          'usage: git <command> [<args>]',
          '',
          'Commands this practice terminal understands:',
          '  init, status, add, commit, log, branch, checkout, merge, clone, config, push, pull'
        ]);
      }
      if (sub === '--version' || sub === '-v') return okOut(['git version 2.43.0']);
      if (sub === 'clone') {
        var url = args[1];
        if (!url) return errOut(['fatal: You must specify a repository to clone.']);
        var repo = url.split('/').pop().replace(/\.git$/, '') || 'repo';
        w.git.initialized = true;
        w.git.branch = 'main';
        if (w.git.branches.indexOf('main') === -1) w.git.branches.push('main');
        if (!w.git.commits.length) w.git.commits.push({ hash: gitHash(0), msg: 'Initial commit' });
        ensureDir(resolvePath(repo));
        flag(w, 'git_clone');
        return okOut([
          "Cloning into '" + repo + "'...",
          'remote: Enumerating objects: 3, done.',
          'remote: Total 3 (delta 0), reused 0 (delta 0), pack-reused 0',
          'Receiving objects: 100% (3/3), done.'
        ]);
      }
      if (sub === 'config') {
        var rest = args.slice(1).filter(function (a) { return a !== '--global' && a !== '--local'; });
        if (rest.indexOf('--list') >= 0 || rest.indexOf('-l') >= 0) {
          return okOut(['user.name=' + (w.git.config['user.name'] || 'learner'), 'user.email=' + (w.git.config['user.email'] || 'learner@example.com')]);
        }
        if (rest.length >= 2) { w.git.config[rest[0]] = rest[1]; return okOut([]); }
        if (rest.length === 1) {
          var val = w.git.config[rest[0]];
          if (val === undefined) val = rest[0] === 'user.name' ? 'learner' : rest[0] === 'user.email' ? 'learner@example.com' : '';
          return okOut([val]);
        }
        return okOut(['usage: git config [<options>] [<name> [<value>]]']);
      }
      if (!w.git.initialized) {
        if (sub === 'init') {
          w.git.initialized = true;
          return okOut(['Initialized empty Git repository in /home/learner/.git/']);
        }
        return errOut(['fatal: not a git repository (or any of the parent directories): .git']);
      }
      if (sub === 'init') {
        return okOut(['Reinitialized existing Git repository in /home/learner/.git/']);
      }
      if (sub === 'status') {
        var lines = ['On branch ' + w.git.branch];
        if (w.git.conflict) {
          lines.push('You have unmerged paths.');
          lines.push('  (fix conflicts and run "git commit")');
          lines.push('Unmerged paths:');
          lines.push('        both modified:   ' + w.git.conflictFile);
          return okOut(lines);
        }
        if (w.git.staged.length) {
          lines.push('Changes to be committed:');
          lines.push('  (use "git restore --staged <file>..." to unstage)');
          w.git.staged.forEach(function (f) { lines.push('        new file:   ' + f); });
          return okOut(lines);
        }
        lines.push('nothing to commit, working tree clean');
        return okOut(lines);
      }
      if (sub === 'add') {
        var target = args[1];
        if (!target) return errOut(['Nothing specified, nothing added.', 'Maybe you wanted to say \'git add .\'?']);
        if (target === '.' || target === '-A' || target === '--all') {
          var names = (w.fs[cwd] || []).slice();
          for (var p in w.fileContents) {
            var dir = p.split('/').slice(0, -1).join('/') || '/';
            if (dir === cwd) { var b = p.split('/').pop(); if (names.indexOf(b) === -1) names.push(b); }
          }
          w.git.staged = names;
          if (w.git.conflictFile && names.indexOf(w.git.conflictFile) >= 0) w.git.resolved = true;
          return okOut([]);
        }
        var apath = resolvePath(target);
        if (w.fileContents[apath] === undefined && w.fs[apath] === undefined) {
          return errOut(["fatal: pathspec '" + target + "' did not match any files known to git"]);
        }
        if (w.git.staged.indexOf(target) === -1) w.git.staged.push(target);
        if (w.git.conflictFile === target) w.git.resolved = true;
        return okOut([]);
      }
      if (sub === 'commit') {
        var mi = args.indexOf('-m');
        var msg = mi >= 0 ? args[mi + 1] : null;
        if (!msg) return errOut(['Aborting commit due to empty commit message.']);
        if (w.git.conflict && !w.git.resolved) {
          return errOut(['error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>' as appropriate to mark resolution and make a commit."]);
        }
        if (!w.git.staged.length && !w.git.conflict) return okOut(['On branch ' + w.git.branch, 'nothing to commit, working tree clean']);
        var hash = gitHash(w.git.commits.length);
        var count = w.git.staged.length || 1;
        w.git.commits.unshift({ hash: hash, msg: msg });
        w.git.staged = [];
        w.git.conflict = false;
        w.git.conflictFile = null;
        w.git.resolved = false;
        flag(w, 'git_commit');
        return okOut(['[' + w.git.branch + ' ' + hash + '] ' + msg, ' ' + count + (count === 1 ? ' file changed, 1 insertion(+)' : ' files changed, ' + count + ' insertions(+)')]);
      }
      if (sub === 'log') {
        if (!w.git.commits.length) return errOut(["fatal: your current branch '" + w.git.branch + "' does not have any commits yet"]);
        return okOut(w.git.commits.map(function (c) { return c.hash + ' ' + c.msg; }));
      }
      if (sub === 'branch') {
        if (args[1] === '-d' && args[2]) {
          var del = args[2];
          if (del === w.git.branch) return errOut(["error: Cannot delete branch '" + del + "' checked out at '" + cwd + "'"]);
          var di = w.git.branches.indexOf(del);
          if (di === -1) return errOut(["error: branch '" + del + "' not found."]);
          w.git.branches.splice(di, 1);
          return okOut(['Deleted branch ' + del + '.']);
        }
        if (args[1]) {
          if (w.git.branches.indexOf(args[1]) === -1) w.git.branches.push(args[1]);
          return okOut([]);
        }
        return okOut(w.git.branches.map(function (b) { return (b === w.git.branch ? '* ' : '  ') + b; }));
      }
      if (sub === 'checkout') {
        if (args[1] === '-b' && args[2]) {
          if (w.git.branches.indexOf(args[2]) === -1) w.git.branches.push(args[2]);
          w.git.branch = args[2];
          flag(w, 'git_checkout');
          return okOut(["Switched to a new branch '" + args[2] + "'"]);
        }
        var br = args[1];
        if (!br) return errOut(['usage: git checkout <branch>']);
        if (w.git.branches.indexOf(br) === -1) return errOut(["error: pathspec '" + br + "' did not match any file(s) known to git"]);
        w.git.branch = br;
        flag(w, 'git_checkout');
        return okOut(["Switched to branch '" + br + "'"]);
      }
      if (sub === 'merge') {
        var mb = args[1];
        if (!mb) return errOut(['usage: git merge <branch>']);
        if (w.git.branches.indexOf(mb) === -1) return errOut(['merge: ' + mb + ' - not something we can merge']);
        if (w.gitConflict && w.gitConflict.branch === mb) {
          w.git.conflict = true;
          w.git.conflictFile = w.gitConflict.file;
          w.git.resolved = false;
          flag(w, 'git_conflict');
          return okOut([
            'Auto-merging ' + w.gitConflict.file,
            'CONFLICT (content): Merge conflict in ' + w.gitConflict.file,
            'Automatic merge failed; fix conflicts and then commit the result.'
          ]);
        }
        var mhash = gitHash(w.git.commits.length);
        w.git.commits.unshift({ hash: mhash, msg: "Merge branch '" + mb + "'" });
        flag(w, 'git_merge');
        return okOut([
          "Merge made by the 'ort' strategy.",
          ' ' + (w.gitConflict ? w.gitConflict.file : 'app.py') + ' | 1 +',
          ' 1 file changed, 1 insertion(+)'
        ]);
      }
      if (sub === 'push') {
        if (!w.git.commits.length) return okOut(['Everything up-to-date']);
        flag(w, 'git_push');
        if (w.git.commits.length === 1) {
          return okOut([
            'Enumerating objects: 3, done.',
            'To https://github.com/learner/app.git',
            ' * [new branch]      main -> main'
          ]);
        }
        return okOut([
          'Enumerating objects: 3, done.',
          'To https://github.com/learner/app.git',
          '   ' + w.git.commits[w.git.commits.length - 1].hash + '..' + w.git.commits[0].hash + '  ' + w.git.branch + ' -> ' + w.git.branch
        ]);
      }
      if (sub === 'pull') return okOut(['Already up to date.']);
      return errOut(["git: '" + sub + "' is not a git command. See 'git --help'."]);
    }

    // ---------- kubectl ----------
    function kubectlHelp() {
      return [
        'kubectl controls the Kubernetes cluster manager.',
        '',
        'Basic Commands:',
        '  get           Display one or many resources',
        '  apply         Apply a configuration to a resource',
        '  delete        Delete resources',
        '  describe      Show details of a specific resource',
        '  logs          Print the logs for a container in a pod',
        '  port-forward  Forward one or more local ports to a pod',
        '  rollout       Manage the rollout of a resource',
        '  version       Print the client and server version information'
      ];
    }

    function k8sPodTable() {
      // Self-healing: a deployment recreates its pod when it is gone.
      for (var d in w.k8s.deployments) {
        var found = false;
        for (var p in w.k8s.pods) { if (w.k8s.pods[p].deployment === d) { found = true; break; } }
        if (!found) {
          var dep = w.k8s.deployments[d];
          var name = d + '-' + w.k8sSuffix;
          w.k8s.pods[name] = { name: name, ready: '1/1', status: 'Running', restarts: 0, age: '0s', deployment: d, image: dep.image };
          flag(w, 'k8s_self_heal:' + name);
        }
      }
      var names = Object.keys(w.k8s.pods).sort();
      var lines = [trimEnd(padRight('NAME', 18) + padRight('READY', 8) + padRight('STATUS', 10) + padRight('RESTARTS', 11) + 'AGE')];
      names.forEach(function (n) {
        var pod = w.k8s.pods[n];
        lines.push(trimEnd(padRight(n, 18) + padRight(pod.ready, 8) + padRight(pod.status, 10) + padRight(String(pod.restarts), 11) + pod.age));
      });
      return lines;
    }

    function kubectlGet(args) {
      var kind = null;
      for (var i = 0; i < args.length; i++) { if (args[i][0] !== '-') { kind = args[i]; break; } }
      if (!kind) return errOut(['error: resource type is required. Usage: kubectl get <pods|nodes|deployments|services>']);
      if (kind === 'pods' || kind === 'pod' || kind === 'po') {
        var names = Object.keys(w.k8s.pods);
        if (!names.length && !Object.keys(w.k8s.deployments).length) return okOut(['No resources found in default namespace.']);
        return okOut(k8sPodTable());
      }
      if (kind === 'nodes' || kind === 'node' || kind === 'no') {
        return okOut([
          trimEnd(padRight('NAME', 20) + padRight('STATUS', 9) + padRight('ROLES', 16) + padRight('AGE', 6) + 'VERSION'),
          trimEnd(padRight('kind-control-plane', 20) + padRight('Ready', 9) + padRight('control-plane', 16) + padRight('10m', 6) + 'v1.30.0')
        ]);
      }
      if (kind === 'deployments' || kind === 'deployment' || kind === 'deploy') {
        var deps = Object.keys(w.k8s.deployments).sort();
        if (!deps.length) return okOut(['No resources found in default namespace.']);
        var lines = [trimEnd(padRight('NAME', 10) + padRight('READY', 8) + padRight('UP-TO-DATE', 13) + padRight('AVAILABLE', 12) + 'AGE')];
        deps.forEach(function (n) {
          var dep = w.k8s.deployments[n];
          lines.push(trimEnd(padRight(n, 10) + padRight(dep.ready, 8) + padRight(String(dep.upToDate), 13) + padRight(String(dep.available), 12) + dep.age));
        });
        return okOut(lines);
      }
      if (kind === 'services' || kind === 'service' || kind === 'svc') {
        var svcs = Object.keys(w.k8s.services).sort();
        var slines = [trimEnd(padRight('NAME', 12) + padRight('TYPE', 12) + padRight('CLUSTER-IP', 13) + padRight('EXTERNAL-IP', 13) + padRight('PORT(S)', 9) + 'AGE')];
        svcs.forEach(function (n) {
          var s = w.k8s.services[n];
          slines.push(trimEnd(padRight(n, 12) + padRight(s.type, 12) + padRight(s.clusterIP, 13) + padRight('<none>', 13) + padRight(s.ports, 9) + s.age));
        });
        return okOut(slines);
      }
      return errOut(['error: the server doesn\'t have a resource type "' + kind + '"']);
    }

    function kubectlApply(args) {
      var fi = args.indexOf('-f');
      var file = fi >= 0 ? args[fi + 1] : null;
      if (!file) return errOut(['error: -f <file> is required. Usage: kubectl apply -f <file>']);
      var path = resolvePath(file);
      var content = w.fileContents[path];
      if (content === undefined) return errOut(['error: the path "' + file + '" does not exist']);
      var nameM = /^\s*name:\s*([A-Za-z0-9][A-Za-z0-9.-]*)/m.exec(content);
      var imgM = /^\s*image:\s*(\S+)/m.exec(content);
      if (!nameM) return errOut(['error: no name found in ' + file]);
      var name = nameM[1], image = imgM ? imgM[1] : 'nginx:1.25';
      var existed = !!w.k8s.deployments[name];
      w.k8s.deployments[name] = { name: name, image: image, ready: '1/1', upToDate: 1, available: 1, age: '0s', replicas: 1 };
      var podName = name + '-' + w.k8sSuffix;
      w.k8s.pods[podName] = { name: podName, ready: '1/1', status: 'Running', restarts: 0, age: '0s', deployment: name, image: image };
      flag(w, 'k8s_apply:' + name);
      return okOut(['deployment.apps/' + name + (existed ? ' configured' : ' created')]);
    }

    function kubectlDelete(args) {
      var type = args[0], name = args[1];
      if (!type || !name) return errOut(['error: resource type and name are required. Usage: kubectl delete <type> <name>']);
      if (type === 'pod' || type === 'pods' || type === 'po') {
        if (!w.k8s.pods[name]) return errOut(['Error from server (NotFound): pods "' + name + '" not found']);
        delete w.k8s.pods[name];
        flag(w, 'k8s_delete_pod:' + name);
        return okOut(['pod "' + name + '" deleted']);
      }
      if (type === 'deployment' || type === 'deployments' || type === 'deploy') {
        if (!w.k8s.deployments[name]) return errOut(['Error from server (NotFound): deployments.apps "' + name + '" not found']);
        delete w.k8s.deployments[name];
        for (var p in w.k8s.pods) { if (w.k8s.pods[p].deployment === name) delete w.k8s.pods[p]; }
        return okOut(['deployment.apps "' + name + '" deleted']);
      }
      if (type === 'service' || type === 'services' || type === 'svc') {
        if (!w.k8s.services[name]) return errOut(['Error from server (NotFound): services "' + name + '" not found']);
        delete w.k8s.services[name];
        return okOut(['service "' + name + '" deleted']);
      }
      return errOut(['error: the server doesn\'t have a resource type "' + type + '"']);
    }

    function kubectlDescribe(args) {
      var type = args[0], name = args[1];
      if (!type || !name) return errOut(['error: resource type and name are required. Usage: kubectl describe <type> <name>']);
      if (type === 'pod' || type === 'pods' || type === 'po') {
        var pod = w.k8s.pods[name];
        if (!pod) return errOut(['Error from server (NotFound): pods "' + name + '" not found']);
        return okOut([
          'Name:             ' + pod.name,
          'Namespace:        default',
          'Status:           ' + pod.status,
          'IP:               10.244.0.5',
          'Containers:',
          '  ' + (pod.deployment || pod.name) + ':',
          '    Image:          ' + pod.image,
          '    Port:           80/TCP',
          '    State:          ' + pod.status
        ]);
      }
      if (type === 'deployment' || type === 'deployments' || type === 'deploy') {
        var dep = w.k8s.deployments[name];
        if (!dep) return errOut(['Error from server (NotFound): deployments.apps "' + name + '" not found']);
        return okOut([
          'Name:                   ' + dep.name,
          'Namespace:              default',
          'Replicas:               1 desired | 1 updated | 1 total | 1 available',
          'StrategyType:           RollingUpdate',
          'Pod Template:',
          '  Containers:',
          '   ' + dep.name + ':',
          '    Image:      ' + dep.image,
          '    Port:       80/TCP'
        ]);
      }
      return errOut(['error: the server doesn\'t have a resource type "' + type + '"']);
    }

    function kubectlLogs(args) {
      var name = null;
      for (var i = 0; i < args.length; i++) { if (args[i][0] !== '-') { name = args[i]; break; } }
      if (!name) return errOut(['error: pod name is required. Usage: kubectl logs <pod>']);
      if (name.indexOf('/') >= 0) name = name.split('/')[1];
      if (!w.k8s.pods[name]) return errOut(['Error from server (NotFound): pods "' + name + '" not found']);
      flag(w, 'k8s_logs:' + name);
      if (args.indexOf('--previous') >= 0) return okOut(['(no previous log — this container has not restarted)']);
      return okOut(['Starting web server on port 80', 'Listening on 0.0.0.0:80']);
    }

    function kubectlPortForward(args) {
      var target = args[0], mapping = args[1];
      if (!target || !mapping) return errOut(['error: port-forward needs a target and ports. Usage: kubectl port-forward service/<name> <local>:<remote>']);
      var parts = target.split('/');
      var ttype = parts[0], tname = parts[1];
      if ((ttype === 'service' || ttype === 'svc') && !w.k8s.services[tname]) return errOut(['Error from server (NotFound): services "' + tname + '" not found']);
      if (ttype === 'pod' && !w.k8s.pods[tname]) return errOut(['Error from server (NotFound): pods "' + tname + '" not found']);
      if (ttype !== 'service' && ttype !== 'svc' && ttype !== 'pod') return errOut(['error: unknown port-forward target "' + target + '"']);
      var mm = /^(\d+):(\d+)$/.exec(mapping);
      if (!mm) return errOut(['error: invalid port mapping "' + mapping + '". Use <local>:<remote>.']);
      w.k8s.forwards[tname] = { local: mm[1], remote: mm[2], type: ttype };
      flag(w, 'k8s_forward:' + tname);
      return okOut(['Forwarding from 127.0.0.1:' + mm[1] + ' -> ' + mm[2], 'Forwarding from [::1]:' + mm[1] + ' -> ' + mm[2]]);
    }

    function kubectlRolloutStatus(args) {
      var res = args[1], name = null;
      if (res && res.indexOf('/') >= 0) { name = res.split('/')[1]; }
      else if (res === 'deployment' || res === 'deploy') { name = args[2]; }
      else { name = res; }
      if (!name) return errOut(['error: rollout status needs a resource. Usage: kubectl rollout status deployment/<name>']);
      if (!w.k8s.deployments[name]) return errOut(['Error from server (NotFound): deployments.apps "' + name + '" not found']);
      flag(w, 'k8s_rollout:' + name);
      return okOut(['deployment "' + name + '" successfully rolled out']);
    }

    function kubectlCmd(args) {
      var sub = args[0];
      if (!sub || sub === '--help' || sub === '-h' || sub === 'help') return okOut(kubectlHelp());
      if (sub === 'version' || sub === '--version') {
        if (args.indexOf('--client') >= 0) return okOut(['Client Version: v1.30.0']);
        return okOut(['Client Version: v1.30.0', 'Server Version: v1.30.0']);
      }
      if (sub === 'get') return kubectlGet(args.slice(1));
      if (sub === 'apply') return kubectlApply(args.slice(1));
      if (sub === 'delete') return kubectlDelete(args.slice(1));
      if (sub === 'describe') return kubectlDescribe(args.slice(1));
      if (sub === 'logs') return kubectlLogs(args.slice(1));
      if (sub === 'port-forward') return kubectlPortForward(args.slice(1));
      if (sub === 'rollout') {
        if (args[1] === 'status') return kubectlRolloutStatus(args.slice(1));
        return errOut(['error: unknown rollout command "' + (args[1] || '') + '" for "kubectl rollout"']);
      }
      return errOut(['error: unknown command "' + sub + '" for "kubectl"', 'Run \'kubectl --help\' for usage.']);
    }

    // ---------- kind ----------
    function kindCmd(args) {
      var sub = args[0];
      if (!sub || sub === '--help' || sub === '-h') {
        return okOut([
          'kind creates and manages local Kubernetes clusters using Docker.',
          '',
          'Commands:',
          '  create cluster --name <name>      Create a cluster',
          '  get clusters                      List clusters',
          '  load docker-image <image> --name <cluster>   Load an image into a cluster',
          '  delete cluster --name <name>      Delete a cluster',
          '  version                           Print the kind version'
        ]);
      }
      if (sub === '--version' || sub === 'version') return okOut(['kind v0.23.0 go1.22.2 linux/amd64']);
      if (sub === 'create') {
        var name = optVal(args, '--name') || 'kind';
        if (w.kind.clusters.indexOf(name) >= 0) return errOut(['ERROR: a cluster with the name "' + name + '" already exists']);
        w.kind.clusters.push(name);
        flag(w, 'kind_create:' + name);
        return okOut([
          'Creating cluster "' + name + '" ...',
          ' ✓ Ensuring node image (kindest/node:v1.30.0)',
          ' ✓ Preparing nodes',
          ' ✓ Writing configuration',
          ' ✓ Starting control-plane',
          ' ✓ Installing CNI',
          ' ✓ Installing StorageClass',
          'Set kubectl context to "kind-' + name + '"',
          'You can now use your cluster with:',
          '',
          'kubectl cluster-info --all-namespaces'
        ]);
      }
      if (sub === 'get') {
        if (args[1] && args[1] !== 'clusters') return errOut(['ERROR: unknown command "get ' + args[1] + '" for "kind"']);
        if (!w.kind.clusters.length) return okOut(['No kind clusters found.']);
        return okOut(w.kind.clusters.slice());
      }
      if (sub === 'load') {
        var img = args[2];
        var cname = optVal(args, '--name') || 'kind';
        if (args[1] !== 'docker-image' || !img) return errOut(['ERROR: usage: kind load docker-image <image> --name <cluster>']);
        if (w.kind.clusters.indexOf(cname) === -1) return errOut(['ERROR: cluster "' + cname + '" does not exist. Create it first with: kind create cluster --name ' + cname]);
        if (w.kind.images.indexOf(img) === -1) w.kind.images.push(img);
        flag(w, 'kind_load:' + img);
        return okOut(['Image: "' + img + '" loaded into cluster "' + cname + '"']);
      }
      if (sub === 'delete') {
        var dname = optVal(args, '--name') || 'kind';
        if (w.kind.clusters.indexOf(dname) === -1) return errOut(['ERROR: cluster "' + dname + '" does not exist']);
        w.kind.clusters.splice(w.kind.clusters.indexOf(dname), 1);
        flag(w, 'kind_delete:' + dname);
        return okOut(['Deleting cluster "' + dname + '" ...', 'Deleted cluster "' + dname + '"']);
      }
      return errOut(['ERROR: unknown command "' + sub + '" for "kind"', 'Run \'kind --help\' for usage.']);
    }

    // ---------- terraform ----------
    function tfCmd(args) {
      var sub = args[0];
      if (!sub || sub === '--help' || sub === '-h') {
        return okOut([
          'Usage: terraform [global options] <subcommand> [args]',
          '',
          'Common commands:',
          '  init       Prepare your working directory for other commands',
          '  plan       Show changes required by the current configuration',
          '  apply      Create or update infrastructure',
          '  destroy    Destroy previously-created infrastructure'
        ]);
      }
      if (sub === '--version' || sub === 'version') return okOut(['Terraform v1.8.0']);
      if (sub === 'init') {
        w.tf.initialized = true;
        flag(w, 'tf_init');
        return okOut([
          'Initializing the backend...',
          '',
          'Initializing provider plugins...',
          '- Finding latest version of hashicorp/docker...',
          '- Installing hashicorp/docker v3.0.2...',
          '- Installed hashicorp/docker v3.0.2',
          '',
          'Terraform has been successfully initialized!'
        ]);
      }
      if (sub === 'plan') {
        if (!w.tf.initialized) return errOut(['Error: Terraform has not been initialized.', 'Run "terraform init" first.']);
        w.tf.planned = true;
        flag(w, 'tf_plan');
        return okOut([
          'Terraform will perform the following actions:',
          '',
          '  # docker_container.web will be created',
          '  + resource "docker_container" "web" {',
          '      + image = "nginx:1.25"',
          '      + name  = "web"',
          '    }',
          '',
          'Plan: 2 to add, 0 to change, 0 to destroy.'
        ]);
      }
      if (sub === 'apply') {
        if (!w.tf.initialized) return errOut(['Error: Terraform has not been initialized.', 'Run "terraform init" first.']);
        w.tf.applied = true;
        w.tf.planned = true;
        flag(w, 'tf_apply');
        return okOut([
          'docker_container.web: Creating...',
          'docker_container.web: Creation complete after 1s [id=abc123def456]',
          'docker_container.db: Creating...',
          'docker_container.db: Creation complete after 1s [id=def456abc123]',
          '',
          'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.'
        ]);
      }
      if (sub === 'destroy') {
        if (!w.tf.applied) return okOut(['No changes. No objects need to be destroyed.', '', 'Destroy complete! Resources: 0 destroyed.']);
        w.tf.applied = false;
        w.tf.planned = false;
        flag(w, 'tf_destroy');
        return okOut([
          'docker_container.web: Destroying... [id=abc123def456]',
          'docker_container.web: Destruction complete after 0s',
          'docker_container.db: Destroying... [id=def456abc123]',
          'docker_container.db: Destruction complete after 0s',
          '',
          'Destroy complete! Resources: 2 destroyed.'
        ]);
      }
      return errOut(['Terraform has no command named "' + sub + '".', 'Run "terraform --help" for usage.']);
    }

    // ---------- curl ----------
    function curlCmd(args) {
      var url = null;
      args.forEach(function (a) { if (a.indexOf('http') === 0) url = a; });
      if (!url) return errOut(['curl: no URL specified']);
      // World-spec canned responses: if the URL contains a map key, print it.
      var cmap = w.spec.curl_map || {};
      for (var ckey in cmap) {
        if (url.indexOf(ckey) >= 0) { flag(w, 'curl_map:' + ckey); return okOut(cmap[ckey].slice()); }
      }
      var m = /^http:\/\/localhost:(\d+)(\/.*)?$/.exec(url);
      if (!m) return errOut(['curl: (7) Failed to connect to ' + url.replace(/^https?:\/\//, '').split('/')[0] + ': Connection refused']);
      var port = m[1], path = m[2] || '/';
      if (port === '8080') {
        var lb = w.containers['lb'];
        if (!lb || lb.status !== 'up') return errOut(['curl: (7) Failed to connect to localhost port 8080: Connection refused']);
        var ups = w.spec.curl_hosts.filter(function (h) { return w.containers[h] && w.containers[h].status === 'up'; });
        if (!ups.length) return errOut(['curl: (7) Failed to connect to localhost port 8080: Connection refused', 'All backends are down.']);
        var host = ups[w.curlIdx % ups.length];
        w.curlIdx++;
        w.curlCount++;
        w.curlSeen[host] = true;
        if (w.curlAfterRestart) { flag(w, 'curl_after_restart'); }
        return okOut(['Hostname: ' + host]);
      }
      if (port === '8008' || port === '8009') {
        var p = w.pg.patroni;
        if (!p) return errOut(['curl: (7) Failed to connect to localhost port ' + port + ': Connection refused']);
        flag(w, 'curl:' + port);
        // leader first, like the lab's own output
        var names = Object.keys(p.members).sort(function (a, b) {
          if (a === p.leader) return -1;
          if (b === p.leader) return 1;
          return a < b ? -1 : 1;
        });
        var lines = ['{ "members": ['];
        names.forEach(function (name, i) {
          var last = i === names.length - 1;
          lines.push('  {"name": "' + name + '", "role": "' + (name === p.leader ? 'leader' : 'replica') + '"}' + (last ? ' ] }' : ','));
        });
        return okOut(lines);
      }
      return errOut(['curl: (7) Failed to connect to localhost port ' + port + ': Connection refused']);
    }

    // ---------- step completion ----------
    function evalCond(cond) {
      if (!cond) return false;
      if (cond.flag) return (w.flags[cond.flag] || 0) >= 1;
      if (cond.flag_count) return (w.flags[cond.flag_count.name] || 0) >= (cond.flag_count.min || 1);
      if (cond.containers_up) return cond.containers_up.every(function (n) { return w.containers[n] && w.containers[n].status === 'up'; });
      if (cond.container) return w.containers[cond.container.name] && w.containers[cond.container.name].status === cond.container.status;
      if (cond.topic) {
        var cl = w.kafka[cond.cluster || 'kafka-a'];
        return !!(cl && cl.topics[cond.topic]);
      }
      if (cond.messages) {
        var cl2 = w.kafka[cond.messages.cluster || 'kafka-a'];
        var t = cl2 && cl2.topics[cond.messages.topic];
        return !!(t && t.length >= (cond.messages.min || 1));
      }
      if (cond.key) {
        var st = w.redis[cond.key.store];
        return !!(st && st.keys[cond.key.key] !== undefined);
      }
      if (cond.counter) {
        var st2 = w.redis[cond.counter.store];
        var e = st2 && st2.keys[cond.counter.key];
        return !!(e && parseInt(e.v, 10) >= (cond.counter.min || 1));
      }
      if (cond.rows) {
        var tb = w.pg.tables[cond.rows.table];
        return !!(tb && tb.rows.length >= (cond.rows.min || 1));
      }
      if (cond.leader) return !!(w.pg.patroni && w.pg.patroni.leader === cond.leader);
      if (cond.promoted) {
        var c = w.containers[cond.promoted];
        return !!(c && c.role === 'primary');
      }
      if (cond.file) {
        var s3 = w.s3[cond.file.store];
        var bk = s3 && s3.buckets[cond.file.bucket];
        return !!(bk && bk[cond.file.name] !== undefined);
      }
      if (cond.curl) return !!w.curlSeen[cond.curl];
      if (cond.curl_count) return w.curlCount >= cond.curl_count;
      if (cond.down) return (w.flags['down'] || 0) >= 1;
      if (cond.file_written) return !!w.filesWritten[cond.file_written];
      if (cond.producer_sessions) return w.producerSessions >= cond.producer_sessions;
      if (cond.readonly_error) return (w.flags['readonly_error'] || 0) >= 1;
      if (cond.ttl_set) {
        var st3 = w.redis[cond.ttl_set.store];
        var e3 = st3 && st3.keys[cond.ttl_set.key];
        return !!(e3 && e3.exp !== undefined);
      }
      if (cond.git_initialized) return !!w.git.initialized;
      if (cond.git_commits) return w.git.commits.length >= (cond.git_commits.min || 1);
      if (cond.git_branch) return w.git.branch === cond.git_branch;
      if (cond.git_conflict !== undefined) return w.git.conflict === cond.git_conflict;
      if (cond.k8s_pod) {
        if (cond.k8s_pod.name) {
          var pd = w.k8s.pods[cond.k8s_pod.name];
          return !!pd && (!cond.k8s_pod.status || pd.status === cond.k8s_pod.status);
        }
        var plist = Object.keys(w.k8s.pods).map(function (n) { return w.k8s.pods[n]; });
        return plist.some(function (p) { return !cond.k8s_pod.status || p.status === cond.k8s_pod.status; });
      }
      if (cond.k8s_deployment) return !!w.k8s.deployments[cond.k8s_deployment.name || cond.k8s_deployment];
      if (cond.k8s_service) return !!w.k8s.services[cond.k8s_service.name || cond.k8s_service];
      if (cond.tf_initialized) return !!w.tf.initialized;
      if (cond.tf_planned) return !!w.tf.planned;
      if (cond.tf_applied) return !!w.tf.applied;
      if (cond.kind_cluster) return w.kind.clusters.indexOf(cond.kind_cluster.name || cond.kind_cluster) >= 0;
      if (cond.file_exists) return w.fileContents[cond.file_exists] !== undefined || w.fs[cond.file_exists] !== undefined;
      if (cond.dir_exists) return w.fs[cond.dir_exists] !== undefined;
      return false;
    }

    function checkDone(step, typedNorm) {
      if (!step) return false;
      var cmdMatch = typedNorm && normalizeCmd(step.cmd) === typedNorm;
      // interactive steps (producer / heredoc) only complete on world state,
      // not on the command that starts them
      if (step.defer) {
        return step.done_when ? evalCond(step.done_when) : false;
      }
      if (cmdMatch) return true;
      if (step.done_when) return evalCond(step.done_when);
      return false;
    }

    return {
      run: run,
      prompt: prompt,
      getMode: function () { return mode ? mode.type : 'normal'; },
      getHistory: function () { return history.slice(); },
      getCwd: function () { return cwd; },
      checkDone: checkDone,
      evalCond: evalCond,
      advanceTime: function (ms) { w.timeOffset += ms; },
      getWorld: function () { return w; },
      completions: function (prefix) {
        var words = ['docker', 'compose', 'up', 'down', 'ps', 'logs', 'exec', 'stop', 'start', 'run', 'curl', 'ls', 'cd', 'pwd', 'echo', 'cat', 'chmod', 'help', 'history', 'clear', 'whoami', 'exit', 'python', 'python3', 'ip', 'uname', 'ipconfig',
          'kafka-topics.sh', 'kafka-console-producer.sh', 'kafka-console-consumer.sh', 'psql', 'redis-cli', 'aws', 's3', 'mb', 'cp',
          'git', 'kubectl', 'kind', 'terraform', 'mkdir', 'rm', 'mv', 'touch', 'df', 'free', 'top', 'bash', 'sh', '--version', 'version', 'images',
          'get', 'apply', 'delete', 'describe', 'port-forward', 'rollout', 'create', 'cluster', 'clusters', 'pods', 'deployments', 'services', 'nodes',
          'init', 'plan', 'destroy', 'status', 'add', 'commit', 'log', 'branch', 'checkout', 'merge', 'clone', 'push', 'pull', 'config', 'load', 'docker-image'];
        for (var n in w.containers) words.push(n);
        for (var pn in w.k8s.pods) words.push(pn);
        for (var dn in w.k8s.deployments) words.push(dn);
        for (var sn in w.k8s.services) words.push(sn);
        w.kind.clusters.forEach(function (c) { words.push(c); });
        w.git.branches.forEach(function (b) { words.push(b); });
        for (var d in w.fs) { w.fs[d].forEach(function (f) { words.push(f); }); }
        // full file paths, so Tab completes a path the learner is typing
        for (var p in w.fileContents) words.push(p);
        for (var d2 in w.fs) {
          words.push(d2);
          w.fs[d2].forEach(function (f) { words.push(d2 + '/' + f); });
        }
        var seen = {};
        return words.filter(function (x) { return x.indexOf(prefix) === 0 && !seen[x] && (seen[x] = true); });
      }
    };
  }

  return { createShell: createShell, normalizeCmd: normalizeCmd };
});

// ---------- DOM binding (browser only) ----------
(function () {
  if (typeof window === 'undefined' || !window.SIM_DATA) return;
  var DATA = window.SIM_DATA;
  var shell = SIMSHELL.createShell(DATA);
  var steps = DATA.steps || [];
  var stepIdx = 0;
  var freePlay = false;
  var histPos = -1;
  var draft = '';

  var out = document.getElementById('term-out');
  var input = document.getElementById('term-input');
  var promptEl = document.getElementById('term-prompt');
  var stepCard = document.getElementById('step-card');
  var stepText = document.getElementById('step-text');
  var stepCount = document.getElementById('step-count');
  var freeBanner = document.getElementById('free-banner');
  var ctrlcBtn = document.getElementById('btn-ctrlc');
  var clearBtn = document.getElementById('btn-clear');
  var skipBtn = document.getElementById('btn-skip');
  var skipAllBtn = document.getElementById('btn-skip-all');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function printLine(text, cls) {
    var d = document.createElement('div');
    d.className = 'tline ' + (cls || 'out');
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }
  function printCmd(text) {
    var d = document.createElement('div');
    d.className = 'tline cmd';
    d.innerHTML = '<span class="tprompt">' + esc(shell.prompt()) + '</span> ' + esc(text);
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }
  function refreshPrompt() {
    promptEl.textContent = shell.prompt();
    var interactive = shell.getMode() !== 'normal';
    ctrlcBtn.disabled = !interactive;
    ctrlcBtn.classList.toggle('on', interactive);
  }
  function showStep() {
    if (freePlay || stepIdx >= steps.length) {
      stepCard.style.display = 'none';
      freeBanner.style.display = 'block';
      stepCount.textContent = 'Guided steps done — free play. Try the lab commands, or type help.';
      lightMap(null);
      return;
    }
    var s = steps[stepIdx];
    stepCard.style.display = 'block';
    freeBanner.style.display = 'none';
    stepCount.textContent = 'Step ' + (stepIdx + 1) + ' of ' + steps.length;
    stepText.innerHTML = '<span class="scmd">' + esc(s.cmd) + '</span>' +
      (s.note ? '<span class="snote">' + esc(s.note) + '</span>' : '');
    lightMap(s.hi || null);
  }
  function lightMap(id) {
    document.querySelectorAll('.flowbox').forEach(function (b) { b.classList.remove('lit'); });
    if (id) {
      var el = document.getElementById('fb-' + id);
      if (el) el.classList.add('lit');
    }
  }
  function checkStep(typedNorm) {
    if (freePlay || stepIdx >= steps.length) return;
    var s = steps[stepIdx];
    if (shell.checkDone(s, typedNorm)) {
      stepIdx++;
      if (stepIdx >= steps.length) {
        freePlay = true;
        printLine('— Guided steps done. Free play: try the lab commands, or type help to see them. —', 'hint');
      } else {
        printLine('— Step done. Next: —', 'hint');
      }
      showStep();
    }
  }

  function submit(line) {
    if (line === undefined) line = input.value;
    printCmd(line);
    input.value = '';
    histPos = -1;
    var typedNorm = SIMSHELL.normalizeCmd(line);
    // multi-line paste: run each line in turn (heredoc / producer included)
    var r;
    if (line.indexOf('\n') >= 0) {
      var parts = line.split('\n');
      parts.forEach(function (p, i) {
        var rr = shell.run(p);
        if (i === parts.length - 1) r = rr;
        else rr.lines.forEach(function (l) { printLine(l, rr.kind === 'err' ? 'err' : 'out'); });
      });
    } else {
      r = shell.run(line);
    }
    if (r.clear) out.innerHTML = '';
    // Guided step: show the lab's real output for its own command,
    // unless the step's output depends on what the learner typed.
    var s = (!freePlay && stepIdx < steps.length) ? steps[stepIdx] : null;
    var showDoc = s && !s.live && typedNorm && SIMSHELL.normalizeCmd(s.cmd) === typedNorm && shell.getMode() === 'normal';
    if (showDoc) {
      (s.out || []).forEach(function (l) { printLine(l, 'out'); });
    } else {
      r.lines.forEach(function (l) { printLine(l, r.kind === 'err' ? 'err' : 'out'); });
    }
    refreshPrompt();
    checkStep(typedNorm);
    // after a step completes, a typed command may also satisfy the NEXT step
    // (e.g. a state change); check once more without a new command
    if (!freePlay && stepIdx < steps.length) {
      var s2 = steps[stepIdx];
      if (s2.done_when && shell.checkDone(s2, '')) {
        stepIdx++;
        if (stepIdx >= steps.length) {
          freePlay = true;
          printLine('— Guided steps done. Free play: try the lab commands, or type help to see them. —', 'hint');
        }
        showStep();
      }
    }
    input.focus();
  }

  function ctrlC() {
    if (shell.getMode() !== 'normal') {
      var r = shell.run('^C');
      r.lines.forEach(function (l) { printLine(l, 'out'); });
      refreshPrompt();
      checkStep('');
    } else {
      printLine('^C', 'out');
    }
    input.focus();
  }

  function clearScreen() {
    out.innerHTML = '';
    input.focus();
  }

  function skipStep() {
    if (freePlay || stepIdx >= steps.length) return;
    printLine('— Skipped step ' + (stepIdx + 1) + '. —', 'hint');
    stepIdx++;
    if (stepIdx >= steps.length) {
      freePlay = true;
      printLine('— Guided steps done. Free play: try the lab commands, or type help to see them. —', 'hint');
    }
    showStep();
    input.focus();
  }

  function skipAll() {
    stepIdx = steps.length;
    freePlay = true;
    printLine('— Free play: try the lab commands, or type help to see them. —', 'hint');
    showStep();
    input.focus();
  }

  // wiring
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var h = shell.getHistory();
      if (!h.length) return;
      if (histPos === -1) { draft = input.value; histPos = h.length - 1; }
      else if (histPos > 0) { histPos--; }
      input.value = h[histPos];
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      var h2 = shell.getHistory();
      if (histPos === -1) return;
      if (histPos < h2.length - 1) { histPos++; input.value = h2[histPos]; }
      else { histPos = -1; input.value = draft; }
    }
    else if (e.key === 'Tab') {
      e.preventDefault();
      var val = input.value;
      var lastSpace = Math.max(val.lastIndexOf(' '), val.lastIndexOf('|'));
      var prefix = val.slice(lastSpace + 1);
      var matches = shell.completions(prefix);
      if (matches.length === 1) {
        input.value = val.slice(0, lastSpace + 1) + matches[0] + ' ';
      } else if (matches.length > 1) {
        printCmd(val);
        printLine(matches.join('  '), 'hint');
      }
    }
    else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      ctrlC();
    }
  });
  ctrlcBtn.addEventListener('click', ctrlC);
  clearBtn.addEventListener('click', clearScreen);
  skipBtn.addEventListener('click', skipStep);
  skipAllBtn.addEventListener('click', skipAll);
  document.getElementById('term').addEventListener('click', function () { input.focus(); });

  // welcome
  printLine(DATA.welcome || 'Practice terminal. Type a command, or follow the step above.', 'hint');
  printLine('Type help to see what this terminal understands.', 'hint');
  showStep();
  refreshPrompt();
  input.focus();
})();
