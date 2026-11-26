// test_sims.js — drives every rebuilt sim through the shell engine.
// Usage: node tests/test_sims.js
// Exits non-zero on any failure.
'use strict';
// The shipped engine sets window.__didYouMean at load (PR #120 typo
// hints). Under Node there is no window, so provide one before the
// require. The shipped file (assets/sim.js) is untouched.
if (typeof window === 'undefined') global.window = {};
const fs = require('fs');
const path = require('path');
const { createShell, normalizeCmd } = require('../engine/sim.js');

const SITE = path.join(__dirname, '..');
let failures = 0;
let passes = 0;

function ok(cond, label) {
  if (cond) { passes++; }
  else { failures++; console.log('  FAIL: ' + label); }
}
function normLines(lines) {
  return lines
    // parenthetical notes in the lab output are not real output
    .filter(l => !(l.startsWith('(') && l.endsWith(')')))
    .map(l => l.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, 'DATE')
               // file sizes in ls output: the lab rounds them, the engine is exact
               .replace(/(DATE)\s+\d+/, '$1 SIZE')
               .replace(/\s+$/g, ''));
}
function sameLines(a, b) {
  const na = normLines(a), nb = normLines(b);
  return na.length === nb.length && na.every((l, i) => l === nb[i]);
}
function loadSim(slug) {
  const html = fs.readFileSync(path.join(SITE, 'sims', slug + '.html'), 'utf8');
  const m = html.match(/window\.SIM_DATA = (\{.*?\});\s*<\/script>/s);
  if (!m) throw new Error('no SIM_DATA in ' + slug);
  return JSON.parse(m[1]);
}

// Feed one guided step, return all output lines the engine produced.
function feedStep(shell, step) {
  const cmd = step.cmd;
  const out = [];
  if (cmd.includes('\n')) {
    // heredoc: type line by line
    cmd.split('\n').forEach(line => {
      const r = shell.run(line);
      out.push(...r.lines);
    });
    return out;
  }
  if (cmd.includes('kafka-console-producer')) {
    const r = shell.run(cmd);
    out.push(...r.lines);
    // message lines live in the step's documented output, after "> "
    (step.out || []).forEach(l => {
      if (l.startsWith('> ')) {
        const rr = shell.run(l.slice(2));
        out.push(...rr.lines);
      }
    });
    const exit = shell.run('exit');
    out.push(...exit.lines);
    return out;
  }
  const r = shell.run(cmd);
  out.push(...r.lines);
  return out;
}

function testSim(slug) {
  console.log('== ' + slug + ' ==');
  const data = loadSim(slug);
  const shell = createShell(data);
  const steps = data.steps;
  ok(data.world && data.world.containers, slug + ': world present');
  ok(steps.length > 0, slug + ': steps present');

  // free commands before anything is up
  let r = shell.run('pwd');
  ok(r.lines[0] === '/home/learner', slug + ': pwd -> /home/learner');
  r = shell.run('frobnicate');
  ok(r.kind === 'err' && /command not found/.test(r.lines[0]), slug + ': wrong command -> command not found');
  r = shell.run('docker compose ps');
  ok(/No containers/.test(r.lines.join(' ')), slug + ': ps before up -> no containers');
  r = shell.run('help');
  ok(r.lines.join(' ').includes('docker compose up'), slug + ': help lists docker compose up');
  r = shell.run('ls');
  ok(r.lines.length === 1 && r.lines[0].length > 0, slug + ': ls lists files');

  // guided sequence
  steps.forEach((step, i) => {
    // object-store mirror copies after 2s; advance the clock past it
    if (slug === 'object-store' && (i === 6 || i === 8)) shell.advanceTime(2500);
    const before = shell.getWorld();
    const out = feedStep(shell, step);
    const done = shell.checkDone(step, normalizeCmd(step.cmd));
    ok(done, `${slug} step ${i + 1} completes: ${step.cmd.split('\n')[0].slice(0, 60)}`);
    if (!step.live) {
      ok(sameLines(out, step.out || []),
        `${slug} step ${i + 1} output matches lab output\n    engine: ${JSON.stringify(normLines(out))}\n    lab:    ${JSON.stringify(normLines(step.out || []))}`);
    } else {
      // live steps: the key facts must be in the engine output,
      // except producer steps, where the facts are the messages
      // landing in the topic (the learner sees them echoed as typed)
      if (step.cmd.includes('kafka-console-producer')) {
        const topic = (step.out || []).filter(l => l.startsWith('> ')).map(l => l.slice(2));
        const world = shell.getWorld();
        const stored = (world.kafka['kafka-a'].topics['orders'] || []);
        ok(topic.every(t => stored.includes(t)),
          `${slug} step ${i + 1} (producer) messages landed in the topic`);
      } else {
        const joined = out.join('\n');
        const key = (step.out || []).filter(l => l && !l.startsWith('(') && l !== '^C');
        const hit = key.length === 0 || key.some(k => joined.includes(k.replace(/^\s+/, '').trim().split(' | ')[0].trim()) || joined.includes(k.trim()));
        ok(hit, `${slug} step ${i + 1} (live) output carries the lab facts: ${JSON.stringify(out.slice(0, 3))}`);
      }
    }
  });

  // after the guided steps, free play still works
  r = shell.run('history');
  ok(r.lines.length >= steps.length, slug + ': history lists the typed commands');
  r = shell.run('echo hello');
  ok(r.lines[0] === 'hello', slug + ': echo works in free play');
  r = shell.run('clear');
  ok(r.clear === true, slug + ': clear works');
  r = shell.run('whoami');
  ok(r.lines[0] === 'learner', slug + ': whoami works');
  const comp = shell.completions('dock');
  ok(comp.includes('docker'), slug + ': tab completion offers docker');
  ok(shell.getMode() === 'normal', slug + ': back in normal mode');
  console.log(`  ${slug}: done`);
}

