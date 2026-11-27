/* lx-server.js — the "real server" part: sudo, users, processes, services (systemd), logs,
   packages (apt), network (curl/ping/ss/ip), firewall (ufw), cron, disk and memory. */
(function (root) {
  'use strict';
  var LX = root.LX, M = LX.Machine.prototype, C = M.cmds, B = M.builtins, U = LX.util, man = LX.defMan, parseArgs = LX.parseArgs;
  var p2 = U.p2, padR = U.padR, padL = U.padL, human = U.human, basename = U.basename, dirname = U.dirname;

  // time = base + 13s per command + extra fast-forward (sleep)
  M.now = function () { return this.fixedNow != null ? this.fixedNow : this.t0 + this.ticks * 13000 + (this.extraMs || 0); };
  M.advance = function (sec) { this.extraMs = (this.extraMs || 0) + sec * 1000; };
  M.hhmmss = function (ms) { var d = new Date(ms == null ? this.now() : ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); };
  M.isoDate = function (ms) { var d = new Date(ms == null ? this.now() : ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
  var LOCKED = { apt: 1, 'apt-get': 1, systemctl: 1, service: 1, journalctl: 1, ufw: 1, iptables: 1, crontab: 1, useradd: 1, userdel: 1, usermod: 1, groupadd: 1, adduser: 1, ssh: 1, 'ssh-keygen': 1, dpkg: 1, passwd: 1, visudo: 1, lsof: 1 };

  // ======================================================================= setup hook
  M.hooks.push(function () {
    var self = this, host = this.hostname;
    this.extraMs = 0; this.procs = []; this.nextPid = 3100; this.listen = {}; this.journal = []; this.cron = {}; this.lastCronMin = Math.floor(this.now() / 60000);
    this.ufw = { active: false, rules: [], loglevel: 'low' }; this.pkgs = {}; this.svc = {}; this.cronLog = [];
    var base = Date.UTC(2026, 10, 24, 10, 12, 0), fail0 = Date.UTC(2026, 10, 27, 8, 1, 12);
    function proc(pid, ppid, user, cmd, o) { o = o || {}; self.procs.push({ pid: pid, ppid: ppid, user: user, cmd: cmd, cpu: o.cpu || 0, mem: o.mem || 0.1, vsz: o.vsz || 12000, rss: o.rss || 3500, tty: o.tty || '?', stat: o.stat || 'Ss', start: o.start || 'Nov24', time: o.time || '0:00', svc: o.svc || null, hog: !!o.hog }); }
    proc(1, 0, 'root', '/sbin/init', { mem: 0.3, vsz: 167940, rss: 13056, time: '0:03' });
    proc(2, 0, 'root', '[kthreadd]', { stat: 'S', vsz: 0, rss: 0 });
    proc(412, 1, 'root', 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', { mem: 0.2, vsz: 15440, rss: 8400, svc: 'ssh' });
    proc(455, 1, 'root', '/usr/sbin/cron -f -P', { vsz: 8636, rss: 2800, svc: 'cron' });
    proc(480, 1, 'syslog', '/usr/sbin/rsyslogd -n -iNONE', { mem: 0.2, vsz: 222404, rss: 5120, svc: 'rsyslog' });
    proc(520, 1, 'root', '/usr/lib/systemd/systemd-logind', { vsz: 16776, rss: 7424 });
    proc(1203, 1990, 'learner', '-bash', { tty: 'pts/0', stat: 'Ss', start: '10:40', vsz: 9976, rss: 5632 });
    proc(1990, 412, 'learner', 'sshd: learner@pts/0', { start: '10:40', stat: 'S' });
    proc(2201, 1203, 'learner', '/bin/bash /home/learner/projects/backup.sh', { cpu: 97.3, mem: 0.1, tty: 'pts/0', stat: 'R', start: '09:30', time: '70:12', vsz: 8200, rss: 3300, hog: true });
    this.sysWrite('/home/learner/.bash_history', '');

    // ---- services
    function svc(name, o) { o.unit = name; o.state = o.state || 'inactive'; o.since = null; o.pids = []; self.svc[name] = o; }
    svc('ssh', { desc: 'OpenBSD Secure Shell server', installed: true, enabled: true, port: 22, bin: '/usr/sbin/sshd', user: 'root', exec: '/usr/sbin/sshd -D', proc: 412 });
    svc('cron', { desc: 'Regular background program processing daemon', installed: true, enabled: true, bin: '/usr/sbin/cron', user: 'root', exec: '/usr/sbin/cron -f -P', proc: 455 });
    svc('rsyslog', { desc: 'System Logging Service', installed: true, enabled: true, bin: '/usr/sbin/rsyslogd', user: 'syslog', exec: '/usr/sbin/rsyslogd -n -iNONE', proc: 480 });
    svc('nginx', { desc: 'A high performance web server and a reverse proxy server', installed: false, enabled: false, port: 80, user: 'root', exec: '/usr/sbin/nginx -g "daemon on; master_process on;"', cmd: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', worker: 'nginx: worker process', http: 'nginx' });
    svc('apache2', { desc: 'The Apache HTTP Server', installed: false, enabled: false, port: 80, user: 'root', exec: '/usr/sbin/apachectl start', cmd: '/usr/sbin/apache2 -k start', worker: '/usr/sbin/apache2 -k start', http: 'apache2' });
    svc('postgresql', { desc: 'PostgreSQL RDBMS', installed: false, enabled: false, port: 5432, user: 'postgres', exec: '/usr/bin/pg_ctlcluster 16 main start', cmd: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main' });
    svc('mysql', { desc: 'MySQL Community Server', installed: false, enabled: false, port: 3306, user: 'mysql', exec: '/usr/sbin/mysqld', cmd: '/usr/sbin/mysqld' });
    svc('redis-server', { desc: 'Advanced key-value store', installed: false, enabled: false, port: 6379, user: 'redis', exec: '/usr/bin/redis-server 127.0.0.1:6379', cmd: '/usr/bin/redis-server 127.0.0.1:6379' });
    svc('fail2ban', { desc: 'Fail2Ban Service', installed: false, enabled: false, user: 'root', exec: '/usr/bin/fail2ban-server -xf start', cmd: '/usr/bin/python3 /usr/bin/fail2ban-server -xf start' });
    svc('myapp', { desc: 'My demo web app', installed: true, enabled: true, user: 'www-data', exec: '/usr/bin/node /opt/myapp/server.js', cmd: '/usr/bin/node /opt/myapp/server.js', portFromConfig: true, state: 'failed', failMsg: 'exit-code' });
    ['ssh', 'cron', 'rsyslog'].forEach(function (n) { var s = self.svc[n]; s.state = 'active'; s.since = base; s.pids = [s.proc]; });
    this.svc.myapp.since = fail0 + 1000;
    this.listen[22] = { svc: 'ssh', pid: 412, proto: 'tcp', addr: '0.0.0.0' };
    this.listen53 = { pid: 311, name: 'systemd-resolve', user: 'systemd-resolve' };
    this.svcAlias = { sshd: 'ssh', redis: 'redis-server', postgres: 'postgresql', mysqld: 'mysql', httpd: 'apache2', apache: 'apache2' };
    // journal (history before "now")
    function J(ms, unit, ident, pid, msg, prio) { self.journal.push({ t: ms, unit: unit, ident: ident, pid: pid, msg: msg, prio: prio === undefined ? 6 : prio }); }
    J(base, 'ssh', 'sshd', 412, 'Server listening on 0.0.0.0 port 22.');
    J(base + 1000, 'cron', 'systemd', 1, 'Started cron.service - Regular background program processing daemon.');
    J(fail0, 'myapp', 'systemd', 1, 'Starting myapp.service - My demo web app...');
    J(fail0 + 1000, 'myapp', 'node', 1844, 'Error: listen EADDRINUSE: address already in use :::80', 3);
    J(fail0 + 1100, 'myapp', 'systemd', 1, 'myapp.service: Main process exited, code=exited, status=1/FAILURE', 3);
    J(fail0 + 1200, 'myapp', 'systemd', 1, "myapp.service: Failed with result 'exit-code'.", 3);
    J(fail0 + 1300, 'myapp', 'systemd', 1, 'Failed to start myapp.service - My demo web app.', 3);
    // packages
    function pkg(name, o) { o.name = name; o.installed = !!o.installed; self.pkgs[name] = o; }
    ['curl:8.5.0-2ubuntu10:command line tool for transferring data with URL syntax', 'git:1:2.43.0-1ubuntu7:fast, scalable, distributed revision control system', 'wget:1.21.4-1ubuntu4:retrieves files from the web', 'nano:7.2-2build1:small, friendly text editor', 'ufw:0.36.2-6:program for managing a Netfilter firewall', 'openssh-server:1:9.6p1-3ubuntu13:secure shell (SSH) server', 'cron:3.0pl1-184ubuntu2:process scheduling daemon', 'rsyslog:8.2312.0-3ubuntu9:reliable system and kernel logging daemon', 'python3:3.12.3-0ubuntu2:interactive high-level object-oriented language', 'sudo:1.9.15p5-3ubuntu5:Provide limited super user privileges', 'tar:1.35+dfsg-3build1:GNU version of the tar archiving utility'].forEach(function (s) { var p = s.split(':'); pkg(p[0], { ver: (p[2].indexOf(':') >= 0 ? p[1] + ':' : '') + p[1], desc: p[p.length - 1], installed: true }); });
    pkg('nginx', { ver: '1.24.0-2ubuntu7', desc: 'small, powerful, scalable web/proxy server', size: '564 kB', disk: '1,596 kB', svc: 'nginx', setup: 'nginx' });
    pkg('apache2', { ver: '2.4.58-1ubuntu8', desc: 'Apache HTTP Server', size: '1,331 kB', disk: '7,942 kB', svc: 'apache2', setup: 'apache2' });
    pkg('postgresql', { ver: '16+257build1', desc: 'object-relational SQL database', size: '14.4 MB', disk: '48.2 MB', svc: 'postgresql', setup: 'postgresql', extra: ['postgresql-16', 'postgresql-client-16', 'postgresql-common'] });
    pkg('mysql-server', { ver: '8.0.39-0ubuntu0.24.04.2', desc: 'MySQL database server', size: '18.3 MB', disk: '150 MB', svc: 'mysql', setup: 'mysql' });
    pkg('redis-server', { ver: '5:7.0.15-1build2', desc: 'Persistent key-value database', size: '1,326 kB', disk: '4,780 kB', svc: 'redis-server', setup: 'redis' });
    pkg('fail2ban', { ver: '1.0.2-3ubuntu0.1', desc: 'ban hosts that cause multiple authentication errors', size: '404 kB', disk: '2,214 kB', svc: 'fail2ban' });
    pkg('htop', { ver: '3.3.0-4build1', desc: 'interactive processes viewer', size: '171 kB', disk: '430 kB' });
    pkg('tree', { ver: '2.1.1-2ubuntu3', desc: 'displays directory tree, in color', size: '47.1 kB', disk: '116 kB' });
    pkg('net-tools', { ver: '2.10-0.1ubuntu4', desc: 'NET-3 networking toolkit (netstat, ifconfig)', size: '204 kB', disk: '811 kB' });
    pkg('dnsutils', { ver: '1:9.18.28-0ubuntu0.24.04.1', desc: 'Transitional package for bind9-dnsutils (dig, nslookup)', size: '3,646 B', disk: '13.3 kB' });
    pkg('jq', { ver: '1.7.1-3build1', desc: 'lightweight and flexible command-line JSON processor', size: '65.2 kB', disk: '208 kB' });
    pkg('zip', { ver: '3.0-13ubuntu0.1', desc: 'Archiver for .zip files', size: '176 kB', disk: '626 kB' });
    pkg('unzip', { ver: '6.0-28ubuntu4', desc: 'De-archiver for .zip files', size: '174 kB', disk: '384 kB' });
    pkg('nodejs', { ver: '18.19.1+dfsg-6ubuntu5', desc: 'evented I/O for V8 javascript', size: '3,490 kB', disk: '15.1 MB' });
    this.cmdNeeds = { tree: 'tree', htop: 'htop', netstat: 'net-tools', ifconfig: 'net-tools', dig: 'dnsutils', nslookup: 'dnsutils', jq: 'jq', zip: 'zip', unzip: 'unzip', node: 'nodejs', 'redis-cli': 'redis-server', nginx: 'nginx' };
    // /usr/bin entries for every available command
    Object.keys(this.cmds).forEach(function (n) { if (!self.cmdNeeds[n]) { var fnode = self.put('/usr/bin/' + n, '\u007fELF', 493, 'root', 'root'); fnode.bin = true; fnode.bytes = 30000 + (n.length * 4113) % 90000; } });
    // /usr/sbin tools
    ['sshd', 'cron', 'ufw', 'useradd', 'userdel', 'usermod', 'groupadd', 'service'].forEach(function (n) { var fnode = self.put('/usr/sbin/' + n, '\u007fELF', 493, 'root', 'root'); fnode.bin = true; fnode.bytes = 52000; });
    // myapp starts failing for the right reason
    this.cron.learner = '';
  });

  M.pkgInstalled = function (n) { return !!(this.pkgs[n] && this.pkgs[n].installed); };
  M.jlog = function (unit, ident, pid, msg, prio) { this.journal.push({ t: this.now(), unit: unit, ident: ident, pid: pid, msg: msg, prio: prio === undefined ? 6 : prio }); if (this.journal.length > 500) this.journal.shift(); };
  M.syslogAdd = function (line) { this.sysAppendLog('/var/log/syslog', this.syslogTime() + ' ' + this.hostname + ' ' + line); };
  M.authAdd = function (line) { this.sysAppendLog('/var/log/auth.log', this.syslogTime() + ' ' + this.hostname + ' ' + line); };
  M.newPid = function () { return this.nextPid++; };
  M.spawn = function (user, cmd, o) { o = o || {}; var p = { pid: this.newPid(), ppid: o.ppid || 1, user: user, cmd: cmd, cpu: o.cpu || 0.1, mem: o.mem || 0.3, vsz: o.vsz || 80000, rss: o.rss || 12000, tty: '?', stat: 'Ss', start: this.hhmmss().slice(0, 5), time: '0:00', svc: o.svc || null }; this.procs.push(p); return p; };
  M.killProc = function (p, sig) {
    var self = this;
    this.procs = this.procs.filter(function (x) { return x.pid !== p.pid; });
    Object.keys(this.listen).forEach(function (k) { if (self.listen[k].pid === p.pid) delete self.listen[k]; });
    if (p.svc) {
      var s = this.svc[p.svc];
      if (s && s.pids.indexOf(p.pid) >= 0) {
        this.procs = this.procs.filter(function (x) { return !(x.svc === p.svc); });
        Object.keys(this.listen).forEach(function (k) { if (self.listen[k].svc === p.svc) delete self.listen[k]; });
        s.pids = []; s.state = sig === 9 ? 'failed' : 'inactive'; s.since = this.now(); s.failMsg = sig === 9 ? 'signal' : null;
        this.jlog(s.unit, 'systemd', 1, sig === 9 ? s.unit + ".service: Main process exited, code=killed, status=9/KILL" : 'Stopping ' + s.unit + '.service - ' + s.desc + '...', sig === 9 ? 4 : 6);
      }
    }
    this.flags['killed:' + p.pid] = 1; if (p.hog) this.flags.hogKilled = true;
  };

  // ======================================================================= sudo / su
  M.withUser = function (u, fn) { var save = this.user, sh = this.vars.USER; this.user = u; try { return fn(); } finally { this.user = save; } };
  C.sudo = function (args, ctx) {
    // only sudo's OWN options come before the command; everything after belongs to the command
    var self = this, me = this.user, o = { f: {}, v: {}, rest: [] }, i = 0;
    for (; i < args.length; i++) {
      var a = args[i];
      if (a === '--') { i++; break; }
      if (a.charAt(0) !== '-' || a === '-') break;
      if (a === '-u' || a === '--user') { o.v.u = args[++i]; continue; }
      if (/^--user=/.test(a)) { o.v.u = a.split('=')[1]; continue; }
      a.slice(1).split('').forEach(function (c) { o.f[c] = true; });
    }
    o.rest = args.slice(i);
    var allowed = me.uid === 0 || me.groups.indexOf('sudo') >= 0;
    if (!allowed) { ctx.err(me.name + ' is not in the sudoers file.'); this.authAdd('sudo: ' + me.name + ' : user NOT in sudoers ; TTY=pts/0 ; PWD=' + this.cwd + ' ; USER=root ; COMMAND=' + args.join(' ')); return 1; }
    var target = o.v.u ? this.users[o.v.u] : this.users.root;
    if (!target) { ctx.err('sudo: unknown user ' + o.v.u); return 1; }
    if (o.f.l) { ctx.out('Matching Defaults entries for ' + me.name + ' on ' + this.hostname + ':'); ctx.out('    env_reset, secure_path=/usr/local/sbin\\:/usr/local/bin\\:/usr/sbin\\:/usr/bin\\:/sbin\\:/bin'); ctx.out(''); ctx.out('User ' + me.name + ' may run the following commands on ' + this.hostname + ':'); ctx.out('    (ALL : ALL) ALL'); return 0; }
    if (o.f.k || o.f.v) return 0;
    var rest = o.rest;
    if (!rest.length) {
      if (o.f.i || o.f.s) { this.userStack.push(this.user); this.user = target; if (o.f.i) { this.cwd = target.home; } this.vars.HOME = target.home; this.vars.USER = target.name; this.authAdd('sudo: ' + me.name + ' : TTY=pts/0 ; PWD=' + this.cwd + ' ; USER=' + target.name + ' ; COMMAND=/bin/bash'); this.flags.sudoUsed = true; return 0; }
      ctx.err('usage: sudo [-u user] command'); return 1;
    }
    this.authAdd('sudo: ' + me.name + ' : TTY=pts/0 ; PWD=' + this.cwd + ' ; USER=' + target.name + ' ; COMMAND=/usr/bin/' + rest.join(' '));
    this.flags.sudoUsed = true;
    var code, sub = this;
    if (me.uid !== 0 || target.uid !== 0) { this.authAdd('sudo: pam_unix(sudo:session): session opened for user ' + target.name + '(uid=' + target.uid + ') by ' + me.name + '(uid=' + me.uid + ')'); }
    code = this.withUser(target, function () { return self.dispatch(rest, ctx); });
    return code;
  };
  man('sudo', 'sudo [-u user] COMMAND', 'Run ONE command with administrator (root) power. Use it only when needed — root can break anything.', ['sudo apt update', 'sudo systemctl restart nginx', 'sudo -i   # become root until you type exit'], { '-i': 'start a root shell', '-u': 'run as another user', '-l': 'list what you may do' });
  C.su = function (args, ctx) {
    var o = parseArgs(args), name = o.rest[0] || 'root', t = this.users[name];
    if (!t) { ctx.err('su: user ' + name + ' does not exist or the user entry does not contain all the required fields'); return 1; }
    if (this.user.uid !== 0) { ctx.err('su: Authentication failure'); ctx.err('(In this practice server there is no password prompt — use  sudo su -  or  sudo -i  instead.)'); return 1; }
    this.userStack.push(this.user); this.user = t; this.vars.HOME = t.home; this.vars.USER = t.name; if (o.f['']) { } this.cwd = args.indexOf('-') >= 0 || args.indexOf('-l') >= 0 ? t.home : this.cwd; return 0;
  };
  // after login switch, the prompt is built from this.user; /etc/sudoers edits are not enforced (kept simple)

  // ======================================================================= users & groups
  function needRoot(self, ctx, name) { if (self.user.uid !== 0) { ctx.err(name + ': Permission denied.'); ctx.err(name + ': cannot lock /etc/passwd; try again later.'); return false; } return true; }
  C.useradd = function (args, ctx) {
    if (!needRoot(this, ctx, 'useradd')) return 1;
    var o = parseArgs(args, 'sGdugc'), name = o.rest[0], self = this;
    if (!name) { ctx.err('Usage: useradd [options] LOGIN'); return 2; }
    if (this.users[name]) { ctx.err("useradd: user '" + name + "' already exists"); return 9; }
    var uid = 1001; Object.keys(this.users).forEach(function (k) { if (self.users[k].uid >= uid && self.users[k].uid < 60000) uid = self.users[k].uid + 1; });
    var home = o.v.d || '/home/' + name, groups = [name];
    this.groups[name] = uid;
    if (o.v.G) o.v.G.split(',').forEach(function (g) { if (self.groups[g] === undefined) { ctx.err("useradd: group '" + g + "' does not exist"); return; } groups.push(g); });
    this.users[name] = { name: name, uid: uid, gid: uid, home: home, shell: o.v.s || '/bin/sh', groups: groups, gecos: o.v.c || '' };
    if (o.f.m) { var d = this.mkdirp(home, 493, name, name); d.o = name; d.g = name; this.put(home + '/.bashrc', '# ~/.bashrc\n', 420, name, name); }
    this.syncAccounts(); this.authAdd('useradd[' + this.newPid() + ']: new user: name=' + name + ', UID=' + uid + ', GID=' + uid + ', home=' + home + ', shell=' + (o.v.s || '/bin/sh'));
    return 0;
  };
  C.adduser = function (args, ctx) {
    if (!needRoot(this, ctx, 'adduser')) return 1;
    var name = args.filter(function (a) { return a[0] !== '-'; })[0];
    if (!name) { ctx.err('adduser: Only one or two names allowed.'); return 1; }
    ctx.out("Adding user `" + name + "' ..."); ctx.out("Adding new group `" + name + "' (1001) ..."); ctx.out("Adding new user `" + name + "' (1001) with group `" + name + "' ...");
    ctx.out("Creating home directory `/home/" + name + "' ..."); ctx.out('(Practice server: password prompts are skipped.)');
    return C.useradd.call(this, ['-m', '-s', '/bin/bash', name], new LX.Ctx(this, '', false));
  };
  C.userdel = function (args, ctx) {
    if (!needRoot(this, ctx, 'userdel')) return 1;
    var o = parseArgs(args), name = o.rest[0];
    if (!this.users[name]) { ctx.err("userdel: user '" + name + "' does not exist"); return 6; }
    var u = this.users[name]; delete this.users[name]; delete this.groups[name];
    if (o.f.r) { var par = this.find(dirname(u.home), true).node; if (par) delete par.k[basename(u.home)]; }
    this.syncAccounts(); return 0;
  };
  C.usermod = function (args, ctx) {
    if (!needRoot(this, ctx, 'usermod')) return 1;
    var o = parseArgs(args, 'sGl'), name = o.rest[o.rest.length - 1], u = this.users[name], self = this;
    if (!u) { ctx.err("usermod: user '" + name + "' does not exist"); return 6; }
    if (o.v.s) u.shell = o.v.s;
    if (o.v.G) o.v.G.split(',').forEach(function (g) { if (self.groups[g] === undefined) { ctx.err("usermod: group '" + g + "' does not exist"); return; } if (o.f.a) { if (u.groups.indexOf(g) < 0) u.groups.push(g); } else u.groups = [u.groups[0]].concat(o.v.G.split(',')); });
    if (o.f.L) u.locked = true; if (o.f.U) u.locked = false;
    this.syncAccounts(); return 0;
  };
  man('usermod', 'usermod -aG GROUP USER', 'Change a user. Most used: add them to a group (for example sudo).', ['sudo usermod -aG sudo bob'], { '-aG': 'ADD the user to a group (keeps the others)', '-s': 'change login shell' });
  C.groupadd = function (args, ctx) { if (!needRoot(this, ctx, 'groupadd')) return 1; var n = args.filter(function (a) { return a[0] !== '-'; })[0]; if (!n) { ctx.err('Usage: groupadd [options] GROUP'); return 2; } if (this.groups[n] !== undefined) { ctx.err("groupadd: group '" + n + "' already exists"); return 9; } var gid = 1001; var self = this; Object.keys(this.groups).forEach(function (g) { if (self.groups[g] >= gid && self.groups[g] < 60000) gid = self.groups[g] + 1; }); this.groups[n] = gid; this.syncAccounts(); return 0; };
  C.groupdel = function (args, ctx) { if (!needRoot(this, ctx, 'groupdel')) return 1; if (this.groups[args[0]] === undefined) { ctx.err("groupdel: group '" + args[0] + "' does not exist"); return 6; } delete this.groups[args[0]]; this.syncAccounts(); return 0; };
  C.passwd = function (args, ctx) {
    var name = args.filter(function (a) { return a[0] !== '-'; })[0] || this.user.name;
    if (!this.users[name]) { ctx.err("passwd: user '" + name + "' does not exist"); return 1; }
    if (this.user.uid !== 0 && name !== this.user.name) { ctx.err('passwd: You may not view or modify password information for ' + name + '.'); return 1; }
    ctx.out('(Practice server: you cannot type a hidden password here, so the password is set automatically.)');
    ctx.out('passwd: password updated successfully'); this.flags['passwd:' + name] = 1; return 0;
  };
  C.chpasswd = function (args, ctx) { if (this.user.uid !== 0) { ctx.err('chpasswd: Permission denied.'); return 1; } this.flags.chpasswd = 1; return 0; };
  C.getent = function (args, ctx) {
    var self = this;
    if (args[0] === 'passwd') { var t = this.sysRead('/etc/passwd').split('\n').filter(Boolean); if (args[1]) t = t.filter(function (l) { return l.split(':')[0] === args[1]; }); if (!t.length) return 2; t.forEach(function (l) { ctx.out(l); }); return 0; }
    if (args[0] === 'group') { this.sysRead('/etc/group').split('\n').filter(function (l) { return l && (!args[1] || l.split(':')[0] === args[1]); }).forEach(function (l) { ctx.out(l); }); return 0; }
    return 2;
  };
  C.visudo = function (args, ctx) { if (this.user.uid !== 0) { ctx.err('visudo: /etc/sudoers: Permission denied'); return 1; } return C.nano.call(this, ['/etc/sudoers'], ctx, 'visudo'); };
  C.who = function (a, ctx) { ctx.out('learner  pts/0        2026-11-27 10:40 (10.0.2.2)'); return 0; };
  C.users = function (a, ctx) { ctx.out('learner'); return 0; };
  C.w = function (a, ctx) { ctx.out(' ' + this.hhmmss() + ' up 3 days,  0:30,  1 user,  load average: 1.02, 0.80, 0.65'); ctx.out('USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT'); ctx.out('learner  pts/0    10.0.2.2         10:40    0.00s  0.04s  0.00s w'); return 0; };
  C.last = function (a, ctx) { ctx.out('learner  pts/0        10.0.2.2         Fri Nov 27 10:40   still logged in'); ctx.out('learner  pts/0        10.0.2.2         Thu Nov 26 17:02 - 17:48  (00:46)'); ctx.out('reboot   system boot  6.8.0-45-generic Tue Nov 24 10:12   still running'); ctx.out(''); ctx.out('wtmp begins Tue Nov 24 10:12:01 2026'); return 0; };
  C.lastb = function (a, ctx) {
    if (this.user.uid !== 0) { ctx.err('lastb: cannot open /var/log/btmp: Permission denied'); return 1; }
    ctx.out('admin    ssh:notty    203.0.113.50     Fri Nov 27 08:55 - 08:55  (00:00)'); ctx.out('admin    ssh:notty    203.0.113.50     Fri Nov 27 08:55 - 08:55  (00:00)'); ctx.out('root     ssh:notty    203.0.113.50     Fri Nov 27 08:55 - 08:55  (00:00)'); ctx.out(''); ctx.out('btmp begins Fri Nov 27 08:55:41 2026'); return 0;
  };
  man('useradd', 'useradd -m -s /bin/bash -G sudo NAME', 'Create a new user account (needs sudo).', ['sudo useradd -m -s /bin/bash bob', 'sudo usermod -aG sudo bob'], { '-m': 'create the home folder', '-s': 'login shell', '-G': 'extra groups' });
  man('id', 'id [USER]', 'Show who a user is: numbers (uid, gid) and groups.', ['id', 'id www-data']);

  // ======================================================================= processes
  function procHuman(self) { return self.procs.slice(); }
  C.ps = function (args, ctx) {
    var self = this, joined = args.join(' '), aux = /aux|-ef|-e\b|-A|-aux/.test(joined) || args.indexOf('aux') >= 0 || args.indexOf('-ef') >= 0, ef = /-ef/.test(joined);
    var list = this.procs.slice();
    var sortArg = args.filter(function (a) { return a.indexOf('--sort') === 0; })[0];
    if (sortArg) { var key = sortArg.split('=')[1] || '', desc = key[0] === '-', k = key.replace(/^[-+]/, ''); list.sort(function (a, b) { var x = k === '%cpu' || k === 'pcpu' ? a.cpu - b.cpu : k === '%mem' || k === 'pmem' ? a.mem - b.mem : a.pid - b.pid; return desc ? -x : x; }); }
    else list.sort(function (a, b) { return a.pid - b.pid; });
    var uIdx = args.indexOf('-u'); if (uIdx >= 0) { var un = args[uIdx + 1]; list = list.filter(function (p) { return p.user === un; }); }
    if (!aux && uIdx < 0) {
      ctx.out('    PID TTY          TIME CMD');
      ctx.out(padL(1203, 7) + ' pts/0    00:00:00 bash');
      var me = this.spawnTmp('ps'); ctx.out(padL(me, 7) + ' pts/0    00:00:00 ps'); return 0;
    }
    if (ef) {
      ctx.out('UID          PID    PPID  C STIME TTY          TIME CMD');
      list.forEach(function (p) { ctx.out(padR(p.user.slice(0, 8), 8) + ' ' + padL(p.pid, 8) + ' ' + padL(p.ppid, 7) + ' ' + padL(p.cpu > 50 ? 97 : 0, 2) + ' ' + padR(p.start, 5) + ' ' + padR(p.tty, 8) + ' ' + padL('00:' + (p.time.length < 5 ? '0' : '') + p.time.replace(/^(\d):/, '0$1:'), 8) + ' ' + p.cmd); });
      return 0;
    }
    ctx.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
    list.forEach(function (p) { ctx.out(padR(p.user.length > 8 ? p.user.slice(0, 7) + '+' : p.user, 12) + padL(p.pid, 5) + ' ' + padL(p.cpu.toFixed(1), 4) + ' ' + padL(p.mem.toFixed(1), 4) + ' ' + padL(p.vsz, 6) + ' ' + padL(p.rss, 5) + ' ' + padR(p.tty, 8) + ' ' + padR(p.stat, 4) + ' ' + padR(p.start, 7) + padL(p.time, 5) + ' ' + p.cmd); });
    ctx.out(padR(this.user.name, 12) + padL(this.spawnTmp('ps'), 5) + '  0.0  0.1   8080  3600 pts/0    R+   ' + this.hhmmss().slice(0, 5) + '   0:00 ps ' + args.join(' '));
    return 0;
  };
  M.spawnTmp = function () { return this.newPid(); };
  man('ps', 'ps aux', 'Show running programs (processes). Each has a PID number you can kill.', ['ps aux', 'ps aux | grep nginx', 'ps aux --sort=-%cpu | head'], { 'aux': 'everything, with details', '--sort=-%cpu': 'busiest first' });
  function sysLoad(self) { var c = 0; self.procs.forEach(function (p) { c += p.cpu; }); return c; }
  C.top = C.htop = function (args, ctx) {
    var list = this.procs.slice().sort(function (a, b) { return b.cpu - a.cpu || a.pid - b.pid; }), cpu = Math.min(100, sysLoad(this) / 2);
    var tasks = list.length, running = list.filter(function (p) { return p.stat[0] === 'R'; }).length + 1;
    ctx.out('top - ' + this.hhmmss() + ' up 3 days,  0:30,  1 user,  load average: ' + (cpu / 50 + 0.2).toFixed(2) + ', ' + (cpu / 60 + 0.1).toFixed(2) + ', 0.65');
    ctx.out('Tasks: ' + padL(tasks, 3) + ' total, ' + padL(running, 3) + ' running, ' + padL(tasks - running, 3) + ' sleeping,   0 stopped,   0 zombie');
    ctx.out('%Cpu(s): ' + cpu.toFixed(1) + ' us,  1.2 sy,  0.0 ni, ' + (100 - cpu - 1.2).toFixed(1) + ' id,  0.1 wa,  0.0 hi,  0.0 si,  0.0 st');
    var m = this.memInfo(); ctx.out('MiB Mem : ' + padL(m.total.toFixed(1), 8) + ' total, ' + padL(m.free.toFixed(1), 8) + ' free, ' + padL(m.used.toFixed(1), 8) + ' used, ' + padL(m.cache.toFixed(1), 8) + ' buff/cache');
    ctx.out('MiB Swap: ' + padL('2048.0', 8) + ' total, ' + padL('2048.0', 8) + ' free, ' + padL('0.0', 8) + ' used. ' + padL(m.avail.toFixed(1), 8) + ' avail Mem');
    ctx.out(''); ctx.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
    list.slice(0, 12).forEach(function (p) { ctx.out(padL(p.pid, 7) + ' ' + padR(p.user.slice(0, 8), 9) + ' 20   0 ' + padL(p.vsz, 7) + ' ' + padL(p.rss, 6) + ' ' + padL(Math.round(p.rss / 3), 6) + ' ' + p.stat[0] + ' ' + padL(p.cpu.toFixed(1), 5) + ' ' + padL(p.mem.toFixed(1), 5) + ' ' + padL(p.time + '.00', 9) + ' ' + p.cmd.split(' ')[0].replace(/^.*\//, '').replace(/^-/, '')); });
    ctx.out(''); ctx.out('(This is a one-time snapshot. On a real server top refreshes live; press q to quit.)');
    return 0;
  };
  man('top', 'top', 'Live view of the busiest programs. Spot a process using too much CPU or memory.', ['top'], {});
  M.cmdNeeds.htop = 'htop';
  var SIGS = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, TERM: 15, STOP: 19, CONT: 18, USR1: 10, USR2: 12 };
  C.kill = function (args, ctx) {
    var self = this, sig = 15, code = 0, pids = [];
    if (args[0] === '-l') { ctx.out(' 1) SIGHUP   2) SIGINT   3) SIGQUIT  9) SIGKILL 15) SIGTERM 18) SIGCONT 19) SIGSTOP'); return 0; }
    args.forEach(function (a) { if (/^-\d+$/.test(a)) sig = -parseInt(a, 10); else if (/^-(SIG)?[A-Z0-9]+$/.test(a)) sig = SIGS[a.replace(/^-(SIG)?/, '')] || 15; else if (/^-s$/.test(a)) { } else pids.push(a); });
    if (!pids.length) { ctx.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]'); return 2; }
    pids.forEach(function (ps) {
      var pid = parseInt(ps, 10), p = self.procs.filter(function (x) { return x.pid === pid; })[0];
      if (!/^\d+$/.test(ps)) { ctx.err('bash: kill: ' + ps + ': arguments must be process or job IDs'); code = 1; return; }
      if (!p) { ctx.err('bash: kill: (' + pid + ') - No such process'); code = 1; return; }
      if (self.user.uid !== 0 && p.user !== self.user.name) { ctx.err('bash: kill: (' + pid + ') - Operation not permitted'); code = 1; return; }
      if (pid === 1 || pid === 2) { ctx.err('bash: kill: (' + pid + ') - Operation not permitted'); code = 1; return; }
      if (pid === 1203 || pid === 1990) { ctx.out('(Practice server: your own login session is protected.)'); return; }
      if (sig === 0 || sig === 18 || sig === 19) return;
      self.killProc(p, sig);
    });
    return code;
  };
  man('kill', 'kill [-9] PID', 'Stop a running program by its PID number. -9 forces it to stop immediately (last resort).', ['kill 2201', 'kill -9 2201'], { '-9': 'force kill (cannot be ignored)', '-15': 'ask politely to stop (default)' });
  function byName(self, name, exact) { return self.procs.filter(function (p) { var base = p.cmd.split(' ')[0].replace(/^.*\//, '').replace(/^-/, ''); return exact ? base === name : (p.cmd.indexOf(name) >= 0); }); }
  C.killall = function (args, ctx) { var self = this, sig = 15, names = []; args.forEach(function (a) { if (/^-/.test(a)) sig = SIGS[a.replace(/^-(SIG)?/, '')] || (+a.slice(1)) || 15; else names.push(a); }); var code = 0; names.forEach(function (n) { var l = byName(self, n, true).filter(function (p) { return p.pid > 2 && p.pid !== 1203 && p.pid !== 1990 && (self.user.uid === 0 || p.user === self.user.name); }); if (!l.length) { ctx.err(n + ': no process found'); code = 1; return; } l.forEach(function (p) { if (self.procs.indexOf(p) >= 0) self.killProc(p, sig); }); }); return code; };
  C.pkill = function (args, ctx) { var self = this, sig = 15, names = []; args.forEach(function (a) { if (/^-/.test(a)) sig = SIGS[a.replace(/^-(SIG)?/, '')] || (+a.slice(1)) || 15; else names.push(a); }); var found = 0; names.forEach(function (n) { byName(self, n, false).filter(function (p) { return p.pid > 2 && p.pid !== 1203 && p.pid !== 1990 && p.cmd !== '-bash' && (self.user.uid === 0 || p.user === self.user.name); }).forEach(function (p) { found++; self.killProc(p, sig); }); }); return found ? 0 : 1; };
  C.pgrep = function (args, ctx) { var o = parseArgs(args, 'u'), self = this, found = 0; o.rest.forEach(function (n) { byName(self, n, false).forEach(function (p) { found++; ctx.out(o.f.l ? p.pid + ' ' + p.cmd.split(' ')[0].replace(/^.*\//, '') : String(p.pid)); }); }); return found ? 0 : 1; };
  C.nice = C.renice = C.nohup = function (a, ctx) { if (a.length) return this.dispatch(a.filter(function (x) { return !/^-/.test(x) && !/^\d+$/.test(x) || false; }), ctx); return 0; };
  C.jobs = function () { return 0; };
  B.bg = B.fg = function (a, ctx) { ctx.err('bash: no job control in this practice shell'); return 1; };

  // ======================================================================= memory / disk / system info
  M.memInfo = function () {
    var used = 640, self = this; this.procs.forEach(function (p) { used += p.rss / 1024; });
    var total = 3918, cache = 1219.5; used = Math.min(used, total - 200);
    return { total: total, used: used, free: total - used - cache, cache: cache, avail: total - used };
  };
  C.free = function (args, ctx) {
    var o = parseArgs(args), m = this.memInfo(), div = o.f.h ? 1 : (o.f.m ? 1 : 1 / 1024 * 1024), unit = o.f.h || o.f.m ? 1 : 1024;
    function fmt(mb) { if (o.f.h) return mb >= 1024 ? (mb / 1024).toFixed(1) + 'Gi' : Math.round(mb) + 'Mi'; return String(Math.round(mb * (o.f.m ? 1 : 1024))); }
    ctx.out('               total        used        free      shared  buff/cache   available');
    ctx.out('Mem:' + padL(fmt(m.total), 15) + padL(fmt(m.used), 12) + padL(fmt(m.free), 12) + padL(fmt(24), 12) + padL(fmt(m.cache), 12) + padL(fmt(m.avail), 12));
    ctx.out('Swap:' + padL(fmt(2048), 14) + padL(fmt(0), 12) + padL(fmt(2048), 12));
    return 0;
  };
  man('free', 'free -h', 'How much memory (RAM) is used and free.', ['free -h'], { '-h': 'human-readable', '-m': 'in megabytes' });
  M.diskUsedBytes = function () { var t = 0, self = this; ['/home', '/tmp', '/var', '/opt', '/srv', '/root'].forEach(function (p) { self.walk(p, function (path, n) { if (n.t === 'f') t += n.bytes != null ? n.bytes : n.c.length; }); }); return t; };
  M.DISK_TOTAL = 20 * 1024 * 1024 * 1024; M.DISK_BASE = 5.6 * 1024 * 1024 * 1024;
  M.diskFull = function () { return this.DISK_BASE + this.diskUsedBytes() >= this.DISK_TOTAL; };
  C.df = function (args, ctx) {
    var o = parseArgs(args, 'tx'), used = this.DISK_BASE + this.diskUsedBytes(), total = this.DISK_TOTAL, avail = Math.max(0, total - used), pct = Math.min(100, Math.round(used / total * 100));
    function f(n) { return o.f.h ? human(Math.round(n)).replace(/(\d)([KMGT])$/, '$1$2') : String(Math.round(n / 1024)); }
    var hdr = o.f.h ? 'Filesystem      Size  Used Avail Use% Mounted on' : 'Filesystem     1K-blocks     Used Available Use% Mounted on';
    ctx.out(hdr);
    function row(fs, t, u, a, p, mnt) { ctx.out(o.f.h ? padR(fs, 15) + padL(f(t), 4) + padL(f(u), 6) + padL(f(a), 6) + padL(p + '%', 5) + ' ' + mnt : padR(fs, 14) + padL(f(t), 10) + padL(f(u), 9) + padL(f(a), 10) + padL(p + '%', 5) + ' ' + mnt); }
    row('tmpfs', 400 * 1048576, 1.2 * 1048576, 398 * 1048576, 1, '/run');
    row('/dev/sda1', total, used, avail, pct, '/');
    row('tmpfs', 2000 * 1048576, 0, 2000 * 1048576, 0, '/dev/shm');
    row('/dev/sda15', 105 * 1048576, 6.1 * 1048576, 99 * 1048576, 6, '/boot/efi');
    return 0;
  };
  man('df', 'df -h', 'How full the disks are. "Use%" near 100% means trouble.', ['df -h'], { '-h': 'human-readable sizes' });
  C.uptime = function (args, ctx) {
    var l = (sysLoad(this) / 100 + 0.2).toFixed(2);
    if (args.indexOf('-p') >= 0) { ctx.out('up 3 days, 0 hours, 30 minutes'); return 0; }
    ctx.out(' ' + this.hhmmss() + ' up 3 days,  0:30,  1 user,  load average: ' + l + ', ' + (l * 0.8).toFixed(2) + ', 0.65'); return 0;
  };
  C.vmstat = function (a, ctx) { var m = this.memInfo(); ctx.out('procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----'); ctx.out(' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st'); ctx.out(' 1  0      0 ' + padL(Math.round(m.free * 1024), 6) + '  98304 1245184    0    0    12    30  210  420 ' + padL(Math.round(Math.min(99, sysLoad(this) / 2)), 2) + '  1 ' + padL(Math.round(98 - Math.min(99, sysLoad(this) / 2)), 2) + '  0  0'); return 0; };
  C.lscpu = function (a, ctx) { ctx.out('Architecture:             x86_64'); ctx.out('CPU(s):                   2'); ctx.out('Model name:               Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz'); ctx.out('Thread(s) per core:       1'); return 0; };
  C.lsblk = function (a, ctx) { ctx.out('NAME    MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS'); ctx.out('sda       8:0    0   20G  0 disk'); ctx.out('├─sda1    8:1    0 19.9G  0 part /'); ctx.out('└─sda15  8:15   0  106M  0 part /boot/efi'); return 0; };
  C.mount = function (a, ctx) { ctx.out('/dev/sda1 on / type ext4 (rw,relatime)'); ctx.out('tmpfs on /run type tmpfs (rw,nosuid,nodev,size=400M)'); ctx.out('/dev/sda15 on /boot/efi type vfat (rw,relatime)'); return 0; };
  C.dmesg = function (a, ctx) { if (this.user.uid !== 0 && false) { ctx.err('dmesg: read kernel buffer failed: Operation not permitted'); return 1; } ctx.out('[    0.000000] Linux version 6.8.0-45-generic (buildd@lcy02-amd64-079)'); ctx.out('[    0.412345] pci 0000:00:01.0: [8086:7000] type 00 class 0x060100'); ctx.out('[    2.118765] EXT4-fs (sda1): mounted filesystem with ordered data mode'); ctx.out('[    4.730112] systemd[1]: Detected virtualization kvm.'); return 0; };
  C.fallocate = function (args, ctx) {
    var o = parseArgs(args, 'l'), f = o.rest[0], sz = /^(\d+)([KMG]?)$/.exec(o.v.l || ''), self = this;
    if (!sz || !f) { ctx.err('fallocate: invalid length'); return 1; }
    var bytes = +sz[1] * ({ '': 1, K: 1024, M: 1048576, G: 1073741824 })[sz[2]];
    if (this.DISK_BASE + this.diskUsedBytes() + bytes > this.DISK_TOTAL) { ctx.err('fallocate: fallocate failed: No space left on device'); return 1; }
    var e = this.writeText(f, '', false); if (e) { ctx.err('fallocate: cannot open ' + f + ': ' + this.fsMsg(e)); return 1; }
    this.stat(f).node.bytes = bytes; return 0;
  };
  C.dd = function (args, ctx) {
    var kv = {}; args.forEach(function (a) { var m = /^(\w+)=(.*)$/.exec(a); if (m) kv[m[1]] = m[2]; });
    var bs = /^(\d+)([KMG]?)$/.exec(kv.bs || '512'), cnt = +(kv.count || 1), bytes = (+bs[1]) * ({ '': 1, K: 1024, M: 1048576, G: 1073741824 })[bs[2]] * cnt;
    if (kv.of) { if (this.DISK_BASE + this.diskUsedBytes() + bytes > this.DISK_TOTAL) { ctx.err('dd: error writing \'' + kv.of + '\': No space left on device'); return 1; } var e = this.writeText(kv.of, '', false); if (e) { ctx.err('dd: failed to open \'' + kv.of + '\': ' + this.fsMsg(e)); return 1; } this.stat(kv.of).node.bytes = bytes; }
    ctx.err(cnt + '+0 records in'); ctx.err(cnt + '+0 records out'); ctx.err(bytes + ' bytes (' + human(bytes) + ') copied, 0.5 s'); return 0;
  };

  // ======================================================================= services
  M.svcName = function (n) { n = String(n || '').replace(/\.service$/, ''); return this.svcAlias[n] || n; };
  M.svcPort = function (s) {
    if (s.portFromConfig) { var cfg = this.sysRead('/etc/myapp/config.env') || '', m = /^PORT=(\d+)/m.exec(cfg); return m ? +m[1] : 3000; }
    return s.port || null;
  };
  M.svcStart = function (s) {
    var self = this, port = this.svcPort(s);
    if (!s.installed) return { ok: false, msg: 'not found' };
    if (s.state === 'active') return { ok: true };
    this.jlog(s.unit, 'systemd', 1, 'Starting ' + s.unit + '.service - ' + s.desc + '...');
    if (port && this.listen[port]) {
      var other = this.listen[port].svc || 'another program';
      var msg = s.http ? 'bind() to 0.0.0.0:' + port + ' failed (98: Address already in use)' : 'listen EADDRINUSE: address already in use :::' + port;
      s.state = 'failed'; s.since = this.now(); s.failMsg = 'exit-code';
      if (s.unit === 'nginx') { this.sysAppendLog('/var/log/nginx/error.log', this.nginxTime() + ' [emerg] 3150#3150: ' + msg); this.jlog('nginx', 'nginx', 3150, msg, 3); }
      else if (s.unit === 'myapp') { this.jlog('myapp', 'node', this.newPid(), 'Error: ' + msg, 3); this.sysAppendLog('/var/log/myapp.log', '[' + this.isoDate() + ' ' + this.hhmmss() + '] ERROR: ' + msg + '\n[' + this.isoDate() + ' ' + this.hhmmss() + '] HINT: port ' + port + ' is used by ' + other + '. Pick a free port in /etc/myapp/config.env.'); }
      else this.jlog(s.unit, s.unit, this.newPid(), msg, 3);
      this.jlog(s.unit, 'systemd', 1, s.unit + '.service: Main process exited, code=exited, status=1/FAILURE', 3);
      this.jlog(s.unit, 'systemd', 1, "Failed to start " + s.unit + '.service - ' + s.desc + '.', 3);
      return { ok: false, msg: 'failed' };
    }
    var main = this.spawn(s.user, s.cmd || s.exec, { svc: s.unit, mem: 0.4, rss: 9000 });
    s.pids = [main.pid]; if (s.worker) { var w = this.spawn('www-data', s.worker, { ppid: main.pid, svc: s.unit, mem: 0.3, rss: 6000 }); s.pids.push(w.pid); }
    s.state = 'active'; s.since = this.now(); s.failMsg = null;
    if (port) this.listen[port] = { svc: s.unit, pid: main.pid, proto: 'tcp', addr: (s.unit === 'postgresql' || s.unit === 'redis-server') ? '127.0.0.1' : (s.unit === 'myapp' ? '*' : '0.0.0.0') };
    this.jlog(s.unit, 'systemd', 1, 'Started ' + s.unit + '.service - ' + s.desc + '.');
    this.flags['started:' + s.unit] = (this.flags['started:' + s.unit] || 0) + 1;
    return { ok: true };
  };
  M.svcStop = function (s) {
    var self = this;
    if (s.state !== 'active') { s.state = s.state === 'failed' ? 'inactive' : s.state; return; }
    this.jlog(s.unit, 'systemd', 1, 'Stopping ' + s.unit + '.service - ' + s.desc + '...');
    this.procs = this.procs.filter(function (p) { return p.svc !== s.unit; });
    Object.keys(this.listen).forEach(function (k) { if (self.listen[k].svc === s.unit) delete self.listen[k]; });
    s.pids = []; s.state = 'inactive'; s.since = this.now(); s.failMsg = null;
    this.jlog(s.unit, 'systemd', 1, 'Stopped ' + s.unit + '.service - ' + s.desc + '.');
    this.flags['stopped:' + s.unit] = 1;
  };
  M.nginxTime = function () { var d = new Date(this.now()); return d.getUTCFullYear() + '/' + p2(d.getUTCMonth() + 1) + '/' + p2(d.getUTCDate()) + ' ' + this.hhmmss(); };
  M.svcLines = function (s, n) { return this.journal.filter(function (j) { return j.unit === s.unit; }).slice(-n); };
  M.jfmt = function (j) { return this.syslogTime(j.t) + ' ' + this.hostname + ' ' + j.ident + (j.pid ? '[' + j.pid + ']' : '') + ': ' + j.msg; };
  C.systemctl = function (args, ctx) {
    var self = this, o = parseArgs(args), sub = o.rest[0], names = o.rest.slice(1);
    if (!sub) { ctx.err('systemctl: missing command'); return 1; }
    var mut = { start: 1, stop: 1, restart: 1, reload: 1, enable: 1, disable: 1, 'daemon-reload': 1, mask: 1, 'try-restart': 1 };
    if (mut[sub] && this.user.uid !== 0) {
      if (sub === 'daemon-reload') ctx.err('Failed to reload daemon: Interactive authentication required.');
      else ctx.err('Failed to ' + sub + ' ' + (names[0] || '') + (/\./.test(names[0] || '') ? '' : '.service') + ': Interactive authentication required.'), ctx.err("See system logs and 'systemctl status " + (names[0] || '') + (/\./.test(names[0] || '') ? '' : '.service') + "' for details.");
      return 1;
    }
    if (sub === 'daemon-reload') return 0;
    if (sub === 'list-units' || sub === 'list-unit-files' || sub === undefined) {
      var failedOnly = o.long.failed || o.long.state === 'failed' || args.indexOf('--failed') >= 0;
      ctx.out('  UNIT                 LOAD   ACTIVE SUB     DESCRIPTION');
      var any = 0;
      Object.keys(this.svc).forEach(function (k) { var s = self.svc[k]; if (!s.installed) return; if (failedOnly && s.state !== 'failed') return; any++; ctx.out((s.state === 'failed' ? '● ' : '  ') + padR(k + '.service', 20) + ' loaded ' + padR(s.state, 6) + ' ' + padR(s.state === 'active' ? 'running' : (s.state === 'failed' ? 'failed' : 'dead'), 7) + ' ' + s.desc); });
      ctx.out(''); ctx.out(any + ' loaded units listed.'); return 0;
    }
    if (sub === 'reboot' || sub === 'poweroff' || sub === 'halt') { ctx.out('(Practice server: the machine stays on so you can keep learning.)'); return 0; }
    if (sub === 'is-system-running') { ctx.out('degraded'); return 1; }
    if (!names.length) { ctx.err('Too few arguments.'); return 1; }
    var code = 0;
    names.forEach(function (raw) {
      var n = self.svcName(raw), s = self.svc[n], unit = n + '.service';
      if (!s || !s.installed) { ctx.err('Unit ' + unit + ' could not be found.'); code = sub === 'status' ? 4 : 5; return; }
      if (sub === 'status') {
        var dot = s.state === 'active' ? self.color(ctx, 'g', '●') : (s.state === 'failed' ? self.color(ctx, 'r', '×') : '○');
        ctx.out(dot + ' ' + unit + ' - ' + s.desc);
        ctx.out('     Loaded: loaded (/usr/lib/systemd/system/' + unit + '; ' + (s.enabled ? 'enabled' : 'disabled') + '; preset: enabled)');
        var since = s.since ? 'since ' + self.fmtFull(s.since).replace(/^(\w+) (\w+) +(\d+) (\S+) UTC (\d+)$/, function (_, d, mo, da, t, y) { return d + ' ' + y + '-' + p2(U.MON.indexOf(mo) + 1) + '-' + p2(+da) + ' ' + t + ' UTC'; }) : '';
        var secs = s.since ? Math.max(1, Math.round((self.now() - s.since) / 1000)) : 0, ago = secs < 60 ? secs + 's' : secs < 3600 ? Math.floor(secs / 60) + 'min ' + (secs % 60) + 's' : secs < 86400 ? Math.floor(secs / 3600) + 'h ' + Math.floor(secs % 3600 / 60) + 'min' : Math.floor(secs / 86400) + ' days';
        if (s.state === 'active') ctx.out('     Active: ' + self.color(ctx, 'g', 'active (running)') + ' ' + since + '; ' + ago + ' ago');
        else if (s.state === 'failed') ctx.out('     Active: ' + self.color(ctx, 'r', 'failed') + ' (Result: ' + (s.failMsg || 'exit-code') + ') ' + since + '; ' + ago + ' ago');
        else ctx.out('     Active: inactive (dead)' + (since ? ' ' + since : ''));
        if (s.state === 'failed' && s.failMsg !== 'signal') ctx.out('    Process: 1844 ExecStart=' + s.exec + ' (code=exited, status=1/FAILURE)');
        if (s.state === 'active') { var mp = s.pids[0]; ctx.out('   Main PID: ' + mp + ' (' + (s.cmd || s.exec).split(' ')[0].replace(/^.*\//, '').replace(/:$/, '') + ')'); ctx.out('      Tasks: ' + s.pids.length + ' (limit: 4614)'); ctx.out('     Memory: ' + (3 + s.pids.length) + '.2M'); ctx.out('        CPU: 18ms'); ctx.out('     CGroup: /system.slice/' + unit); s.pids.forEach(function (pd, i) { var pr = self.procs.filter(function (x) { return x.pid === pd; })[0]; if (pr) ctx.out('             ' + (i === s.pids.length - 1 ? '└─' : '├─') + pd + ' ' + pr.cmd); }); }
        ctx.out('');
        self.svcLines(s, 5).forEach(function (j) { ctx.out(self.jfmt(j)); });
        code = s.state === 'active' ? 0 : 3; return;
      }
      if (sub === 'is-active') { ctx.out(s.state); if (s.state !== 'active') code = 3; return; }
      if (sub === 'is-enabled') { ctx.out(s.enabled ? 'enabled' : 'disabled'); if (!s.enabled) code = 1; return; }
      if (sub === 'is-failed') { ctx.out(s.state === 'failed' ? 'failed' : (s.state === 'active' ? 'active' : 'inactive')); if (s.state !== 'failed') code = 1; return; }
      if (sub === 'cat') { var u = self.sysRead('/etc/systemd/system/' + unit); ctx.out('# /etc/systemd/system/' + unit); ctx.out(u || '[Unit]\nDescription=' + s.desc); return; }
      if (sub === 'start') { var r = self.svcStart(s); if (!r.ok) { ctx.err('Job for ' + unit + ' failed because the control process exited with error code.'); ctx.err('See "systemctl status ' + unit + '" and "journalctl -xeu ' + unit + '" for details.'); code = 1; } return; }
      if (sub === 'stop') { self.svcStop(s); return; }
      if (sub === 'restart' || sub === 'try-restart' || sub === 'reload') { if (sub === 'reload') { if (s.state !== 'active') { ctx.err('Failed to reload ' + unit + ': Unit ' + unit + ' is not active.'); code = 1; } else self.jlog(s.unit, 'systemd', 1, 'Reloaded ' + s.unit + '.service - ' + s.desc + '.'); return; } self.svcStop(s); var r2 = self.svcStart(s); if (!r2.ok) { ctx.err('Job for ' + unit + ' failed because the control process exited with error code.'); ctx.err('See "systemctl status ' + unit + '" and "journalctl -xeu ' + unit + '" for details.'); code = 1; } return; }
      if (sub === 'enable') { s.enabled = true; ctx.err('Created symlink /etc/systemd/system/multi-user.target.wants/' + unit + ' → /usr/lib/systemd/system/' + unit + '.'); self.flags['enabled:' + n] = 1; return; }
      if (sub === 'disable') { s.enabled = false; ctx.err('Removed "/etc/systemd/system/multi-user.target.wants/' + unit + '".'); return; }
      ctx.err('Unknown command verb \'' + sub + '\'.'); code = 1;
    });
    return code;
  };
  man('systemctl', 'systemctl status|start|stop|restart|enable SERVICE', 'Control background services (web server, database, …) on a modern Linux server.', ['systemctl status nginx', 'sudo systemctl restart nginx', 'sudo systemctl enable nginx', 'systemctl list-units --type=service'],
    { status: 'is it running? shows recent logs', start: 'start it now', stop: 'stop it now', restart: 'stop then start (use after changing config)', enable: 'start automatically at boot', disable: 'do not start at boot', 'is-active': 'just print active / inactive' });
  C.service = function (args, ctx) {
    if (args.length < 2) { ctx.out('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]'); return 1; }
    if (args[1] === 'status') { return C.systemctl.call(this, ['status', args[0]], ctx); }
    return C.systemctl.call(this, [args[1], args[0]], ctx);
  };
  C.journalctl = function (args, ctx) {
    var self = this, o = parseArgs(args, 'unp'), u = o.v.u, n = null, i;
    for (i = 0; i < args.length; i++) { if (args[i] === '-n' && args[i + 1]) n = +args[i + 1]; else if (/^-n\d+$/.test(args[i])) n = +args[i].slice(2); else if (/^--lines=\d+$/.test(args[i])) n = +args[i].split('=')[1]; }
    var unit = u ? this.svcName(u) : (/-u/.test(args.join(' ')) ? null : null), prio = o.v.p ? ({ err: 3, error: 3, warning: 4, crit: 2, info: 6 })[o.v.p] || +o.v.p : null;
    for (i = 0; i < args.length; i++) { if (args[i] === '-xeu' || args[i] === '-eu' || args[i] === '-xu') unit = this.svcName(args[i + 1]); if (args[i] === '--unit' ) unit = this.svcName(args[i + 1]); if (/^--unit=/.test(args[i])) unit = this.svcName(args[i].split('=')[1]); }
    var list = this.journal.slice();
    if (unit) { if (!this.svc[unit]) { ctx.out('-- No entries --'); return 0; } list = list.filter(function (j) { return j.unit === unit; }); }
    if (prio !== null) list = list.filter(function (j) { return j.prio <= prio; });
    if (n) list = list.slice(-n);
    if (o.f.r) list.reverse();
    if (!list.length) { ctx.out('-- No entries --'); return 0; }
    ctx.out('-- Journal begins at ' + this.syslogTime(this.journal[0].t) + '. --');
    list.forEach(function (j) { ctx.out(self.jfmt(j)); });
    if (o.f.f) ctx.out('(-f would keep following new log lines on a real server)');
    return 0;
  };
  man('journalctl', 'journalctl [-u SERVICE] [-n N] [-p err]', 'Read the system log (everything systemd services print). First stop when something fails.', ['journalctl -u nginx -n 20', 'journalctl -p err', 'journalctl -xeu myapp'], { '-u': 'only this service', '-n': 'last N lines', '-p': 'only this priority and worse (err, warning…)', '-f': 'follow live', '-r': 'newest first' });

  // ======================================================================= apt / dpkg
  function aptRoot(self, ctx, tool) {
    if (self.user.uid !== 0) { ctx.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)'); ctx.err('E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?'); return false; }
    return true;
  }
  M.pkgSetup = function (name) {
    var self = this, p = this.pkgs[name];
    if (name === 'nginx') {
      this.put('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\nevents { worker_connections 768; }\nhttp {\n    include /etc/nginx/sites-enabled/*;\n    access_log /var/log/nginx/access.log;\n    error_log /var/log/nginx/error.log;\n}\n', 420, 'root', 'root');
      this.put('/etc/nginx/sites-available/default', 'server {\n    listen 80 default_server;\n    root /var/www/html;\n    index index.html index.nginx-debian.html;\n    server_name _;\n    location / { try_files $uri $uri/ =404; }\n}\n', 420, 'root', 'root');
      this.link('/etc/nginx/sites-enabled/default', '/etc/nginx/sites-available/default');
      this.put('/var/www/html/index.nginx-debian.html', '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and working.</p>\n</body>\n</html>\n', 420, 'root', 'root');
      this.put('/var/log/nginx/access.log', '', 416, 'www-data', 'adm'); this.put('/var/log/nginx/error.log', '', 416, 'www-data', 'adm');
      var nd = this.find('/var/www/html', true).node; nd.o = 'root';
    }
    if (name === 'apache2') { this.put('/etc/apache2/apache2.conf', '# Apache config\nServerRoot "/etc/apache2"\n', 420); this.put('/var/www/html/index.html', '<html><body><h1>Apache2 Default Page</h1><p>It works!</p></body></html>\n', 420, 'root', 'root'); this.put('/var/log/apache2/access.log', '', 416, 'root', 'adm'); this.put('/var/log/apache2/error.log', '', 416, 'root', 'adm'); }
    if (name === 'postgresql') { this.users.postgres = { name: 'postgres', uid: 116, gid: 122, home: '/var/lib/postgresql', shell: '/bin/bash', groups: ['postgres'], gecos: 'PostgreSQL administrator' }; this.groups.postgres = 122; this.put('/etc/postgresql/16/main/postgresql.conf', "port = 5432\nlisten_addresses = 'localhost'\nmax_connections = 100\n", 420, 'postgres', 'postgres'); this.syncAccounts(); }
    if (name === 'mysql-server') { this.users.mysql = { name: 'mysql', uid: 117, gid: 123, home: '/nonexistent', shell: '/bin/false', groups: ['mysql'], gecos: 'MySQL Server' }; this.groups.mysql = 123; this.put('/etc/mysql/my.cnf', '[mysqld]\nport = 3306\nbind-address = 127.0.0.1\n', 420); this.syncAccounts(); }
    if (name === 'redis-server') { this.users.redis = { name: 'redis', uid: 118, gid: 124, home: '/var/lib/redis', shell: '/usr/sbin/nologin', groups: ['redis'], gecos: '' }; this.groups.redis = 124; this.put('/etc/redis/redis.conf', 'bind 127.0.0.1 ::1\nport 6379\nmaxmemory 256mb\n', 420); this.syncAccounts(); }
    if (name === 'fail2ban') { this.put('/etc/fail2ban/jail.conf', '[DEFAULT]\nbantime = 10m\nmaxretry = 5\n\n[sshd]\nenabled = true\n', 420); }
    if (name === 'tree' || name === 'htop' || p.setup === undefined) { /* binaries are virtual */ }
  };
  M.pkgInstall = function (name, ctx) {
    var p = this.pkgs[name]; p.installed = true; this.pkgSetup(name);
    var s = p.svc ? this.svc[p.svc] : null;
    if (s) { s.installed = true; s.enabled = true; var r = this.svcStart(s); if (!r.ok) { ctx.out('Job for ' + s.unit + '.service failed because the control process exited with error code.'); ctx.out('See "systemctl status ' + s.unit + '.service" and "journalctl -xeu ' + s.unit + '.service" for details.'); ctx.out('invoke-rc.d: initscript ' + s.unit + ', action "start" failed.'); } }
    this.sysAppendLog('/var/log/dpkg.log', this.isoDate() + ' ' + this.hhmmss() + ' status installed ' + name + ':amd64 ' + p.ver);
    this.flags['pkg:' + name] = 1;
    // virtual binaries
    var self = this; Object.keys(this.cmdNeeds).forEach(function (c) { if (self.cmdNeeds[c] === name && self.cmds[c]) { var fnode = self.put('/usr/bin/' + c, '\u007fELF', 493, 'root', 'root'); fnode.bin = true; fnode.bytes = 61000; } });
  };
  C.apt = C['apt-get'] = function (args, ctx, tool) {
    var self = this, o = parseArgs(args), sub = o.rest[0], names = o.rest.slice(1), yes = o.f.y;
    if (!sub) { ctx.out('apt 2.7.14 (amd64)'); ctx.out('Usage: apt [options] command'); return 1; }
    if (sub === 'update') { if (!aptRoot(this, ctx, tool)) return 100; ['Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease', 'Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]', 'Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]', 'Fetched 252 kB in 1s (310 kB/s)', 'Reading package lists... Done', 'Building dependency tree... Done', 'Reading state information... Done', '4 packages can be upgraded. Run \'apt list --upgradable\' to see them.'].forEach(function (l) { ctx.out(l); }); this.flags.aptUpdate = 1; return 0; }
    if (sub === 'upgrade' || sub === 'full-upgrade' || sub === 'dist-upgrade') { if (!aptRoot(this, ctx, tool)) return 100; ['Reading package lists... Done', 'Building dependency tree... Done', 'Calculating upgrade... Done', 'The following packages will be upgraded:', '  libc6 libssl3 openssl tzdata', '4 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.', 'Need to get 9,642 kB of archives.', 'Fetched 9,642 kB in 3s (3,214 kB/s)', 'Setting up libc6:amd64 (2.39-0ubuntu8.3) ...', 'Setting up openssl (3.0.13-0ubuntu3.4) ...', 'Processing triggers for man-db (2.12.0-4build2) ...'].forEach(function (l) { ctx.out(l); }); this.flags.aptUpgrade = 1; return 0; }
    if (sub === 'install' || sub === 'reinstall') {
      if (!aptRoot(this, ctx, tool)) return 100;
      if (!names.length) { ctx.out('E: No packages specified'); return 100; }
      var code = 0, todo = [];
      for (var i = 0; i < names.length; i++) {
        var n = names[i], p = this.pkgs[n];
        if (n === 'docker' || n === 'docker.io') { ctx.err('E: Package \'' + n + '\' is not available in this practice server (see the Docker labs).'); return 100; }
        if (!p) { ctx.err('E: Unable to locate package ' + n); return 100; }
        if (p.installed && sub === 'install') { ctx.out('Reading package lists... Done'); ctx.out('Building dependency tree... Done'); ctx.out('Reading state information... Done'); ctx.out(n + ' is already the newest version (' + p.ver + ').'); ctx.out('0 upgraded, 0 newly installed, 0 to remove and 4 not upgraded.'); continue; }
        todo.push(n);
      }
      if (!todo.length) return 0;
      ctx.out('Reading package lists... Done'); ctx.out('Building dependency tree... Done'); ctx.out('Reading state information... Done');
      var all = []; todo.forEach(function (t) { all.push(t); (self.pkgs[t].extra || []).forEach(function (e) { all.push(e); }); });
      ctx.out('The following NEW packages will be installed:'); ctx.out('  ' + all.join(' '));
      ctx.out('0 upgraded, ' + all.length + ' newly installed, 0 to remove and 4 not upgraded.');
      ctx.out('Need to get ' + this.pkgs[todo[0]].size + ' of archives.'); ctx.out('After this operation, ' + this.pkgs[todo[0]].disk + ' of additional disk space will be used.');
      if (!yes) ctx.out('Do you want to continue? [Y/n] Y   (practice server: answered for you — add -y to skip this question)');
      todo.forEach(function (t, idx) { var p = self.pkgs[t]; ctx.out('Get:' + (idx + 1) + ' http://archive.ubuntu.com/ubuntu noble-updates/main amd64 ' + t + ' amd64 ' + p.ver + ' [' + p.size + ']'); });
      ctx.out('Fetched ' + this.pkgs[todo[0]].size + ' in 1s (' + '612 kB/s)');
      todo.forEach(function (t) { var p = self.pkgs[t]; ctx.out('Selecting previously unselected package ' + t + '.'); ctx.out('Preparing to unpack .../' + t + '_' + p.ver + '_amd64.deb ...'); ctx.out('Unpacking ' + t + ' (' + p.ver + ') ...'); });
      todo.forEach(function (t) { var p = self.pkgs[t]; ctx.out('Setting up ' + t + ' (' + p.ver + ') ...'); self.pkgInstall(t, ctx); });
      ctx.out('Processing triggers for man-db (2.12.0-4build2) ...');
      return 0;
    }
    if (sub === 'remove' || sub === 'purge' || sub === 'autoremove') {
      if (!aptRoot(this, ctx, tool)) return 100;
      names.forEach(function (n) { var p = self.pkgs[n]; if (!p || !p.installed) { ctx.out('Package \'' + n + '\' is not installed, so not removed'); return; } self.svcStop(self.svc[p.svc] || { state: 'x' }); p.installed = false; if (p.svc && self.svc[p.svc]) { self.svc[p.svc].installed = false; self.svc[p.svc].state = 'inactive'; } ctx.out('Removing ' + n + ' (' + p.ver + ') ...'); self.flags['removed:' + n] = 1; });
      ctx.out('Reading package lists... Done'); return 0;
    }
    if (sub === 'search') { var q = names[0] || ''; Object.keys(this.pkgs).forEach(function (k) { if (k.indexOf(q) >= 0 || self.pkgs[k].desc.indexOf(q) >= 0) { ctx.out(self.color(ctx, 'g', k) + '/noble ' + self.pkgs[k].ver + ' amd64' + (self.pkgs[k].installed ? ' [installed]' : '')); ctx.out('  ' + self.pkgs[k].desc); ctx.out(''); } }); return 0; }
    if (sub === 'list') { var keys = Object.keys(this.pkgs).filter(function (k) { return !o.long.installed || self.pkgs[k].installed; }).sort(); ctx.out('Listing... Done'); keys.forEach(function (k) { ctx.out(k + '/noble,now ' + self.pkgs[k].ver + ' amd64 ' + (self.pkgs[k].installed ? '[installed]' : '')); }); return 0; }
    if (sub === 'show' || sub === 'policy') { var pk = this.pkgs[names[0]]; if (!pk) { ctx.err('E: No packages found'); return 100; } ctx.out('Package: ' + names[0]); ctx.out('Version: ' + pk.ver); ctx.out('Description: ' + pk.desc); ctx.out('Installed: ' + (pk.installed ? 'yes' : 'no')); return 0; }
    ctx.err("E: Invalid operation " + sub); return 100;
  };
  man('apt', 'sudo apt update | install PACKAGE | remove PACKAGE', 'Install, update and remove software on Ubuntu/Debian servers. Always run "sudo apt update" first.', ['sudo apt update', 'sudo apt install -y nginx', 'apt search redis', 'sudo apt remove nginx'], { update: 'refresh the list of available software', install: 'install a package', remove: 'uninstall a package', upgrade: 'update installed software', search: 'find packages', '-y': 'answer yes to questions' });
  C.dpkg = function (args, ctx) {
    var self = this;
    if (args[0] === '-l' || args[0] === '--list') { ctx.out('Desired=Unknown/Install/Remove/Purge/Hold'); ctx.out('| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend'); ctx.out('|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)'); ctx.out('||/ Name                 Version                    Architecture Description'); ctx.out('+++-====================-==========================-============-=================================='); Object.keys(this.pkgs).sort().filter(function (k) { return self.pkgs[k].installed; }).forEach(function (k) { ctx.out('ii  ' + padR(k, 20) + ' ' + padR(self.pkgs[k].ver, 26) + ' amd64        ' + self.pkgs[k].desc); }); return 0; }
    if (args[0] === '-s') { var p = this.pkgs[args[1]]; if (!p || !p.installed) { ctx.err("dpkg-query: package '" + args[1] + "' is not installed and no information is available"); return 1; } ctx.out('Package: ' + args[1]); ctx.out('Status: install ok installed'); ctx.out('Version: ' + p.ver); return 0; }
    ctx.err('dpkg: need an action option'); return 2;
  };

  // ======================================================================= network
  M.ip = '10.0.2.15';
  M.resolve = function (host) {
    var h = String(host).toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h === this.hostname) return { ip: '127.0.0.1', local: true };
    if (h === this.ip) return { ip: this.ip, local: true };
    var hosts = this.sysRead('/etc/hosts') || '', m = null;
    hosts.split('\n').forEach(function (l) { var p = l.replace(/#.*/, '').trim().split(/\s+/); if (p.length > 1 && p.slice(1).indexOf(h) >= 0) m = p[0]; });
    if (m) return { ip: m, local: m === '127.0.0.1' || m === this.ip };
    var known = { 'example.com': '93.184.216.34', 'google.com': '142.250.190.46', 'github.com': '140.82.112.3', '8.8.8.8': '8.8.8.8', '1.1.1.1': '1.1.1.1', 'www.google.com': '142.250.190.46', 'ubuntu.com': '185.125.190.20', 'archive.ubuntu.com': '91.189.91.82' };
    if (known[h]) return { ip: known[h], local: false, external: true };
    return null;
  };
  function parseUrl(u) {
    var m = /^(?:(https?):\/\/)?([^\/:?#]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/.exec(u);
    if (!m) return null; var scheme = m[1] || 'http'; return { scheme: scheme, host: m[2], port: m[3] ? +m[3] : (scheme === 'https' ? 443 : 80), path: m[4] || '/', q: m[5] || '' };
  }
  M.httpGet = function (url, ua) {
    var u = parseUrl(url); if (!u) return { err: 3, msg: "URL using bad/illegal format or missing URL" };
    var r = this.resolve(u.host); if (!r) return { err: 6, msg: 'Could not resolve host: ' + u.host };
    if (!r.local) { if (u.host === 'example.com') return { status: 200, body: '<!doctype html>\n<html>\n<head><title>Example Domain</title></head>\n<body>\n<div><h1>Example Domain</h1>\n<p>This domain is for use in illustrative examples in documents.</p></div>\n</body>\n</html>\n', server: 'ECS (dcb/7F83)', type: 'text/html' }; return { status: 200, body: '<html><body>(Practice internet: ' + u.host + ' answered.)</body></html>\n', server: 'gws', type: 'text/html' }; }
    var l = this.listen[u.port];
    if (!l) return { err: 7, msg: 'Failed to connect to ' + u.host + ' port ' + u.port + ' after 0 ms: Couldn\'t connect to server' };
    if (l.svc === 'nginx' || l.svc === 'apache2') {
      var docroot = '/var/www/html', path = u.path === '/' ? '/' : u.path, node = null, content = null, status = 200;
      if (path === '/') { ['/index.html', '/index.nginx-debian.html'].forEach(function () { }); var a = this.sysRead(docroot + '/index.html'); content = a !== null ? a : this.sysRead(docroot + '/index.nginx-debian.html'); }
      else content = this.sysRead(docroot + path);
      var server = l.svc === 'nginx' ? 'nginx/1.24.0 (Ubuntu)' : 'Apache/2.4.58 (Ubuntu)';
      if (content === null) { status = 404; content = l.svc === 'nginx' ? '<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\n</body>\n</html>\n' : '<!DOCTYPE HTML><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>\n'; }
      var logp = l.svc === 'nginx' ? '/var/log/nginx/access.log' : '/var/log/apache2/access.log', d = new Date(this.now());
      this.sysAppendLog(logp, '127.0.0.1 - - [' + p2(d.getUTCDate()) + '/' + U.MON[d.getUTCMonth()] + '/' + d.getUTCFullYear() + ':' + this.hhmmss() + ' +0000] "GET ' + path + ' HTTP/1.1" ' + status + ' ' + content.length + ' "-" "' + (ua || 'curl/8.5.0') + '"');
      this.flags.httpServed = (this.flags.httpServed || 0) + 1;
      return { status: status, body: content, server: server, type: 'text/html' };
    }
    if (l.svc === 'myapp') { this.flags.myappServed = (this.flags.myappServed || 0) + 1; return { status: 200, body: '{"status":"ok","service":"myapp"}', server: 'Node.js', type: 'application/json' }; }
    if (l.svc === 'ssh') return { err: 1, msg: 'Received HTTP/0.9 when not allowed' };
    return { err: 52, msg: 'Empty reply from server' };
  };
  C.curl = function (args, ctx) {
    var o = parseArgs(args, 'oXdHwA'), url = o.rest[0], self = this;
    if (!url) { ctx.err('curl: try \'curl --help\' or \'curl --manual\' for more information'); return 2; }
    var r = this.httpGet(url, o.v.A);
    if (r.err) { if (!o.f.s || o.f.S) ctx.err('curl: (' + r.err + ') ' + r.msg); return r.err; }
    if (o.f.v) { ctx.err('* Connected to ' + parseUrl(url).host); ctx.err('> GET ' + parseUrl(url).path + ' HTTP/1.1'); ctx.err('< HTTP/1.1 ' + r.status + (r.status === 200 ? ' OK' : ' Not Found')); }
    var out = '';
    if (o.f.I) { out = 'HTTP/1.1 ' + r.status + (r.status === 200 ? ' OK' : ' Not Found') + '\nServer: ' + r.server + '\nDate: ' + this.fmtFull(this.now()).replace(/ UTC .*$/, ' GMT') + '\nContent-Type: ' + r.type + '\nContent-Length: ' + r.body.length + '\nConnection: keep-alive\n'; }
    else if (o.f.i) out = 'HTTP/1.1 ' + r.status + ' OK\nServer: ' + r.server + '\nContent-Type: ' + r.type + '\n\n' + r.body;
    else out = r.body;
    if (o.v.o) { var e = this.writeText(o.v.o, out, false); if (e) { ctx.err('curl: (23) Failure writing output to destination'); return 23; } return 0; }
    if (o.v.w) { ctx.raw(out + o.v.w.replace(/%\{http_code\}/g, String(r.status)).replace(/\\n/g, '\n')); return 0; }
    if (o.f.O) { this.writeText(basename(parseUrl(url).path) || 'index.html', out, false); return 0; }
    ctx.raw(out + (out.slice(-1) === '\n' ? '' : '\n')); this.flags.curlOk = true; return 0;
  };
  man('curl', 'curl [-I] [-o FILE] URL', 'Talk to a web address from the command line. The quickest way to test if a web server answers.', ['curl localhost', 'curl -I localhost:3000', 'curl -s http://example.com'], { '-I': 'show only the response headers', '-s': 'silent (no error text)', '-o': 'save to a file', '-v': 'show the conversation' });
  C.wget = function (args, ctx) {
    var o = parseArgs(args, 'O'), url = o.rest[0];
    if (!url) { ctx.err('wget: missing URL'); return 1; }
    var r = this.httpGet(url); if (r.err) { ctx.err('--' + this.hhmmss() + '--  ' + url); ctx.err('Resolving ' + parseUrl(url).host + '... failed: Name or service not known.'); return 4; }
    if (o.v.O === '-') { ctx.raw(r.body); return 0; }
    var name = o.v.O || basename(parseUrl(url).path) || 'index.html'; this.writeText(name, r.body, false);
    if (!o.f.q) { ctx.out('--' + this.isoDate() + ' ' + this.hhmmss() + '--  ' + url); ctx.out('HTTP request sent, awaiting response... 200 OK'); ctx.out("Saving to: '" + name + "'"); ctx.out(''); ctx.out("'" + name + "' saved [" + r.body.length + ']'); }
    return 0;
  };
  C.ping = function (args, ctx) {
    var o = parseArgs(args, 'cW'), host = o.rest[0], n = o.v.c ? +o.v.c : 4;
    if (!host) { ctx.err('ping: usage error: Destination address required'); return 2; }
    var r = this.resolve(host); if (!r) { ctx.err('ping: ' + host + ': Name or service not known'); return 2; }
    ctx.out('PING ' + host + ' (' + r.ip + ') 56(84) bytes of data.');
    var times = [];
    for (var i = 1; i <= n; i++) { var t = r.local ? 0.03 + i * 0.004 : 11 + ((i * 7) % 5) + i * 0.3; times.push(t); ctx.out('64 bytes from ' + (r.local ? 'localhost (' + r.ip + ')' : r.ip) + ': icmp_seq=' + i + ' ttl=' + (r.local ? 64 : 117) + ' time=' + t.toFixed(r.local ? 3 : 1) + ' ms'); }
    var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
    ctx.out(''); ctx.out('--- ' + host + ' ping statistics ---'); ctx.out(n + ' packets transmitted, ' + n + ' received, 0% packet loss, time ' + (n - 1) * 1001 + 'ms');
    ctx.out('rtt min/avg/max/mdev = ' + Math.min.apply(null, times).toFixed(3) + '/' + avg.toFixed(3) + '/' + Math.max.apply(null, times).toFixed(3) + '/0.050 ms');
    if (!o.v.c) ctx.out('(Real ping runs forever until Ctrl+C. Here it stops after 4.)');
    return 0;
  };
  man('ping', 'ping [-c N] HOST', 'Check if another machine is reachable over the network.', ['ping -c 3 8.8.8.8', 'ping -c 2 localhost']);
  C.ip = function (args, ctx) {
    var sub = args[0] || 'addr';
    if (/^a(ddr(ess)?)?$/.test(sub)) {
      ctx.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000'); ctx.out('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00'); ctx.out('    inet 127.0.0.1/8 scope host lo'); ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000'); ctx.out('    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff'); ctx.out('    inet ' + this.ip + '/24 brd 10.0.2.255 scope global dynamic eth0'); ctx.out('       valid_lft 86312sec preferred_lft 86312sec'); return 0;
    }
    if (/^r(oute)?$/.test(sub)) { ctx.out('default via 10.0.2.2 dev eth0 proto dhcp src ' + this.ip + ' metric 100'); ctx.out('10.0.2.0/24 dev eth0 proto kernel scope link src ' + this.ip + ' metric 100'); return 0; }
    if (/^l(ink)?$/.test(sub)) { ctx.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000'); ctx.out('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000'); return 0; }
    ctx.err('Object "' + sub + '" is unknown, try "ip help".'); return 1;
  };
  man('ip', 'ip addr | ip route', 'Show network addresses (ip addr) and the route to the internet (ip route).', ['ip addr', 'ip route']);
  C.ifconfig = function (a, ctx) { ctx.out('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500'); ctx.out('        inet ' + this.ip + '  netmask 255.255.255.0  broadcast 10.0.2.255'); ctx.out('        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)'); ctx.out(''); ctx.out('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536'); ctx.out('        inet 127.0.0.1  netmask 255.0.0.0'); return 0; };
  C.hostname = function (a, ctx) { if (a.indexOf('-I') >= 0 || a.indexOf('-i') >= 0) { ctx.out(this.ip); return 0; } ctx.out(this.hostname); return 0; };
  C.hostnamectl = function (a, ctx) { ctx.out(' Static hostname: ' + this.hostname); ctx.out('       Icon name: computer-vm'); ctx.out('      Machine ID: 8f3a1c2d4e5b6a7980c1d2e3f4a5b6c7'); ctx.out('Operating System: Ubuntu 24.04.1 LTS'); ctx.out('          Kernel: Linux 6.8.0-45-generic'); ctx.out('    Architecture: x86-64'); return 0; };
  function socketRows(self, root) {
    var rows = [], me = self.user.uid === 0;
    rows.push({ proto: 'udp', state: 'UNCONN', local: '127.0.0.54:53', proc: '', pid: 311, n: 'systemd-resolve' });
    rows.push({ proto: 'udp', state: 'UNCONN', local: '127.0.0.53%lo:53', proc: '', pid: 311, n: 'systemd-resolve' });
    Object.keys(self.listen).sort(function (a, b) { return a - b; }).forEach(function (k) { var l = self.listen[k], s = self.svc[l.svc]; var pr = self.procs.filter(function (p) { return p.pid === l.pid; })[0]; var name = pr ? pr.cmd.split(' ')[0].replace(/^.*\//, '').replace(/:$/, '').replace(/^nginx:$/, 'nginx') : l.svc; if (l.svc === 'ssh') name = 'sshd'; if (l.svc === 'nginx') name = 'nginx'; if (l.svc === 'myapp') name = 'node'; rows.push({ proto: 'tcp', state: 'LISTEN', local: (l.addr === '*' ? '*' : l.addr) + ':' + k, pid: l.pid, n: name, user: pr ? pr.user : 'root' }); });
    return rows;
  }
  C.ss = function (args, ctx) {
    var o = parseArgs(args), self = this, showP = o.f.p, root = this.user.uid === 0;
    ctx.out('Netid State  Recv-Q Send-Q      Local Address:Port    Peer Address:Port Process');
    socketRows(this).forEach(function (r) {
      var proc = '';
      if (showP && (root || r.user === self.user.name)) proc = 'users:(("' + r.n + '",pid=' + r.pid + ',fd=' + (r.proto === 'udp' ? 3 : 6) + '))';
      var peer = r.proto === 'udp' ? '0.0.0.0:*' : '0.0.0.0:*';
      ctx.out(padR(r.proto, 6) + padR(r.state, 7) + '0      ' + padR(r.proto === 'tcp' ? '511' : '0', 12) + padL(r.local, 18) + padL(peer, 17) + ' ' + proc);
    });
    return 0;
  };
  man('ss', 'ss -tulpn', 'Show which ports are open (listening) and which program owns them. Needs sudo to see everyone\'s programs.', ['ss -tuln', 'sudo ss -tulpn'], { '-t': 'TCP', '-u': 'UDP', '-l': 'only listening', '-p': 'show the program (needs sudo)', '-n': 'numbers not names' });
  C.netstat = function (args, ctx) {
    var o = parseArgs(args), self = this, root = this.user.uid === 0;
    ctx.out('Active Internet connections (only servers)'); ctx.out('Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name');
    socketRows(this).forEach(function (r) { var proc = o.f.p && (root || r.user === self.user.name) ? r.pid + '/' + r.n : '-'; ctx.out(padR(r.proto, 6) + '     0      0 ' + padR(r.local, 23) + ' ' + padR('0.0.0.0:*', 23) + ' ' + padR(r.proto === 'tcp' ? 'LISTEN' : '', 11) + ' ' + proc); });
    return 0;
  };
  C.lsof = function (args, ctx) {
    if (this.user.uid !== 0) { ctx.err('lsof: WARNING: no root access — showing only your own processes.'); }
    var m = /:(\d+)/.exec(args.join(' ')), self = this; if (!m) { ctx.out('(Try: sudo lsof -i :80)'); return 0; }
    var l = this.listen[+m[1]]; if (!l) return 1;
    var pr = this.procs.filter(function (p) { return p.pid === l.pid; })[0];
    if (this.user.uid !== 0 && pr && pr.user !== this.user.name) return 1;
    ctx.out('COMMAND  PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME'); ctx.out(padR(pr ? pr.cmd.split(' ')[0].replace(/^.*\//, '').replace(/:$/, '') : '?', 8) + ' ' + padL(l.pid, 3) + padL(pr ? pr.user : 'root', 8) + '    6u  IPv4  12345      0t0  TCP *:' + m[1] + ' (LISTEN)'); return 0;
  };
  C.dig = function (a, ctx) { var h = a.filter(function (x) { return x[0] !== '-' && x[0] !== '+' && x[0] !== '@'; })[0], r = h && this.resolve(h); ctx.out('; <<>> DiG 9.18.28 <<>> ' + (h || '')); if (!r || r.local) { ctx.out(';; status: NXDOMAIN'); return 0; } ctx.out(';; ANSWER SECTION:'); ctx.out(padR(h + '.', 24) + '300 IN A ' + r.ip); ctx.out(';; Query time: 18 msec'); return 0; };
  C.nslookup = function (a, ctx) { var h = a[0], r = h && this.resolve(h); ctx.out('Server:\t\t127.0.0.53'); ctx.out('Address:\t127.0.0.53#53\n'); if (!r) { ctx.out("** server can't find " + h + ': NXDOMAIN'); return 1; } ctx.out('Non-authoritative answer:'); ctx.out('Name:\t' + h); ctx.out('Address: ' + r.ip); return 0; };
  C.nc = function (a, ctx) { var port = +a[a.length - 1], l = this.listen[port]; if (a.some(function (x) { return /^-\w*z/.test(x); })) { if (l) { ctx.out('Connection to ' + (a[a.length - 2] || 'localhost') + ' ' + port + ' port [tcp/*] succeeded!'); return 0; } ctx.err('nc: connect to ' + (a[a.length - 2] || 'localhost') + ' port ' + port + ' (tcp) failed: Connection refused'); return 1; } return 1; };
  C.ssh = function (args, ctx) { var t = args.filter(function (a) { return a[0] !== '-'; })[0] || ''; ctx.err('ssh: connect to host ' + t.replace(/^.*@/, '') + ' port 22: Network is unreachable'); ctx.err('(Practice server has no other machines to connect to. Check keys with ssh-keygen and read /etc/ssh/sshd_config.)'); return 255; };
  C['ssh-keygen'] = function (args, ctx) {
    var o = parseArgs(args, 'tfCN'), self = this, path = o.v.f || this.user.home + '/.ssh/id_ed25519', type = o.v.t || 'ed25519';
    var d = this.stat(dirname(this.norm(path)));
    if (d.err) { this.mkdirp(dirname(this.norm(path)), 448, this.user.name, this.user.groups[0]); }
    ctx.out('Generating public/private ' + type + ' key pair.'); ctx.out('Created directory \'' + dirname(path) + '\'.'); ctx.out('(Practice server: no passphrase prompt — using an empty passphrase.)');
    var priv = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZWQyNTUxOQ\n-----END OPENSSH PRIVATE KEY-----\n';
    var e1 = this.writeText(path, priv, false), e2 = this.writeText(path + '.pub', 'ssh-' + type + ' AAAAC3NzaC1lZDI1NTE5AAAAIPracticeKeyOnlyNotReal ' + this.user.name + '@' + this.hostname + '\n', false);
    if (e1 || e2) { ctx.err('Saving key "' + path + '" failed: ' + this.fsMsg(e1 || e2)); return 1; }
    this.stat(path).node.m = 384; this.stat(path + '.pub').node.m = 420;
    ctx.out('Your identification has been saved in ' + path); ctx.out('Your public key has been saved in ' + path + '.pub'); ctx.out('The key fingerprint is:'); ctx.out('SHA256:Zk3p0RtpPracticeFingerprintOnly ' + this.user.name + '@' + this.hostname);
    this.flags.sshkeygen = 1; return 0;
  };
  C.traceroute = function (a, ctx) { ctx.err('traceroute: command not found in this practice server (try ping and ip route).'); return 127; };

  // ======================================================================= firewall
  C.ufw = function (args, ctx) {
    if (this.user.uid !== 0) { ctx.err('ERROR: You need to be root to run this script'); return 1; }
    var self = this, sub = args[0], f = this.ufw;
    function rule(spec) { var m = /^(\d+)(?:\/(tcp|udp))?$/.exec(spec), svc = { ssh: '22/tcp', http: '80/tcp', https: '443/tcp', openssh: '22/tcp', 'nginx full': '80,443/tcp' }[String(spec).toLowerCase()]; return svc ? svc : (m ? m[1] + (m[2] ? '/' + m[2] : '') : null); }
    if (sub === 'status') {
      if (!f.active) { ctx.out('Status: inactive'); return 0; }
      ctx.out('Status: active'); if (args[1] === 'verbose') { ctx.out('Logging: on (low)'); ctx.out('Default: deny (incoming), allow (outgoing), disabled (routed)'); ctx.out('New profiles: skip'); }
      ctx.out(''); ctx.out(padR(args[1] === 'numbered' ? '     To' : 'To', 27) + padR('Action', 12) + 'From'); ctx.out(padR(args[1] === 'numbered' ? '     --' : '--', 27) + padR('------', 12) + '----');
      f.rules.forEach(function (r, i) { var pre = args[1] === 'numbered' ? padR('[' + padL(i + 1, 2) + '] ', 5) : ''; ctx.out(pre + padR(r.to, 27 - pre.length) + padR(r.action, 12) + (r.from || 'Anywhere')); });
      return 0;
    }
    if (sub === 'enable') { ctx.out('Command may disrupt existing ssh connections. Proceed with operation (y|n)? y'); ctx.out('Firewall is active and enabled on system startup'); f.active = true; this.flags.ufwEnabled = 1; this.syslogAdd('kernel: [UFW] firewall enabled'); return 0; }
    if (sub === 'disable') { f.active = false; ctx.out('Firewall stopped and disabled on system startup'); return 0; }
    if (sub === 'reset') { f.active = false; f.rules = []; ctx.out('Resetting all rules to installed defaults. Proceed with operation (y|n)? y'); ctx.out('Backing up \'user.rules\' to \'/etc/ufw/user.rules.20261127_104500\''); return 0; }
    if (sub === 'allow' || sub === 'deny' || sub === 'reject' || sub === 'limit') {
      var spec = args.slice(1).filter(function (x) { return x !== 'from' && x !== 'to' && x !== 'any' && x !== 'port'; }).join(' '), r = rule(spec);
      if (!r) { ctx.err('ERROR: Could not find a profile matching \'' + spec + '\''); return 1; }
      var act = sub.toUpperCase(); if (sub === 'limit') act = 'LIMIT';
      if (f.rules.some(function (x) { return x.to === r && x.action === act; })) { ctx.out('Skipping adding existing rule'); ctx.out('Skipping adding existing rule (v6)'); return 0; }
      f.rules.push({ to: r, action: act, from: 'Anywhere' }); f.rules.push({ to: r + ' (v6)', action: act, from: 'Anywhere (v6)' });
      if (!f.active) ctx.out('Rules updated'); else { ctx.out('Rule added'); ctx.out('Rule added (v6)'); }
      this.flags['ufw:' + sub + ':' + r] = 1; return 0;
    }
    if (sub === 'delete') {
      var spec2 = args.slice(1).join(' '), n = /^\d+$/.test(args[1]) ? +args[1] : null;
      if (n) { if (n < 1 || n > f.rules.length) { ctx.err('ERROR: Could not delete non-existent rule'); return 1; } f.rules.splice(n - 1, 1); ctx.out('Rule deleted'); return 0; }
      var rr = rule(spec2.replace(/^(allow|deny)\s+/, '')), before = f.rules.length; f.rules = f.rules.filter(function (x) { return x.to.replace(' (v6)', '') !== rr; });
      if (f.rules.length === before) { ctx.err('Could not delete non-existent rule'); return 1; } ctx.out('Rule deleted'); ctx.out('Rule deleted (v6)'); return 0;
    }
    if (sub === 'default') { ctx.out('Default ' + args[1] + ' policy changed to \'' + args[2] + '\''); ctx.out('(be sure to update your rules accordingly)'); return 0; }
    if (sub === 'logging') { ctx.out('Logging enabled'); return 0; }
    ctx.out('Usage: ufw COMMAND'); ctx.out('Commands: enable | disable | status | allow PORT | deny PORT | delete RULE | reset'); return 1;
  };
  man('ufw', 'sudo ufw allow PORT | enable | status', 'A simple firewall: choose which ports the outside world may reach. Always allow ssh (22) BEFORE enabling it, or you lock yourself out!', ['sudo ufw allow 22/tcp', 'sudo ufw allow http', 'sudo ufw enable', 'sudo ufw status numbered'], { allow: 'let traffic in on a port', deny: 'block a port', enable: 'turn the firewall on', delete: 'remove a rule', status: 'show the rules' });
  C.iptables = function (args, ctx) {
    if (this.user.uid !== 0) { ctx.err("iptables v1.8.10 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)"); return 4; }
    ctx.out('Chain INPUT (policy ' + (this.ufw.active ? 'DROP' : 'ACCEPT') + ')'); ctx.out('target     prot opt source               destination'); if (this.ufw.active) ctx.out('ufw-before-input  all  --  anywhere  anywhere'); ctx.out(''); ctx.out('Chain FORWARD (policy DROP)'); ctx.out('target     prot opt source               destination'); ctx.out(''); ctx.out('Chain OUTPUT (policy ACCEPT)'); ctx.out('target     prot opt source               destination'); return 0;
  };

  // ======================================================================= cron
  function cronField(f, v, min) {
    return f.split(',').some(function (p) {
      if (p === '*') return true;
      var m = /^\*\/(\d+)$/.exec(p); if (m) return (v - min) % +m[1] === 0;
      var r = /^(\d+)-(\d+)$/.exec(p); if (r) return v >= +r[1] && v <= +r[2];
      return +p === v;
    });
  }
  M.cronMatch = function (expr, ms) {
    var f = expr.trim().split(/\s+/); if (f.length < 6) return null; var d = new Date(ms);
    if (cronField(f[0], d.getUTCMinutes(), 0) && cronField(f[1], d.getUTCHours(), 0) && cronField(f[2], d.getUTCDate(), 1) && cronField(f[3], d.getUTCMonth() + 1, 1) && cronField(f[4], d.getUTCDay(), 0)) return f.slice(5).join(' ');
    return null;
  };
  M.cronCatchUp = function () {
    var cur = Math.floor(this.now() / 60000), self = this, guard = 0;
    while (this.lastCronMin < cur && guard++ < 180) {
      this.lastCronMin++; var ms = this.lastCronMin * 60000;
      Object.keys(this.cron).forEach(function (uname) {
        var u = self.users[uname]; if (!u) return;
        (self.cron[uname] || '').split('\n').forEach(function (ln) {
          ln = ln.trim(); if (!ln || ln[0] === '#') return;
          var cmd = self.cronMatch(ln, ms); if (cmd === null) return;
          var saveScreen = self.screen, saveUser = self.user, saveCwd = self.cwd, saveCode = self.lastCode, saveLog = self.cmdlog.length;
          self.screen = []; self.user = u; self.cwd = u.home; self.depth = 1; self.fixedNow = ms;
          self.sysAppendLog('/var/log/syslog', self.syslogTime(ms) + ' ' + self.hostname + ' CRON[' + self.newPid() + ']: (' + uname + ') CMD (' + cmd + ')');
          try { self.execLine(cmd, []); } catch (e) { }
          self.cmdlog.length = saveLog; self.flags.cronRan = (self.flags.cronRan || 0) + 1;
          self.screen = saveScreen; self.user = saveUser; self.cwd = saveCwd; self.lastCode = saveCode; self.depth = 0; self.fixedNow = null;
        });
      });
    }
  };
  var baseRun = M.run;
  M.run = function (line) {
    var out = baseRun.call(this, line);
    var keepScreen = this.screen;
    this.cronCatchUp(); this.screen = keepScreen;
    return out;
  };
  C.crontab = function (args, ctx) {
    var o = parseArgs(args, 'u'), target = o.v.u || this.user.name, self = this;
    if (o.v.u && this.user.uid !== 0) { ctx.err('must be privileged to use -u'); return 1; }
    if (o.f.l) { var t = this.cron[target]; if (!t) { ctx.err('no crontab for ' + target); return 1; } ctx.raw(t.replace(/\n?$/, '\n')); return 0; }
    if (o.f.r) { delete this.cron[target]; return 0; }
    if (o.f.e) { this.editor = { path: '/tmp/crontab.' + target, shown: 'crontab', text: this.cron[target] || '# m h  dom mon dow   command\n# Example: run every minute\n# * * * * * date >> /tmp/cron-test.txt\n', isNew: !this.cron[target], name: 'crontab', uid: this.user.uid, crontab: target }; return 0; }
    var src = o.rest[0];
    if (src === '-' || (!src && ctx.stdin)) { this.cron[target] = ctx.stdin; this.flags.crontabSet = 1; this.lastCronMin = Math.floor(this.now() / 60000); return 0; }
    if (src) { var r = this.readText(src); if (r.err) { ctx.err('crontab: ' + src + ': ' + this.fsMsg(r.err)); return 1; } this.cron[target] = r.text; this.flags.crontabSet = 1; this.lastCronMin = Math.floor(this.now() / 60000); return 0; }
    ctx.err('crontab: usage error: file name or - (for stdin) must be specified'); return 1;
  };
  M.saveCrontab = function (user, text) { this.cron[user] = text; this.flags.crontabSet = 1; this.lastCronMin = Math.floor(this.now() / 60000); this.syslogAdd('crontab[' + this.newPid() + ']: (' + user + ') REPLACE (' + user + ')'); return null; };
  man('crontab', 'crontab -l | -e', 'Schedule commands to run automatically (every minute, hour, day…). Format: minute hour day month weekday command.', ['crontab -l', 'crontab -e', '(echo "* * * * * date >> /tmp/t.txt") | crontab -'], { '-l': 'list your jobs', '-e': 'edit your jobs', '-r': 'remove all your jobs' });

  // ======================================================================= demo lock
  var baseDispatch = M.dispatch;
  M.dispatch = function (args, ctx) {
    if (this.opts.demo) {
      var n = args[0] === 'sudo' ? args[1] : args[0];
      if (n && LOCKED[n] && !(args[0] === 'sudo' && !LOCKED[n])) {
        ctx.err('🔒 "' + n + '" is part of the full Linux Server Lab (Phase 2).');
        ctx.err('The free demo covers files, text tools, permissions and processes. Unlock the full lab for services, apt, firewall, cron, users, logs and more.');
        return 126;
      }
    }
    return baseDispatch.call(this, args, ctx);
  };
  LX.LOCKED = LOCKED;
})(typeof window !== 'undefined' ? window : global);
