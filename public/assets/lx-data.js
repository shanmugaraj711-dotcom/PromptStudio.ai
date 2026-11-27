/* lx-data.js — the starting state of the practice server: files, logs, practice data. */
(function (root) {
  'use strict';
  var LX = root.LX, M = LX.Machine.prototype;

  M.syncAccounts = function () {
    var self = this, pw = '', gr = '', sh = '';
    Object.keys(this.users).forEach(function (k) {
      var u = self.users[k];
      pw += u.name + ':x:' + u.uid + ':' + u.gid + ':' + (u.gecos || '') + ':' + u.home + ':' + u.shell + '\n';
      sh += u.name + ':' + (u.uid === 0 || u.uid >= 1000 ? '$y$j9T$abc123$hashedpasswordhere' : '*') + ':20420:0:99999:7:::\n';
    });
    Object.keys(this.groups).forEach(function (g) {
      var members = Object.keys(self.users).filter(function (k) { var u = self.users[k]; return u.groups.indexOf(g) >= 0 && u.groups[0] !== g; }).join(',');
      gr += g + ':x:' + self.groups[g] + ':' + members + '\n';
    });
    this.sysWrite('/etc/passwd', pw); this.sysWrite('/etc/group', gr);
    var shNode = this.find('/etc/shadow', true).node;
    if (shNode) shNode.c = sh; else this.put('/etc/shadow', sh, 416, 'root', 'shadow');
  };

  M.buildFs = function () {
    var self = this, L = 'learner';
    function f(path, c, mode, o, g) { return self.put(path, c, mode, o || 'root', g || 'root'); }
    function d(path, mode, o, g) { var n = self.mkdirp(path, mode, o || 'root', g || 'root'); if (mode !== undefined) n.m = mode; if (o) { n.o = o; n.g = g || o; } return n; }
    ['/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/media', '/mnt', '/opt', '/proc', '/root', '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var'].forEach(function (p) { d(p, 493); });
    this.root.k.bin = { t: 'l', m: 511, o: 'root', g: 'root', mt: this.now(), l: 'usr/bin' };
    this.root.k.sbin = { t: 'l', m: 511, o: 'root', g: 'root', mt: this.now(), l: 'usr/sbin' };
    this.root.k.lib = { t: 'l', m: 511, o: 'root', g: 'root', mt: this.now(), l: 'usr/lib' };
    d('/tmp', 1023); // drwxrwxrwt (sticky)
    d('/root', 448); d('/home/learner', 493, L, L); d('/usr/bin'); d('/usr/sbin'); d('/usr/lib'); d('/usr/share'); d('/usr/local/bin');
    d('/var/log'); d('/var/www'); d('/var/tmp', 511); d('/var/lib'); d('/var/cache'); d('/var/spool/cron/crontabs', 472, 'root', 'crontab'); d('/etc/ssh'); d('/etc/myapp'); d('/etc/apt'); d('/etc/cron.d'); d('/etc/systemd/system'); d('/opt/myapp');

    // ---- /etc
    f('/etc/hostname', this.hostname + '\n');
    f('/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 ' + this.hostname + '\n10.0.2.15 ' + this.hostname + '\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\n');
    f('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\n');
    f('/etc/issue', 'Ubuntu 24.04.1 LTS \\n \\l\n');
    f('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n');
    f('/etc/timezone', 'Etc/UTC\n');
    f('/etc/fstab', '# <file system> <mount point> <type> <options> <dump> <pass>\nUUID=3f1c2d4e-9a8b-4c7d-8e6f-1a2b3c4d5e6f /     ext4 defaults 0 1\nUUID=7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d /boot ext4 defaults 0 2\n');
    f('/etc/crontab', '# /etc/crontab: system-wide crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n# m h dom mon dow user  command\n17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly\n25 6    * * *   root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )\n');
    f('/etc/sudoers', 'Defaults\tenv_reset\nDefaults\tsecure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n\n# User privilege specification\nroot\tALL=(ALL:ALL) ALL\n\n# Members of the admin group may gain root privileges\n%admin ALL=(ALL) ALL\n\n# Allow members of group sudo to execute any command\n%sudo\tALL=(ALL:ALL) ALL\n', 288);
    f('/etc/ssh/sshd_config', '# This is the sshd server system-wide configuration file.\nInclude /etc/ssh/sshd_config.d/*.conf\n\nPort 22\nPermitRootLogin yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\nX11Forwarding yes\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem sftp /usr/lib/openssh/sftp-server\n');
    f('/etc/apt/sources.list', 'deb http://archive.ubuntu.com/ubuntu noble main restricted universe multiverse\ndeb http://archive.ubuntu.com/ubuntu noble-updates main restricted universe multiverse\ndeb http://security.ubuntu.com/ubuntu noble-security main restricted universe multiverse\n');
    f('/etc/myapp/config.env', '# myapp settings\nPORT=80\nDB_HOST=localhost\nLOG_LEVEL=info\n');
    f('/etc/systemd/system/myapp.service', '[Unit]\nDescription=My demo web app\nAfter=network.target\n\n[Service]\nUser=www-data\nEnvironmentFile=/etc/myapp/config.env\nExecStart=/usr/bin/node /opt/myapp/server.js\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n');

    // ---- /home/learner
    f('/home/learner/.bashrc', '# ~/.bashrc: executed by bash for non-login shells.\nexport HISTSIZE=1000\nalias ll=\'ls -alF\'\nalias la=\'ls -A\'\n', 420, L, L);
    f('/home/learner/.profile', '# ~/.profile: executed for login shells.\n[ -f ~/.bashrc ] && . ~/.bashrc\n', 420, L, L);
    f('/home/learner/welcome.txt', 'Welcome to your practice Linux server!\n\nYou are logged in as "learner". Nothing here can break your real computer.\n\nStart with:  pwd   then   ls   then   cat notes.txt\nStuck? Type  help  or  explain <command>.\n', 420, L, L);
    f('/home/learner/notes.txt', 'SERVER TODO\n-----------\n1. Learn to move around (pwd, ls, cd)\n2. Install and start the nginx web server\n3. The app "myapp" is DOWN. Find out why and fix it.\n4. Something is eating the CPU. Find it and stop it.\n\n(Tip: the logs in /var/log tell you what happened.)\n', 420, L, L);
    d('/home/learner/projects', 493, L, L);
    f('/home/learner/projects/README.md', '# Projects\n\ndeploy.sh  - deploys the app (not runnable yet - check its permissions!)\nbackup.sh  - nightly backup script\n', 420, L, L);
    f('/home/learner/projects/deploy.sh', '#!/bin/bash\n# Deploys myapp\necho "Deploying myapp..."\nsleep 1\necho "Copying files..."\necho "Done! myapp deployed."\n', 420, L, L);
    f('/home/learner/projects/backup.sh', '#!/bin/bash\n# Nightly backup - TODO: fix, it never stops!\nwhile true; do\n  tar -czf /tmp/backup.tar.gz /home/learner\ndone\n', 493, L, L);
    d('/home/learner/projects/app', 493, L, L);
    f('/home/learner/projects/app/index.html', '<html><body><h1>Hello from my app</h1></body></html>\n', 420, L, L);
    d('/home/learner/data', 493, L, L);
    f('/home/learner/data/fruits.txt', 'banana\napple\ncherry\napple\nbanana\napple\ndate\nelderberry\n', 420, L, L);
    f('/home/learner/data/numbers.txt', '42\n7\n100\n3\n58\n7\n', 420, L, L);
    f('/home/learner/data/sales.csv', 'date,product,qty,price\n2026-11-01,notebook,10,250\n2026-11-01,pen,40,40\n2026-11-02,mug,5,350\n2026-11-03,notebook,7,250\n2026-11-03,pen,25,40\n2026-11-04,mug,2,350\n2026-11-05,notebook,12,250\n', 420, L, L);
    f('/home/learner/data/team.txt', 'asha:developer:pune\nravi:sysadmin:chennai\nmeena:developer:hyderabad\nkiran:devops:bengaluru\nasha:developer:pune\n', 420, L, L);
    d('/home/learner/logs', 493, L, L);
    var ips = ['192.168.1.10', '192.168.1.22', '10.0.0.5', '192.168.1.10', '172.16.4.9', '192.168.1.22', '192.168.1.10', '10.0.0.5'];
    var pages = [['GET /index.html', 200, 1024], ['GET /about.html', 200, 2048], ['GET /missing.png', 404, 162], ['POST /login', 200, 512], ['GET /api/data', 500, 98], ['GET /index.html', 200, 1024], ['GET /old-page', 404, 162], ['GET /style.css', 200, 4096]];
    var log = '';
    for (var i = 0; i < 24; i++) { var pg = pages[(i * 3 + 1) % pages.length]; log += ips[i % ips.length] + ' - - [27/Nov/2026:09:' + (10 + i) + ':0' + (i % 10) + ' +0000] "' + pg[0] + ' HTTP/1.1" ' + pg[1] + ' ' + pg[2] + '\n'; }
    f('/home/learner/logs/sample-access.log', log, 420, L, L);
    d('/home/learner/.ssh', 448, L, L);

    // ---- /root (private!)
    f('/root/.bashrc', '# root bashrc\n', 420);
    f('/root/secret.txt', 'Only root can read this. If you can see it, you are root!\n', 384);

    // ---- /opt/myapp
    f('/opt/myapp/server.js', "// Tiny demo web app\nconst http = require('http');\nconst port = process.env.PORT || 3000;\nhttp.createServer((req, res) => {\n  res.end(JSON.stringify({ status: 'ok', service: 'myapp' }));\n}).listen(port);\n");
    f('/opt/myapp/package.json', '{ "name": "myapp", "version": "1.0.0", "main": "server.js" }\n');

    // ---- logs
    var T = function (m, s) { return '2026-11-27T0' + m + ':' + s; };
    f('/var/log/syslog', 'Nov 24 10:12:01 ' + this.hostname + ' systemd[1]: Started cron.service - Regular background program processing daemon.\nNov 24 10:12:02 ' + this.hostname + ' systemd[1]: Started ssh.service - OpenBSD Secure Shell server.\nNov 27 07:30:11 ' + this.hostname + ' CRON[1022]: (root) CMD (cd / && run-parts --report /etc/cron.hourly)\nNov 27 08:01:12 ' + this.hostname + ' systemd[1]: Starting myapp.service - My demo web app...\nNov 27 08:01:13 ' + this.hostname + ' node[1844]: Error: listen EADDRINUSE: address already in use :::80\nNov 27 08:01:13 ' + this.hostname + ' systemd[1]: myapp.service: Main process exited, code=exited, status=1/FAILURE\nNov 27 08:01:13 ' + this.hostname + ' systemd[1]: myapp.service: Failed with result \'exit-code\'.\nNov 27 09:30:00 ' + this.hostname + ' CRON[1530]: (learner) CMD (/home/learner/projects/backup.sh)\n', 416, 'syslog', 'adm');
    f('/var/log/auth.log', 'Nov 24 10:12:03 ' + this.hostname + ' sshd[412]: Server listening on 0.0.0.0 port 22.\nNov 27 08:55:41 ' + this.hostname + ' sshd[1710]: Failed password for invalid user admin from 203.0.113.50 port 51022 ssh2\nNov 27 08:55:44 ' + this.hostname + ' sshd[1712]: Failed password for invalid user admin from 203.0.113.50 port 51030 ssh2\nNov 27 08:55:49 ' + this.hostname + ' sshd[1714]: Failed password for root from 203.0.113.50 port 51044 ssh2\nNov 27 10:40:02 ' + this.hostname + ' sshd[1990]: Accepted password for learner from 10.0.2.2 port 51190 ssh2\nNov 27 10:40:02 ' + this.hostname + ' systemd-logind[520]: New session 4 of user learner.\n', 416, 'syslog', 'adm');
    f('/var/log/myapp.log', '[2026-11-27 08:01:12] myapp starting...\n[2026-11-27 08:01:12] reading /etc/myapp/config.env\n[2026-11-27 08:01:13] ERROR: listen EADDRINUSE: address already in use :::80\n[2026-11-27 08:01:13] HINT: another program is already using port 80. Change PORT in config.env.\n', 420, 'www-data', 'www-data');
    f('/var/log/dpkg.log', '2026-11-20 09:00:10 status installed curl:amd64 8.5.0-2ubuntu10\n2026-11-20 09:00:12 status installed git:amd64 1:2.43.0-1ubuntu7\n', 420, 'root', 'adm');
    f('/var/log/kern.log', 'Nov 24 10:12:00 ' + this.hostname + ' kernel: Linux version 6.8.0-45-generic\nNov 24 10:12:00 ' + this.hostname + ' kernel: Command line: BOOT_IMAGE=/boot/vmlinuz-6.8.0-45-generic root=UUID=3f1c2d4e ro quiet\n', 416, 'syslog', 'adm');

    // ---- /tmp
    f('/tmp/old-cache.tmp', 'stale cache data\n'.repeat(40), 420, L, L);
    f('/tmp/session-1203.tmp', 'tmp\n', 420, L, L);

    // ---- /proc & /dev
    f('/proc/version', 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-079) (x86_64-linux-gnu-gcc-13) #45-Ubuntu SMP PREEMPT_DYNAMIC\n', 292);
    f('/proc/cpuinfo', 'processor\t: 0\nmodel name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz\ncpu MHz\t\t: 2400.000\ncache size\t: 35840 KB\n\nprocessor\t: 1\nmodel name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz\ncpu MHz\t\t: 2400.000\ncache size\t: 35840 KB\n', 292);
    f('/proc/loadavg', '0.92 0.71 0.60 2/180 3105\n', 292);
    f('/proc/uptime', '262354.18 498212.77\n', 292);
    f('/proc/meminfo', 'MemTotal:        4012032 kB\nMemFree:         1523456 kB\nMemAvailable:    2988112 kB\nBuffers:           98304 kB\nCached:          1245184 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n', 292);
    var nul = f('/dev/null', '', 438); nul.dev = 'null';
    var zero = f('/dev/zero', '', 438); zero.dev = 'null';
    this.syncAccounts();
  };
})(typeof window !== 'undefined' ? window : global);