// targeted state checks beyond the guided sequence
function targeted() {
  console.log('== targeted state checks ==');
  // redis: TTL counts down, INCR works, replica is read-only
  const redis = createShell(loadSim('redis'));
  redis.run('docker compose up -d');
  redis.run('docker exec redis-a redis-cli SETEX code 60 1234');
  let r = redis.run('docker exec redis-a redis-cli TTL code');
  ok(r.lines[0] === '(integer) 60', 'redis TTL starts at 60, got ' + r.lines[0]);
  redis.advanceTime(5000);
  r = redis.run('docker exec redis-a redis-cli TTL code');
  ok(r.lines[0] === '(integer) 55', 'redis TTL counts down to 55, got ' + r.lines[0]);
  r = redis.run('docker exec redis-b redis-cli SET x 1');
  ok(r.kind === 'err' && /READONLY/.test(r.lines[0]), 'redis replica refuses writes');
  r = redis.run('docker exec redis-a redis-cli SET bad');
  ok(r.lines[0] === 'OK' || r.kind === 'out', 'redis SET with no value is tolerated');
  r = redis.run('docker exec redis-a redis-cli FROB x');
  ok(/unknown command/.test(r.lines[0]), 'redis unknown command errors');

  // kafka: producer -> consumer round trip, unknown topic errors
  const kafka = createShell(loadSim('kafka'));
  kafka.run('docker compose up -d');
  r = kafka.run('docker exec kafka-a /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic nope --from-beginning');
  ok(r.kind === 'err' && /does not exist/.test(r.lines[0]), 'kafka consumer on missing topic errors');
  kafka.run('docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic t1 --partitions 1 --replication-factor 1');
  kafka.run('docker exec kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic t1');
  ok(kafka.getMode() === 'producer', 'producer mode entered');
  kafka.run('hello world');
  r = kafka.run('^C');
  ok(r.lines.includes('^C') && kafka.getMode() === 'normal', 'Ctrl+C leaves producer mode');
  r = kafka.run('docker exec kafka-b /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic a.t1 --from-beginning');
  ok(r.lines.includes('hello world'), 'mirror copied the message to kafka-b as a.t1');

  // postgresql: chmod with no target errors (the real mistake), promote works
  const pg = createShell(loadSim('postgresql'));
  r = pg.run('chmod -R a+r');
  ok(r.kind === 'err' && /missing operand/.test(r.lines[0]), 'chmod with no target errors like the real one');
  r = pg.run('chmod -R a+r .');
  ok(r.kind === 'out', 'chmod with a target is silent');
  pg.run('docker compose up -d');
  r = pg.run('docker exec pg-replica psql -U learner -d practice -c "SELECT * FROM orders;"');
  ok(/does not exist/.test(r.lines[0]), 'SELECT before CREATE errors');
  pg.run('docker exec pg-primary psql -U learner -d practice -c "CREATE TABLE orders (id INT, item TEXT, amount INT);"');
  pg.run('docker exec pg-primary psql -U learner -d practice -c "INSERT INTO orders VALUES (1, \'a\', 5);"');
  r = pg.run('docker exec pg-replica psql -U learner -d practice -c "SELECT * FROM orders;"');
  ok(r.lines.join(' ').includes('a'), 'replica sees the row');

  // object store: cat the real receipt file, bad bucket errors
  const s3 = createShell(loadSim('object-store'));
  r = s3.run('cat /files/receipt-001.txt');
  ok(r.lines[0].startsWith('Fake receipt'), 'cat shows the real receipt file');
  s3.run('docker compose up -d --build');
  r = s3.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls s3://nope/');
  ok(r.kind === 'err' && /NoSuchBucket/.test(r.lines[0]), 'ls on a missing bucket errors');
  r = s3.run('docker compose exec awscli aws s3 ls');
  ok(r.kind === 'err' && /endpoint/.test(r.lines.join(' ')), 'aws without an endpoint errors');

  // load balancer: round robin, stop removes a backend, curl to a dead port errors
  const lb = createShell(loadSim('load-balancer'));
  r = lb.run('curl http://localhost:8080/');
  ok(r.kind === 'err' && /refused/.test(r.lines[0]), 'curl before up is refused');
  lb.run('docker compose up -d');
  const hosts = [];
  for (let i = 0; i < 3; i++) hosts.push(lb.run('curl http://localhost:8080/').lines[0]);
  ok(hosts.join(',') === 'Hostname: web1,Hostname: web2,Hostname: web3', 'round robin web1 web2 web3, got ' + hosts.join(','));
  lb.run('docker compose stop web2');
  const hosts2 = [];
  for (let i = 0; i < 2; i++) hosts2.push(lb.run('curl http://localhost:8080/').lines[0]);
  ok(hosts2.every(h => h !== 'Hostname: web2'), 'stopped web2 never answers: ' + hosts2.join(','));
  r = lb.run('curl http://localhost:9999/');
  ok(r.kind === 'err', 'curl to a dead port errors');
  r = lb.run('for i in 1 2; do curl -s http://localhost:8080/ | grep Hostname; done');
  ok(r.lines.length === 2, 'for loop runs the body twice');
}

['kafka', 'postgresql', 'redis', 'object-store', 'load-balancer', 'end-to-end', 'lesson-0', 'error-decoder', 'p1-start', 'p2-start', 'p2-zero-cost', 'p2-kubernetes', 'p2-break-fix', 'p2-cheat-sheets', 'p2-interview', 'p2-portfolio', 'p2-resume', 'p2-best-sites'].forEach(testSim);
targeted();
newFixes();

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// targeted checks for the Gemini-review fixes (2026-11-20)
function newFixes() {
  console.log('== Gemini-review fixes ==');

  // 1. end-to-end down says 11, in the guided step and in free play
  const e2eData = loadSim('end-to-end');
  const e2e = createShell(e2eData);
  const downStep = e2eData.steps.find(function (s) { return s.cmd === 'docker compose down -v'; });
  ok(downStep && downStep.out[0] === '11 containers removed',
    'end-to-end down step documents 11 containers removed, got ' + (downStep && downStep.out[0]));
  ok(e2eData.world.down_out === '11 containers removed',
    'end-to-end down_out is 11 containers removed, got ' + e2eData.world.down_out);
  e2e.run('docker compose up -d --build');
  let r = e2e.run('docker compose down -v');
  ok(r.lines[0] === '11 containers removed',
    'end-to-end free-play down says 11, got ' + r.lines[0]);

  // 2. malformed s3:// destination gives a clean error, no throw
  const s3 = createShell(loadSim('object-store'));
  s3.run('docker compose up -d --build');
  s3.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming');
  r = s3.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://');
  ok(r.kind === 'err' && /invalid S3 destination/.test(r.lines[0]),
    'malformed s3:// destination errors cleanly, got ' + JSON.stringify(r.lines));
  r = s3.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3:/incoming/');
  ok(r.kind === 'err',
    'malformed s3:/ destination errors cleanly, got ' + JSON.stringify(r.lines));
  r = s3.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://incoming/');
  ok(r.kind === 'out' && /upload:/.test(r.lines[0]), 'good s3 cp still works after bad ones');

  // 3. mirror copies within the new 2s delay
  const s3b = createShell(loadSim('object-store'));
  ok(s3b.getWorld().spec.mirror_delay_ms === 2000, 'object-store mirror delay is 2000ms');
  s3b.run('docker compose up -d --build');
  s3b.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming');
  s3b.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://incoming/');
  s3b.advanceTime(2500);
  r = s3b.run('docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/');
  ok(r.kind === 'out' && r.lines.join(' ').includes('receipt-001.txt'),
    'mirror copied within 2.5s, got ' + JSON.stringify(r.lines));

  // 5. Tab completes tools and file paths
  const kafka = createShell(loadSim('kafka'));
  ok(kafka.completions('kafka-').includes('kafka-topics.sh'),
    'tab completes kafka-topics.sh, got ' + kafka.completions('kafka-').join(','));
  ok(kafka.completions('kafka-console-p').includes('kafka-console-producer.sh'),
    'tab completes kafka-console-producer.sh');
  ok(kafka.completions('/home/learner/docker-').includes('/home/learner/docker-compose.yml'),
    'tab completes a file path, got ' + kafka.completions('/home/learner/docker-').join(','));
  ok(kafka.completions('ps').includes('psql'), 'tab completes psql');
  ok(kafka.completions('redis-').includes('redis-cli'), 'tab completes redis-cli');

  // 5b. Advanced challenges (levels fix, 2026-11-22): each challenge
  // command works in free play, in the same order the guided steps use
  // Kafka: break the mirror port, send an order, fix it, watch lag hit 0
  const k2 = createShell(loadSim('kafka'));
  k2.run('docker compose up -d');
  k2.run('docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 1 --replication-factor 1');
  k2.run('docker exec -it kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders');
  k2.run('order-101, notebook, 250');
  k2.run('^C');
  r = k2.run("sed -i 's/b.bootstrap.servers=kafka-b:9092/b.bootstrap.servers=kafka-b:9093/' mm2.properties");
  ok(r.kind === 'out' && r.lines.length === 0, 'kafka sed break is silent, got ' + JSON.stringify(r.lines));
  k2.run('docker exec -it kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders');
  k2.run('order-105, scissors, 90');
  k2.run('^C');
  r = k2.run('tail -n 20 mirrormaker.log');
  ok(r.lines.join(' ').includes('connection refused (kafka-b:9093)'),
    'kafka log shows the refused connection, got ' + JSON.stringify(r.lines));
  r = k2.run('kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group order-group');
  ok(r.lines.join(' ').includes('LAG') && /1$/.test(r.lines[1].trim()),
    'kafka lag is 1 while the mirror is broken, got ' + JSON.stringify(r.lines));
  k2.run("sed -i 's/b.bootstrap.servers=kafka-b:9093/b.bootstrap.servers=kafka-b:9092/' mm2.properties");
  r = k2.run('docker compose restart mm2');
  ok(r.lines.join(' ').includes('Container mm2  Restarted'),
    'kafka mirror restarts with docker compose restart, got ' + JSON.stringify(r.lines));
  r = k2.run('docker exec kafka-b /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic a.orders --from-beginning');
  ok(r.lines.join(' ').includes('order-105, scissors, 90'),
    'restarted mirror copied the order that arrived while broken, got ' + JSON.stringify(r.lines));
  r = k2.run('kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group order-group');
  ok(/0$/.test(r.lines[1].trim()),
    'kafka lag is 0 after the fix, got ' + JSON.stringify(r.lines));
  // the old script path still answers in free play (no such file sits
  // in the kit folder, but the terminal knows the command)
  r = k2.run('./bin/connect-mirror-maker.sh mm2.properties &');
  ok(r.lines.join(' ').includes('MirrorMaker 2 started'),
    'kafka mirror script still answers in free play, got ' + JSON.stringify(r.lines));
  // restart with no service restarts every running container
  r = k2.run('docker compose restart');
  ok(r.lines.length === 3 && r.lines.every(l => l.includes('Restarted')),
    'restart with no service restarts all 3 containers, got ' + JSON.stringify(r.lines));
  // PostgreSQL: stale lock blocks pg_ctl until the lock file is removed
  const pg2 = createShell(loadSim('postgresql'));
  r = pg2.run('pg_ctl start -D /var/lib/postgresql/data');
  ok(r.kind === 'err' && r.lines.join(' ').includes('could not start server'),
    'pg_ctl fails on the stale lock, got ' + JSON.stringify(r.lines));
  r = pg2.run('ls -l /var/lib/postgresql/data/postmaster.pid');
  ok(r.lines[0].includes('postmaster.pid'), 'ls -l shows the lock file, got ' + JSON.stringify(r.lines));
  pg2.run('rm /var/lib/postgresql/data/postmaster.pid');
  r = pg2.run('pg_ctl start -D /var/lib/postgresql/data');
  ok(r.kind === 'out' && r.lines.join(' ').includes('server started'),
    'pg_ctl starts after the lock is removed, got ' + JSON.stringify(r.lines));
  r = pg2.run('psql -U postgres -c "\\l"');
  ok(r.lines.join(' ').includes('practice'),
    'bare psql lists the databases, got ' + JSON.stringify(r.lines));
  // Redis: the tiny cap refuses a new write until policy + cap are set
  const rd = createShell(loadSim('redis'));
  rd.run('docker compose up -d');
  rd.run('docker exec redis-a redis-cli SET user:101 Asha');
  rd.run('docker exec redis-a redis-cli SETEX login-code:101 60 482913');
  rd.run('docker exec redis-a redis-cli SET orders:count 0');
  rd.run('docker exec redis-a redis-cli INCR orders:count');
  r = rd.run('docker exec redis-a redis-cli SET test_key 1');
  ok(r.kind === 'err' && r.lines.join(' ').includes('OOM'),
    'redis refuses the write when full, got ' + JSON.stringify(r.lines));
  r = rd.run('docker exec redis-a redis-cli INFO memory');
  ok(r.lines.join(' ').includes('used_memory:189') && r.lines.join(' ').includes('maxmemory:200'),
    'redis INFO memory shows 189 of 200, got ' + JSON.stringify(r.lines));
  rd.run('docker exec redis-a redis-cli CONFIG SET maxmemory-policy allkeys-lru');
  rd.run('docker exec redis-a redis-cli CONFIG SET maxmemory 50mb');
  r = rd.run('docker exec redis-a redis-cli SET test_key 1');
  ok(r.kind === 'out' && r.lines[0] === 'OK', 'redis writes again after the fix, got ' + JSON.stringify(r.lines));
  // Object store: a stopped mirror copies nothing; start it and it catches up
  const ob = createShell(loadSim('object-store'));
  ob.run('docker compose up -d --build');
  ob.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming');
  ob.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://incoming/');
  ob.advanceTime(2500);
  ob.run('docker compose stop mirror');
  ob.run('docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-003.txt s3://incoming/');
  r = ob.run('docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/ | wc -l');
  ok(r.lines[0] === '1', 'mirror stopped: only 1 file on moto-b, got ' + JSON.stringify(r.lines));
  ob.run('docker compose start mirror');
  r = ob.run('docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/ | wc -l');
  ok(r.lines[0] === '2', 'mirror started: 2 files on moto-b, got ' + JSON.stringify(r.lines));
  // Load balancer: editing nginx.conf changes nothing until a reload —
  // the guard answers from the config it loaded. A bad port gives 502
  // only after the reload; fix it, reload again, and it is 200.
  const lb2 = createShell(loadSim('load-balancer'));
  lb2.run('docker compose up -d');
  lb2.run("docker compose exec lb sed -i 's/:80/:8085/g' /etc/nginx/nginx.conf");
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('200 OK'), 'config edited but not reloaded: still 200, got ' + JSON.stringify(r.lines));
  lb2.run('docker compose exec lb nginx -s reload');
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('502'), 'broken config gives 502 after reload, got ' + JSON.stringify(r.lines));
  r = lb2.run('docker compose exec lb nginx -t');
  ok(r.lines.join(' ').includes('syntax is ok'),
    'nginx -t passes even with wrong ports (syntax only), got ' + JSON.stringify(r.lines));
  lb2.run("docker compose exec lb sed -i 's/:8085/:80/g' /etc/nginx/nginx.conf");
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('502'), 'fixed config not yet reloaded: still 502, got ' + JSON.stringify(r.lines));
  lb2.run('docker compose exec lb nginx -s reload');
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('200 OK'), 'fixed config gives 200 after reload, got ' + JSON.stringify(r.lines));
  // docker compose restart lb also re-reads the config
  lb2.run("docker compose exec lb sed -i 's/:80/:8085/g' /etc/nginx/nginx.conf");
  lb2.run('docker compose exec lb nginx -s reload');
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('502'), 'broken again: 502, got ' + JSON.stringify(r.lines));
  lb2.run("docker compose exec lb sed -i 's/:8085/:80/g' /etc/nginx/nginx.conf");
  r = lb2.run('docker compose restart lb');
  ok(r.lines.join(' ').includes('Restarted'), 'restart lb answers, got ' + JSON.stringify(r.lines));
  r = lb2.run('curl -I http://localhost:8080/');
  ok(r.lines[0].includes('200 OK'), 'restart re-reads the fixed config: 200, got ' + JSON.stringify(r.lines));
  // Docker: a bound port conflicts, netstat shows it, a free port works
  const zc = createShell(loadSim('p2-zero-cost'));
  zc.run('docker run -d -p 8080:80 --name my-site nginx');
  zc.run('docker stop my-site');
  zc.run('docker run -d -p 8080:80 --name web-app nginx');
  r = zc.run('docker run -d -p 8080:80 --name web-app-2 nginx');
  ok(r.kind === 'err' && r.lines.join(' ').includes('port is already allocated'),
    'second container on 8080 fails, got ' + JSON.stringify(r.lines));
  r = zc.run('netstat -tuln');
  ok(r.lines.join(' ').includes('0.0.0.0:8080'), 'netstat shows 8080 listening, got ' + JSON.stringify(r.lines));
  zc.run('docker rm -f web-app');
  zc.run('docker run -d -p 8081:80 --name web-app nginx');
  r = zc.run('curl http://localhost:8081');
  ok(r.lines[0] === 'Welcome to nginx!', 'site answers on 8081, got ' + JSON.stringify(r.lines));
  // Linux/Git: permission, then syntax, then fix, then push, then pass
  zc.run('mkdir -p devops-practice');
  zc.run('cd devops-practice');
  zc.run("cat > deploy.sh << 'EOF'");
  zc.run('#!/bin/bash');
  zc.run('echo "Starting deploy..."');
  zc.run('echo "Deploying to production');
  zc.run('echo "Build Passed: Deployed Successfully"');
  zc.run('EOF');
  r = zc.run('./deploy.sh');
  ok(r.kind === 'err' && r.lines.join(' ').includes('Permission denied'),
    'script without +x is denied, got ' + JSON.stringify(r.lines));
  zc.run('chmod +x deploy.sh');
  r = zc.run('bash -n deploy.sh');
  ok(r.kind === 'err' && r.lines.join(' ').includes('unexpected EOF'),
    'bash -n finds the missing quote, got ' + JSON.stringify(r.lines));
  r = zc.run('nano deploy.sh');
  ok(r.lines.join('\n').includes('echo "Deploying to production"'),
    'nano shows the fixed line, got ' + JSON.stringify(r.lines));
  r = zc.run('bash -n deploy.sh');
  ok(r.kind === 'out' && r.lines.length === 0, 'bash -n passes after the fix, got ' + JSON.stringify(r.lines));
  r = zc.run('git commit -am "fix deploy script" && git push origin main');
  ok(r.lines.join(' ').includes('[main e4f5a6b] fix deploy script') && r.lines.join(' ').includes('a1b2c3d..e4f5a6b'),
    'commit -am and push work, got ' + JSON.stringify(r.lines));
  r = zc.run('./deploy.sh');
  ok(r.lines.join(' ').includes('Build Passed: Deployed Successfully'),
    'deploy passes after the fix, got ' + JSON.stringify(r.lines));
  // Linux/Git Intermediate: a check script, run by itself on every push
  zc.run("cat > check.sh << 'EOF'");
  zc.run('#!/bin/bash');
  zc.run('bash -n deploy.sh');
  zc.run('echo "Check: PASS"');
  zc.run('EOF');
  zc.run('chmod +x check.sh');
  r = zc.run('./check.sh');
  ok(r.kind === 'out' && r.lines.join(' ').includes('Check: PASS'),
    'check script passes, got ' + JSON.stringify(r.lines));
  zc.run("cat > .git/hooks/pre-push << 'EOF'");
  zc.run('#!/bin/bash');
  zc.run('./check.sh');
  zc.run('EOF');
  r = zc.run('git add check.sh && git commit -m "add the check script"');
  ok(r.lines.join(' ').includes('[main c7d8e9f] add the check script'),
    'check script commits as c7d8e9f, got ' + JSON.stringify(r.lines));
  r = zc.run('git push origin main');
  ok(r.lines.join(' ').includes('Check: PASS') && r.lines.join(' ').includes('a1b2c3d..c7d8e9f'),
    'push runs the check first, got ' + JSON.stringify(r.lines));
  r = zc.run('git status');
  ok(r.lines.join(' ').includes('nothing to commit'),
    'tree clean after the push, got ' + JSON.stringify(r.lines));
  // and a broken script stops the push
  zc.run("cat > deploy.sh << 'EOF'");
  zc.run('#!/bin/bash');
  zc.run('echo "Deploying to production');
  zc.run('EOF');
  r = zc.run('git push origin main');
  ok(r.kind === 'err' && r.lines.join(' ').includes('failed to push some refs'),
    'broken script blocks the push, got ' + JSON.stringify(r.lines));
  // Kubernetes: a wrong database host crashes the pod; edit fixes it
  const k8 = createShell(loadSim('p2-kubernetes'));
  k8.run('kind create cluster --name devops-practice');
  k8.run("cat > web-app.yaml << 'EOF'");
  k8.run('apiVersion: apps/v1');
  k8.run('kind: Deployment');
  k8.run('metadata:');
  k8.run('  name: web-app');
  k8.run('spec:');
  k8.run('  template:');
  k8.run('    spec:');
  k8.run('      containers:');
  k8.run('        - name: web');
  k8.run('          image: my-site:1.0');
  k8.run('          env:');
  k8.run('            - name: DB_HOST');
  k8.run('              value: db-wrong-host');
  k8.run('EOF');
  k8.run('kubectl apply -f web-app.yaml');
  r = k8.run('kubectl get pods');
  ok(r.lines.join(' ').includes('CrashLoopBackOff'),
    'wrong DB host crashes the pod, got ' + JSON.stringify(r.lines));
  r = k8.run('kubectl logs deployment/web-app');
  ok(r.lines.join(' ').includes('db-wrong-host'),
    'logs name the wrong host, got ' + JSON.stringify(r.lines));
  r = k8.run('kubectl edit deployment web-app');
  ok(r.lines[0] === 'deployment.apps/web-app edited', 'edit saves, got ' + JSON.stringify(r.lines));
  r = k8.run('kubectl get pods -w');
  ok(r.lines.join(' ').includes('web-app-abc12') && r.lines.join(' ').includes('Running') && !r.lines.join(' ').includes('CrashLoopBackOff'),
    'pod is Running after the edit, got ' + JSON.stringify(r.lines));
  // Kubernetes Intermediate: scale to 3 copies, swap the version, no downtime
  const k8s = createShell(loadSim('p2-kubernetes'));
  k8s.run('kind create cluster --name devops-practice');
  k8s.run("cat > deployment.yaml << 'EOF'");
  k8s.run('apiVersion: apps/v1');
  k8s.run('kind: Deployment');
  k8s.run('metadata:');
  k8s.run('  name: my-site');
  k8s.run('spec:');
  k8s.run('  replicas: 1');
  k8s.run('  template:');
  k8s.run('    spec:');
  k8s.run('      containers:');
  k8s.run('        - name: web');
  k8s.run('          image: my-site:1.0');
  k8s.run('EOF');
  k8s.run('kubectl apply -f deployment.yaml');
  r = k8s.run('kubectl scale deployment my-site --replicas=3');
  ok(r.lines[0] === 'deployment.apps/my-site scaled', 'scale answers, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl get pods');
  ok((r.lines.join(' ').match(/my-site-/g) || []).length === 3,
    'three copies after scale, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl set image deployment/my-site web=my-site:2.0');
  ok(r.lines[0] === 'deployment.apps/my-site image updated', 'set image answers, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl rollout status deployment/my-site');
  ok(r.lines[0] === 'deployment "my-site" successfully rolled out',
    'rollout finishes, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl get deployments');
  ok(r.lines.join(' ').includes('my-site') && r.lines.join(' ').includes('3/3'),
    'get deployments shows 3/3, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl describe deployment my-site');
  ok(r.lines.join(' ').includes('my-site:2.0') && r.lines.join(' ').includes('3 desired'),
    'describe shows version 2.0 and 3 replicas, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl scale deployment my-site --replicas=1');
  ok(r.lines[0] === 'deployment.apps/my-site scaled', 'scale back answers, got ' + JSON.stringify(r.lines));
  r = k8s.run('kubectl get pods');
  ok((r.lines.join(' ').match(/my-site-/g) || []).length === 1,
    'one copy after scaling back, got ' + JSON.stringify(r.lines));
  // Career: the project log and the resume check
  const rs = createShell(loadSim('p2-resume'));
  r = rs.run('cat project_summary.log');
  ok(r.lines.join(' ').includes('Patroni failover'),
    'project log lists the failover, got ' + JSON.stringify(r.lines));
  r = rs.run('python3 check_resume.py');
  ok(r.lines[0].includes('PASSED: 3/3'), 'resume check passes, got ' + JSON.stringify(r.lines));
  // End-to-end: a stopped worker leaves the order stuck; start it and it catches up
  const e2 = createShell(loadSim('end-to-end'));
  e2.run('docker compose up -d --build');
  e2.run('docker compose run --no-deps --rm -e PG_HOST=postgres-replica worker');
  e2.run('docker compose stop worker');
  e2.run("cat > incoming/order-006.json << 'EOF'");
  e2.run('{"id": 106, "item": "scissors", "amount": 90, "buyer": "Anita"}');
  e2.run('EOF');
  r = e2.run('docker compose exec postgres-replica psql -U learner -d practice -c "SELECT * FROM orders ORDER BY id;"');
  ok(r.lines.join(' ').includes('(3 rows)'), 'order stuck: still 3 rows, got ' + JSON.stringify(r.lines));
  r = e2.run('docker inspect worker');
  ok(r.lines.join(' ').includes('PG_HOST=postgres-replica'),
    'inspect shows the right database, got ' + JSON.stringify(r.lines));
  e2.run('docker compose start worker');
  r = e2.run('docker compose logs worker');
  ok(r.lines.join(' ').includes('Saved order 106: scissors (90)'),
    'worker caught up and saved order 106, got ' + JSON.stringify(r.lines));
  r = e2.run('docker compose exec postgres-replica psql -U learner -d practice -c "SELECT * FROM orders ORDER BY id;"');
  ok(r.lines.join(' ').includes('(4 rows)'), '4 rows after the catch-up, got ' + JSON.stringify(r.lines));

  // 6. consumer prints messages only, no ^C of its own
  const kc = createShell(loadSim('kafka'));
  kc.run('docker compose up -d');
  kc.run('docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic t1 --partitions 1 --replication-factor 1');
  kc.run('docker exec kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic t1');
  kc.run('hello world');
  kc.run('^C');
  r = kc.run('docker exec kafka-a /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic t1 --from-beginning');
  ok(r.lines.includes('hello world') && !r.lines.includes('^C'),
    'consumer shows messages without a printed ^C, got ' + JSON.stringify(r.lines));

  // 7. for-loop substitutes $i and ${i}, and does not repeat the body in history
  const lb = createShell(loadSim('load-balancer'));
  lb.run('docker compose up -d');
  r = lb.run('for i in 1 2 3; do echo item-$i; done');
  ok(r.lines.join(',') === 'item-1,item-2,item-3',
    'for loop substitutes $i, got ' + JSON.stringify(r.lines));
  r = lb.run('for j in a b; do echo ${j}; done');
  ok(r.lines.join(',') === 'a,b', 'for loop substitutes ${j}, got ' + JSON.stringify(r.lines));
  const hist = lb.getHistory();
  ok(hist.filter(h => h.indexOf('echo item-') === 0).length === 0,
    'loop body not pushed into history each iteration');
  ok(hist.filter(h => h.indexOf('for i in') === 0).length === 1,
    'the for-loop line itself is in history once');
  r = lb.run('for i in 1 2; do curl -s http://localhost:8080/ | grep Hostname; done');
  ok(r.lines.length === 2, 'for loop without $var still runs the body per item');

  // 8. CREATE TABLE with NUMERIC(10,2) keeps 3 columns
  const pg = createShell(loadSim('postgresql'));
  pg.run('docker compose up -d');
  r = pg.run('docker exec pg-primary psql -U learner -d practice -c "CREATE TABLE prices (id INT, item TEXT, price NUMERIC(10,2));"');
  ok(r.kind === 'out', 'CREATE TABLE with NUMERIC(10,2) runs');
  const cols = pg.getWorld().pg.tables['prices'].cols;
  ok(cols.length === 3 && cols[2] === 'price',
    'NUMERIC(10,2) stays one column, got ' + JSON.stringify(cols));
  pg.run('docker exec pg-primary psql -U learner -d practice -c "INSERT INTO prices VALUES (1, \'pen\', 12.50);"');
  r = pg.run('docker exec pg-primary psql -U learner -d practice -c "SELECT * FROM prices;"');
  ok(r.lines.join(' ').includes('pen') && r.lines.join(' ').includes('12.5'),
    'SELECT prints the NUMERIC row, got ' + JSON.stringify(r.lines));

  // 9. probe commands people type first, and honest free-play wording
  const probe = createShell(loadSim('kafka'));
  r = probe.run('python --version');
  ok(r.kind === 'out' && r.lines[0] === 'Python 3.12.3',
    'python --version answers Python 3.12.3, got ' + JSON.stringify(r.lines));
  r = probe.run('python3 --version');
  ok(r.lines[0] === 'Python 3.12.3', 'python3 --version answers, got ' + JSON.stringify(r.lines));
  r = probe.run('ip addr');
  ok(r.kind === 'out' && r.lines.join(' ').includes('127.0.0.1') && r.lines.join(' ').includes('eth0'),
    'ip addr shows loopback and eth0, got ' + JSON.stringify(r.lines));
  r = probe.run('uname');
  ok(r.lines[0] === 'Linux', 'uname answers Linux, got ' + JSON.stringify(r.lines));
  r = probe.run('uname -a');
  ok(r.lines[0] === 'Linux devops-kit 6.8.0-generic x86_64 GNU/Linux',
    'uname -a answers the full string, got ' + JSON.stringify(r.lines));
  r = probe.run('ipconfig');
  ok(r.kind === 'out' && /Windows command/.test(r.lines[0]) && /ip addr/.test(r.lines[0]),
    'ipconfig hints at ip addr instead of command not found, got ' + JSON.stringify(r.lines));
  r = probe.run('Ipconfig');
  ok(r.kind === 'out' && /Windows command/.test(r.lines[0]),
    'Ipconfig (capital I) also hints, got ' + JSON.stringify(r.lines));
  r = probe.run('Hello world');
  ok(r.kind === 'err' && /command not found/.test(r.lines[0]),
    'Hello world still says command not found, got ' + JSON.stringify(r.lines));
  r = probe.run('help');
  ok(r.lines.join(' ').includes('python --version'),
    'help lists the quick checks, got ' + JSON.stringify(r.lines));
  ok(probe.completions('py').includes('python') && probe.completions('py').includes('python3'),
    'tab completes python/python3, got ' + probe.completions('py').join(','));
  ok(probe.completions('un').includes('uname'), 'tab completes uname');
  ok(probe.completions('ip').includes('ip') && probe.completions('ip').includes('ipconfig'),
    'tab completes ip/ipconfig, got ' + probe.completions('ip').join(','));
  // wording: no "any command" promise left anywhere
  const engineSrc = fs.readFileSync(path.join(SITE, 'engine', 'sim.js'), 'utf8');
  ok(!engineSrc.includes('any command'),
    'engine no longer promises "any command"');
  ok(engineSrc.includes('try the lab commands, or type help to see them'),
    'engine free-play lines use the honest wording');
  const kafkaHtml = fs.readFileSync(path.join(SITE, 'sims', 'kafka.html'), 'utf8');
  ok(kafkaHtml.includes('It knows the lab commands'),
    'kafka sim banner uses the honest wording');
  ok(!kafkaHtml.includes('Run any command'),
    'kafka sim banner no longer says "Run any command"');

  // 4. showDoc: documented output shows for a non-live guided step
  domShowDoc();
}

// Drive the browser DOM binding with a minimal stub: type the guided
// step-1 command of the end-to-end sim (a non-live step whose engine
// output is silent) and check the documented output is what appears.
function domShowDoc() {
  const data = loadSim('end-to-end');
  const printed = [];
  function makeEl(id) {
    const el = {
      id: id || '',
      style: {},
      classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      children: [],
      _text: '', _html: '', value: '',
      disabled: false,
      scrollTop: 0, scrollHeight: 0,
      handlers: {},
      addEventListener: function (type, fn) { this.handlers[type] = fn; },
      focus: function () {},
      appendChild: function (child) {
        this.children.push(child);
        if (child._text) printed.push(child._text);
        else if (child._html) printed.push(child._html);
      },
    };
    Object.defineProperty(el, 'textContent', {
      get: function () { return this._text; },
      set: function (v) { this._text = v; },
    });
    Object.defineProperty(el, 'innerHTML', {
      get: function () { return this._html; },
      set: function (v) { this._html = v; if (v === '') this.children = []; },
    });
    return el;
  }
  const els = {};
  ['term-out', 'term-input', 'term-prompt', 'step-card', 'step-text', 'step-count',
   'free-banner', 'btn-ctrlc', 'btn-clear', 'btn-skip', 'btn-skip-all', 'term'].forEach(function (id) { els[id] = makeEl(id); });
  global.SIMSHELL = require('../engine/sim.js');
  global.window = { SIM_DATA: data };
  global.document = {
    getElementById: function (id) { return els[id]; },
    createElement: function () { return makeEl(''); },
    querySelectorAll: function () { return []; },
  };
  delete require.cache[require.resolve('../engine/sim.js')];
  require('../engine/sim.js');
  printed.length = 0; // drop the welcome lines the binding prints at load
  const input = els['term-input'];
  input.value = 'chmod -R a+r .';
  input.handlers.keydown({ key: 'Enter', preventDefault: function () {} });
  ok(printed.some(function (l) { return l.indexOf('(no output') >= 0; }),
    'showDoc prints the documented output for a non-live step, got ' + JSON.stringify(printed));
  ok(els['step-count'].textContent.indexOf('Step 2 of 28') >= 0,
    'step advanced to 2 after the documented command, got ' + els['step-count'].textContent);
  delete global.window;
  delete global.document;
  delete global.SIMSHELL;
}
