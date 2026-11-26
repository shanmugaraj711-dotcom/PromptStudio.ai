// test_engine_extensions.js — tests for the engine commands added for the
// 12 new lesson sims: version flags, git, kubectl, kind, terraform,
// file utils, top-level docker run/stop/start/rm, script execution,
// ps/top, and curl canned responses.
// Usage: node tests/test_engine_extensions.js
// Exits non-zero on any failure. Does not touch test_sims.js.
'use strict';
// The shipped engine sets window.__didYouMean at load (PR #120 typo
// hints). Under Node there is no window, so provide one before the
// require. The shipped file (assets/sim.js) is untouched.
if (typeof window === 'undefined') global.window = {};
const { createShell, normalizeCmd } = require('../engine/sim.js');

let failures = 0;
let passes = 0;

function ok(cond, label) {
  if (cond) { passes++; }
  else { failures++; console.log('  FAIL: ' + label); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + ' (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')');
}
function sameLines(actual, expected, label) {
  ok(Array.isArray(actual) && actual.length === expected.length && actual.every(function (l, i) { return l === expected[i]; }),
    label + '\n    engine: ' + JSON.stringify(actual) + '\n    want:   ' + JSON.stringify(expected));
}
function run(shell, cmd) { return shell.run(cmd); }

function makeShell() {
  const world = {
    containers: {},
    fs: { '/home/learner': ['kit-doctor.sh', 'deployment.yaml', 'app.py', 'plain.sh'] },
    file_contents: {
      '/home/learner/kit-doctor.sh': '#!/bin/bash\necho ok\n',
      '/home/learner/plain.sh': 'echo hi\n',
      '/home/learner/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n      - name: web\n        image: nginx:1.25\n',
      '/home/learner/app.py': 'print("hi")\n'
    },
    scripts: { 'kit-doctor.sh': ['Checking Docker... OK', 'Checking disk... OK', 'All checks passed.'] },
    curl_map: { 'example.com/health': ['{"status":"ok"}'] },
    images: ['nginx', 'ubuntu', 'postgres'],
    git_conflict: { file: 'app.py', branch: 'feature' },
    k8s: {
      deployments: [{ name: 'api', image: 'node:20' }],
      services: [{ name: 'api', type: 'ClusterIP', clusterIP: '10.96.0.10', ports: '3000/TCP' }]
    }
  };
  return createShell({ world: world });
}

// ---------- 1. version flags ----------
(function versions() {
  console.log('== version flags ==');
  const s = makeShell();
  let r;
  r = run(s, 'docker --version');
  sameLines(r.lines, ['Docker version 26.1.3, build 26.1.3-0ubuntu1'], 'docker --version');
  r = run(s, 'docker version');
  sameLines(r.lines, ['Docker version 26.1.3, build 26.1.3-0ubuntu1'], 'docker version');
  r = run(s, 'docker compose version');
  sameLines(r.lines, ['Docker Compose version v2.27.0'], 'docker compose version');
  r = run(s, 'kubectl version --client');
  sameLines(r.lines, ['Client Version: v1.30.0'], 'kubectl version --client');
  r = run(s, 'kind --version');
  sameLines(r.lines, ['kind v0.23.0 go1.22.2 linux/amd64'], 'kind --version');
  r = run(s, 'terraform --version');
  sameLines(r.lines, ['Terraform v1.8.0'], 'terraform --version');
  r = run(s, 'git --version');
  sameLines(r.lines, ['git version 2.43.0'], 'git --version');
  r = run(s, 'docker --help');
  ok(r.kind === 'out' && r.lines.some(function (l) { return l.trim().indexOf('run') === 0; }) && r.lines.some(function (l) { return l.indexOf('compose') >= 0; }),
    'docker --help lists run and compose');
  r = run(s, 'docker frobnicate');
  ok(r.kind === 'err' && /not a docker command/.test(r.lines[0]), 'docker bad subcommand still errors');
})();

// ---------- 2. git ----------
(function git() {
  console.log('== git ==');
  const s = makeShell();
  let r;
  r = run(s, 'git status');
  ok(r.kind === 'err' && /not a git repository/.test(r.lines[0]), 'git status before init errors');
  r = run(s, 'git init');
  sameLines(r.lines, ['Initialized empty Git repository in /home/learner/.git/'], 'git init');
  r = run(s, 'git init');
  sameLines(r.lines, ['Reinitialized existing Git repository in /home/learner/.git/'], 'git init again');
  r = run(s, 'git status');
  // New engine (PR #120): existing files are untracked after init, like real git.
  sameLines(r.lines, ['On branch main', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '        kit-doctor.sh', '        deployment.yaml', '        app.py', '        plain.sh', 'nothing added to commit but untracked files present (use "git add" to track)'], 'git status clean');
  r = run(s, 'git add nope.py');
  ok(r.kind === 'err' && /did not match/.test(r.lines[0]), 'git add missing file errors');
  r = run(s, 'git add app.py');
  eq(r.lines.length, 0, 'git add is silent');
  r = run(s, 'git status');
  sameLines(r.lines, ['On branch main', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)', '        new file:   app.py', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '        kit-doctor.sh', '        deployment.yaml', '        plain.sh'], 'git status staged');
  r = run(s, 'git commit -m "Add app"');
  sameLines(r.lines, ['[main a1b2c3d] Add app', ' 1 file changed, 1 insertion(+)'], 'git commit');
  r = run(s, 'git log --oneline');
  sameLines(r.lines, ['a1b2c3d Add app'], 'git log --oneline');
  r = run(s, 'git commit -m "Nothing"');
  sameLines(r.lines, ['On branch main', 'nothing to commit, working tree clean'], 'git commit with nothing staged');
  r = run(s, 'git branch');
  sameLines(r.lines, ['* main'], 'git branch lists main');
  r = run(s, 'git checkout -b feature');
  sameLines(r.lines, ["Switched to a new branch 'feature'"], 'git checkout -b feature');
  r = run(s, 'git checkout main');
  sameLines(r.lines, ["Switched to branch 'main'"], 'git checkout main');
  r = run(s, 'git checkout nope');
  ok(r.kind === 'err' && /did not match/.test(r.lines[0]), 'git checkout missing branch errors');
  r = run(s, 'git merge nope');
  ok(r.kind === 'err' && /not something we can merge/.test(r.lines[0]), 'git merge missing branch errors');
  r = run(s, 'git merge feature');
  sameLines(r.lines, ['Auto-merging app.py', 'CONFLICT (content): Merge conflict in app.py', 'Automatic merge failed; fix conflicts and then commit the result.'], 'git merge conflict');
  ok(s.evalCond({ git_conflict: true }), 'evalCond git_conflict true after merge');
  r = run(s, 'git status');
  sameLines(r.lines, ['On branch main', 'You have unmerged paths.', '  (fix conflicts and run "git commit")', 'Unmerged paths:', '        both modified:   app.py'], 'git status in conflict');
  r = run(s, 'git commit -m "Resolve"');
  ok(r.kind === 'err' && /unmerged files/.test(r.lines[0]), 'git commit blocked while conflicted');
  r = run(s, 'git add app.py');
  eq(r.lines.length, 0, 'git add the conflicted file is silent');
  r = run(s, 'git commit -m "Resolve conflict"');
  sameLines(r.lines, ['[main e4f5a6b] Resolve conflict', ' 1 file changed, 1 insertion(+)'], 'git commit after resolving');
  ok(s.evalCond({ git_conflict: false }), 'evalCond git_conflict false after resolve');
  ok(s.evalCond({ git_commits: { min: 2 } }), 'evalCond git_commits min 2');
  ok(s.evalCond({ git_branch: 'main' }), 'evalCond git_branch main');
  r = run(s, 'git log --oneline');
  sameLines(r.lines, ['e4f5a6b Resolve conflict', 'a1b2c3d Add app'], 'git log newest first');
  r = run(s, 'git push');
  sameLines(r.lines, ['Enumerating objects: 3, done.', 'To https://github.com/learner/app.git', '   a1b2c3d..e4f5a6b  main -> main'], 'git push');
  r = run(s, 'git pull');
  sameLines(r.lines, ['Already up to date.'], 'git pull');
  r = run(s, 'git config --global user.name Learner');
  eq(r.lines.length, 0, 'git config set is silent');
  r = run(s, 'git config user.name');
  sameLines(r.lines, ['Learner'], 'git config read back');
  r = run(s, 'git config --list');
  sameLines(r.lines, ['user.name=Learner', 'user.email=learner@example.com'], 'git config --list');
  r = run(s, 'git clone https://github.com/learner/app.git');
  ok(r.kind === 'out' && r.lines[0] === "Cloning into 'app'...", 'git clone prints Cloning into');
  r = run(s, 'git frobnicate');
  ok(r.kind === 'err' && /not a git command/.test(r.lines[0]), 'git bad subcommand errors');
  // merge without a conflict, on a fresh shell with no conflict spec
  const s2 = createShell({ world: { containers: {}, fs: { '/home/learner': ['app.py'] }, file_contents: { '/home/learner/app.py': 'x\n' } } });
  run(s2, 'git init');
  run(s2, 'git add app.py');
  run(s2, 'git commit -m "Add app"');
  run(s2, 'git checkout -b feature');
  run(s2, 'git checkout main');
  r = run(s2, 'git merge feature');
  // New engine (PR #120): feature has no new commits, so this is a no-op, like real git.
  sameLines(r.lines, ['Already up to date.'], 'git merge clean');
})();

// ---------- 3. kubectl ----------
(function kubectl() {
  console.log('== kubectl ==');
  const s = makeShell();
  let r;
  r = run(s, 'kubectl get pods');
  sameLines(r.lines, [
    'NAME              READY   STATUS    RESTARTS   AGE',
    'api-abc12         1/1     Running   0          5m'
  ], 'kubectl get pods (seeded)');
  r = run(s, 'kubectl get nodes');
  sameLines(r.lines, [
    'NAME                STATUS   ROLES           AGE   VERSION',
    'kind-control-plane  Ready    control-plane   10m   v1.30.0'
  ], 'kubectl get nodes');
  r = run(s, 'kubectl get deployments');
  sameLines(r.lines, [
    'NAME      READY   UP-TO-DATE   AVAILABLE   AGE',
    'api       1/1     1            1           5m'
  ], 'kubectl get deployments');
  r = run(s, 'kubectl get services');
  sameLines(r.lines, [
    'NAME        TYPE        CLUSTER-IP   EXTERNAL-IP  PORT(S)  AGE',
    'api         ClusterIP   10.96.0.10   <none>       3000/TCP 5m',
    'kubernetes  ClusterIP   10.96.0.1    <none>       443/TCP  10m'
  ], 'kubectl get services');
  r = run(s, 'kubectl apply -f deployment.yaml');
  sameLines(r.lines, ['deployment.apps/web created'], 'kubectl apply -f deployment.yaml');
  r = run(s, 'kubectl apply -f deployment.yaml');
  sameLines(r.lines, ['deployment.apps/web configured'], 'kubectl apply again says configured');
  r = run(s, 'kubectl apply -f nope.yaml');
  ok(r.kind === 'err' && /does not exist/.test(r.lines[0]), 'kubectl apply missing file errors');
  r = run(s, 'kubectl get pods');
  ok(r.lines.join(' ').includes('web-abc12') && r.lines.join(' ').includes('api-abc12'),
    'kubectl get pods shows the applied deployment pod');
  ok(s.evalCond({ k8s_pod: { name: 'web-abc12', status: 'Running' } }), 'evalCond k8s_pod web Running');
  ok(s.evalCond({ k8s_deployment: { name: 'web' } }), 'evalCond k8s_deployment web');
  ok(s.evalCond({ k8s_service: { name: 'api' } }), 'evalCond k8s_service api');
  r = run(s, 'kubectl describe pod web-abc12');
  sameLines(r.lines, [
    'Name:             web-abc12',
    'Namespace:        default',
    'Status:           Running',
    'IP:               10.244.0.5',
    'Containers:',
    '  web:',
    '    Image:          nginx:1.25',
    '    Port:           80/TCP',
    '    State:          Running'
  ], 'kubectl describe pod');
  r = run(s, 'kubectl describe pod nope-abc12');
  ok(r.kind === 'err' && /NotFound/.test(r.lines[0]), 'kubectl describe missing pod errors');
  r = run(s, 'kubectl logs web-abc12');
  sameLines(r.lines, ['Starting web server on port 80', 'Listening on 0.0.0.0:80'], 'kubectl logs');
  r = run(s, 'kubectl logs web-abc12 --previous');
  sameLines(r.lines, ['(no previous log — this container has not restarted)'], 'kubectl logs --previous');
  r = run(s, 'kubectl logs nope-abc12');
  ok(r.kind === 'err' && /NotFound/.test(r.lines[0]), 'kubectl logs missing pod errors');
  r = run(s, 'kubectl port-forward service/api 8080:3000');
  sameLines(r.lines, ['Forwarding from 127.0.0.1:8080 -> 3000', 'Forwarding from [::1]:8080 -> 3000'], 'kubectl port-forward service');
  r = run(s, 'kubectl port-forward service/nope 8080:80');
  ok(r.kind === 'err' && /NotFound/.test(r.lines[0]), 'kubectl port-forward missing service errors');
  r = run(s, 'kubectl rollout status deployment/api');
  sameLines(r.lines, ['deployment "api" successfully rolled out'], 'kubectl rollout status');
  r = run(s, 'kubectl rollout status deployment/nope');
  ok(r.kind === 'err' && /NotFound/.test(r.lines[0]), 'kubectl rollout status missing deployment errors');
  r = run(s, 'kubectl delete pod web-abc12');
  sameLines(r.lines, ['pod "web-abc12" deleted'], 'kubectl delete pod');
  r = run(s, 'kubectl get pods');
  ok(r.lines.join(' ').includes('web-abc12'), 'kubectl self-healing: pod is back on next get pods');
  r = run(s, 'kubectl delete pod nope-abc12');
  ok(r.kind === 'err' && /NotFound/.test(r.lines[0]), 'kubectl delete missing pod errors');
  r = run(s, 'kubectl delete deployment web');
  sameLines(r.lines, ['deployment.apps "web" deleted'], 'kubectl delete deployment');
  r = run(s, 'kubectl get pods');
  ok(!r.lines.join(' ').includes('web-abc12'), 'deleted deployment pod stays gone');
  r = run(s, 'kubectl frobnicate');
  ok(r.kind === 'err' && /unknown command/.test(r.lines[0]), 'kubectl bad subcommand errors');
  // empty cluster: no resources found
  const s2 = createShell({ world: { containers: {}, fs: { '/home/learner': [] }, file_contents: {} } });
  r = run(s2, 'kubectl get pods');
  sameLines(r.lines, ['No resources found in default namespace.'], 'kubectl get pods with nothing there');
  r = run(s2, 'kubectl get deployments');
  sameLines(r.lines, ['No resources found in default namespace.'], 'kubectl get deployments with nothing there');
})();

// ---------- 4. kind ----------
(function kind() {
  console.log('== kind ==');
  const s = makeShell();
  let r;
  r = run(s, 'kind get clusters');
  sameLines(r.lines, ['No kind clusters found.'], 'kind get clusters empty');
  r = run(s, 'kind load docker-image nginx --name demo');
  ok(r.kind === 'err' && /does not exist/.test(r.lines[0]), 'kind load into missing cluster errors');
  r = run(s, 'kind create cluster --name demo');
  sameLines(r.lines, [
    'Creating cluster "demo" ...',
    ' ✓ Ensuring node image (kindest/node:v1.30.0)',
    ' ✓ Preparing nodes',
    ' ✓ Writing configuration',
    ' ✓ Starting control-plane',
    ' ✓ Installing CNI',
    ' ✓ Installing StorageClass',
    'Set kubectl context to "kind-demo"',
    'You can now use your cluster with:',
    '',
    'kubectl cluster-info --all-namespaces'
  ], 'kind create cluster');
  ok(s.evalCond({ kind_cluster: { name: 'demo' } }), 'evalCond kind_cluster demo');
  r = run(s, 'kind create cluster --name demo');
  ok(r.kind === 'err' && /already exists/.test(r.lines[0]), 'kind create duplicate errors');
  r = run(s, 'kind get clusters');
  sameLines(r.lines, ['demo'], 'kind get clusters lists demo');
  r = run(s, 'kind load docker-image nginx --name demo');
  sameLines(r.lines, ['Image: "nginx" loaded into cluster "demo"'], 'kind load docker-image');
  r = run(s, 'kind delete cluster --name demo');
  sameLines(r.lines, ['Deleting cluster "demo" ...', 'Deleted cluster "demo"'], 'kind delete cluster');
  r = run(s, 'kind delete cluster --name demo');
  ok(r.kind === 'err' && /does not exist/.test(r.lines[0]), 'kind delete missing cluster errors');
  r = run(s, 'kind get clusters');
  sameLines(r.lines, ['No kind clusters found.'], 'kind get clusters empty again');
  r = run(s, 'kind frobnicate');
  ok(r.kind === 'err' && /unknown command/.test(r.lines[0]), 'kind bad subcommand errors');
})();

// ---------- 5. terraform ----------
(function terraform() {
  console.log('== terraform ==');
  const s = makeShell();
  let r;
  r = run(s, 'terraform plan');
  ok(r.kind === 'err' && /not been initialized/.test(r.lines[0]), 'terraform plan before init errors');
  r = run(s, 'terraform apply');
  ok(r.kind === 'err' && /not been initialized/.test(r.lines[0]), 'terraform apply before init errors');
  r = run(s, 'terraform init');
  sameLines(r.lines, [
    'Initializing the backend...',
    '',
    'Initializing provider plugins...',
    '- Finding latest version of hashicorp/docker...',
    '- Installing hashicorp/docker v3.0.2...',
    '- Installed hashicorp/docker v3.0.2',
    '',
    'Terraform has been successfully initialized!'
  ], 'terraform init');
  ok(s.evalCond({ tf_initialized: true }), 'evalCond tf_initialized');
  r = run(s, 'terraform plan');
  sameLines(r.lines, [
    'Terraform will perform the following actions:',
    '',
    '  # docker_container.web will be created',
    '  + resource "docker_container" "web" {',
    '      + image = "nginx:1.25"',
    '      + name  = "web"',
    '    }',
    '',
    'Plan: 2 to add, 0 to change, 0 to destroy.'
  ], 'terraform plan');
  ok(s.evalCond({ tf_planned: true }), 'evalCond tf_planned');
  r = run(s, 'terraform apply');
  sameLines(r.lines, [
    'docker_container.web: Creating...',
    'docker_container.web: Creation complete after 1s [id=abc123def456]',
    'docker_container.db: Creating...',
    'docker_container.db: Creation complete after 1s [id=def456abc123]',
    '',
    'Apply complete! Resources: 2 added, 0 changed, 0 destroyed.'
  ], 'terraform apply');
  ok(s.evalCond({ tf_applied: true }), 'evalCond tf_applied');
  r = run(s, 'terraform destroy');
  sameLines(r.lines, [
    'docker_container.web: Destroying... [id=abc123def456]',
    'docker_container.web: Destruction complete after 0s',
    'docker_container.db: Destroying... [id=def456abc123]',
    'docker_container.db: Destruction complete after 0s',
    '',
    'Destroy complete! Resources: 2 destroyed.'
  ], 'terraform destroy');
  ok(!s.evalCond({ tf_applied: true }), 'evalCond tf_applied false after destroy');
  r = run(s, 'terraform destroy');
  sameLines(r.lines, ['No changes. No objects need to be destroyed.', '', 'Destroy complete! Resources: 0 destroyed.'], 'terraform destroy with nothing applied');
  r = run(s, 'terraform frobnicate');
  ok(r.kind === 'err' && /no command named/.test(r.lines[0]), 'terraform bad subcommand errors');
})();

// ---------- 6. file utils ----------
(function fileUtils() {
  console.log('== file utils ==');
  const s = makeShell();
  let r;
  r = run(s, 'mkdir -p a/b/c');
  eq(r.lines.length, 0, 'mkdir -p is silent');
  ok(s.evalCond({ dir_exists: '/home/learner/a/b/c' }), 'evalCond dir_exists after mkdir -p');
  r = run(s, 'ls a');
  sameLines(r.lines, ['b'], 'ls shows the new dir');
  r = run(s, 'mkdir a');
  ok(r.kind === 'err' && /File exists/.test(r.lines[0]), 'mkdir existing dir errors');
  r = run(s, 'mkdir x/y');
  ok(r.kind === 'err' && /No such file or directory/.test(r.lines[0]), 'mkdir without -p and missing parent errors');
  r = run(s, 'touch new.txt');
  eq(r.lines.length, 0, 'touch is silent');
  ok(s.evalCond({ file_exists: '/home/learner/new.txt' }), 'evalCond file_exists after touch');
  r = run(s, 'cat new.txt');
  eq(r.lines.length, 0, 'cat of a touched file prints nothing');
  r = run(s, 'cp app.py app2.py');
  eq(r.lines.length, 0, 'cp is silent');
  r = run(s, 'cat app2.py');
  sameLines(r.lines, ['print("hi")'], 'cp copied the contents');
  r = run(s, 'cp nope.py app3.py');
  ok(r.kind === 'err' && /No such file or directory/.test(r.lines[0]), 'cp missing source errors');
  r = run(s, 'mv app2.py app3.py');
  eq(r.lines.length, 0, 'mv is silent');
  r = run(s, 'cat app3.py');
  sameLines(r.lines, ['print("hi")'], 'mv moved the contents');
  r = run(s, 'cat app2.py');
  ok(r.kind === 'err' && /No such file/.test(r.lines[0]), 'mv removed the source');
  r = run(s, 'rm app3.py');
  eq(r.lines.length, 0, 'rm is silent');
  r = run(s, 'cat app3.py');
  ok(r.kind === 'err', 'rm removed the file');
  r = run(s, 'rm nope.txt');
  ok(r.kind === 'err' && /No such file or directory/.test(r.lines[0]), 'rm missing file errors');
  r = run(s, 'rm -f nope.txt');
  eq(r.kind, 'out', 'rm -f missing file is silent');
  r = run(s, 'rm a');
  ok(r.kind === 'err' && /Is a directory/.test(r.lines[0]), 'rm on a dir without -r errors');
  r = run(s, 'rm -r a');
  eq(r.kind, 'out', 'rm -r removes a dir');
  ok(!s.evalCond({ dir_exists: '/home/learner/a' }), 'dir is gone after rm -r');
  r = run(s, 'df -h');
  sameLines(r.lines, [
    'Filesystem    Size   Used   Avail  Use% Mounted on',
    '/dev/sda1     20G    8.5G   11G    44%  /',
    'tmpfs         3.9G   0      3.9G   0%   /dev/shm'
  ], 'df -h');
  r = run(s, 'free -h');
  sameLines(r.lines, [
    '               total        used        free      shared  buff/cache   available',
    'Mem:           7.7Gi       1.2Gi       4.9Gi       210Mi       1.6Gi       6.2Gi',
    'Swap:          2.0Gi          0B       2.0Gi'
  ], 'free -h');
})();

// ---------- 7. top-level docker run/stop/start/rm ----------
(function dockerTop() {
  console.log('== docker run/stop/start/rm ==');
  const s = makeShell();
  let r;
  r = run(s, 'docker run -d --name web nginx');
  ok(r.kind === 'out' && r.lines.length === 1 && /^[0-9a-f]{64}$/.test(r.lines[0]),
    'docker run prints a 64-hex id, got ' + JSON.stringify(r.lines));
  r = run(s, 'docker ps');
  sameLines(r.lines, ['web  Up'], 'docker ps shows the new container');
  r = run(s, 'docker stop web');
  sameLines(r.lines, ['web'], 'docker stop prints the name');
  r = run(s, 'docker ps');
  ok(/No containers/.test(r.lines[0]), 'docker ps empty after stop');
  r = run(s, 'docker rm web');
  sameLines(r.lines, ['web'], 'docker rm a stopped container works');
  r = run(s, 'docker rm web');
  ok(r.kind === 'err' && /No such container/.test(r.lines[0]), 'docker rm missing container errors');
  r = run(s, 'docker run -d --name web nginx');
  ok(r.kind === 'out', 'docker run again works');
  r = run(s, 'docker run -d --name web nginx');
  ok(r.kind === 'err' && /already in use/.test(r.lines[0]), 'docker run duplicate name errors');
  r = run(s, 'docker rm web');
  ok(r.kind === 'err' && /cannot remove a running container/.test(r.lines[0]), 'docker rm refuses a running container');
  r = run(s, 'docker rm -f web');
  sameLines(r.lines, ['web'], 'docker rm -f removes a running container');
  r = run(s, 'docker run -d --name web nginxg');
  ok(r.kind === 'err' && r.lines[0] === "Unable to find image 'nginxg:latest' locally",
    'docker run unknown image errors, got ' + JSON.stringify(r.lines));
  r = run(s, 'docker stop nope');
  ok(r.kind === 'err' && /No such container/.test(r.lines[0]), 'docker stop missing container errors');
  r = run(s, 'docker start nope');
  ok(r.kind === 'err' && /No such container/.test(r.lines[0]), 'docker start missing container errors');
  r = run(s, 'docker run -d --name db postgres');
  ok(r.kind === 'out', 'docker run postgres works');
  r = run(s, 'docker stop db');
  sameLines(r.lines, ['db'], 'docker stop db');
  r = run(s, 'docker start db');
  sameLines(r.lines, ['db'], 'docker start db');
  r = run(s, 'docker images');
  ok(r.kind === 'out' && r.lines[0].indexOf('REPOSITORY') === 0 && r.lines.join(' ').includes('nginx'),
    'docker images lists images, got ' + JSON.stringify(r.lines));
  // default allowlist when the world spec has no images list
  const s2 = createShell({ world: { containers: {}, fs: { '/home/learner': [] }, file_contents: {} } });
  r = run(s2, 'docker run -d --name a1 alpine');
  ok(r.kind === 'out', 'default allowlist accepts alpine');
  r = run(s2, 'docker run -d --name b1 busybox');
  ok(r.kind === 'out', 'default allowlist accepts busybox');
  r = run(s2, 'docker run -d --name u1 ubuntu');
  ok(r.kind === 'out', 'default allowlist accepts ubuntu');
})();

// ---------- 8. script execution ----------
(function scripts() {
  console.log('== scripts ==');
  const s = makeShell();
  let r;
  r = run(s, 'bash kit-doctor.sh');
  sameLines(r.lines, ['Checking Docker... OK', 'Checking disk... OK', 'All checks passed.'], 'bash kit-doctor.sh prints canned output');
  r = run(s, './kit-doctor.sh');
  sameLines(r.lines, ['Checking Docker... OK', 'Checking disk... OK', 'All checks passed.'], './kit-doctor.sh prints canned output');
  r = run(s, 'bash plain.sh');
  sameLines(r.lines, ['hi'], 'bash on a file with no canned output runs its lines');
  eq(r.kind, 'out', 'bash on a file with no canned output succeeds');
  r = run(s, 'bash missing.sh');
  ok(r.kind === 'err' && r.lines[0] === 'bash: missing.sh: No such file or directory', 'bash missing file errors');
  r = run(s, './missing.sh');
  ok(r.kind === 'err' && r.lines[0] === 'bash: ./missing.sh: No such file or directory', './missing.sh errors');
})();

// ---------- 9. ps / top ----------
(function psTop() {
  console.log('== ps / top ==');
  const s = makeShell();
  let r;
  r = run(s, 'ps aux');
  sameLines(r.lines, [
    'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
    'learner        1  0.0  0.1   1234   512 ?        Ss   09:00   0:00 /bin/bash',
    'learner       42  0.0  0.2   5678  1024 ?        S    09:01   0:00 nginx: worker process',
    'learner      101  0.1  0.3   9100  2048 ?        Sl   09:02   0:01 node server.js'
  ], 'ps aux');
  r = run(s, 'ps');
  sameLines(r.lines, [
    '  PID TTY          TIME CMD',
    '  101 ?        00:00:01 bash',
    '  202 ?        00:00:00 ps'
  ], 'ps');
  r = run(s, 'top');
  sameLines(r.lines, [
    'top - 09:00:00 up 1 day,  1 user,  load average: 0.10, 0.05, 0.01',
    'Tasks:   3 total,   1 running,   2 sleeping,   0 stopped,   0 zombie',
    '%Cpu(s):  1.0 us,  0.5 sy,  0.0 ni, 98.5 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st',
    'MiB Mem :   7888.0 total,   5012.0 free,   1234.0 used,   1642.0 buff/cache',
    'MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   6356.0 avail Mem',
    '',
    '  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND',
    '    1 learner   20   0    1234    512    256 S   0.0   0.1   0:00.00 bash',
    '  101 learner   20   0    9100   2048   1024 S   0.1   0.3   0:01.00 node'
  ], 'top');
})();

// ---------- 10. curl canned responses ----------
(function curlMap() {
  console.log('== curl map ==');
  const s = makeShell();
  let r;
  r = run(s, 'curl http://example.com/health');
  sameLines(r.lines, ['{"status":"ok"}'], 'curl canned response from curl_map');
  r = run(s, 'curl http://localhost:8080/');
  ok(r.kind === 'err' && /refused/.test(r.lines[0]), 'curl localhost:8080 still refused when nothing is up');
  r = run(s, 'curl http://localhost:9999/');
  ok(r.kind === 'err' && /refused/.test(r.lines[0]), 'curl dead port still refused');
})();

// ---------- 11. help + completions + no regressions ----------
(function helpAndCompletions() {
  console.log('== help + completions ==');
  const s = makeShell();
  let r;
  r = run(s, 'help');
  const joined = r.lines.join(' ');
  ok(joined.includes('docker compose up'), 'help still lists docker compose up');
  ok(joined.includes('python --version'), 'help still lists python --version');
  ok(joined.includes('git init'), 'help lists git');
  ok(joined.includes('kubectl get pods'), 'help lists kubectl');
  ok(joined.includes('kind create cluster'), 'help lists kind');
  ok(joined.includes('terraform init'), 'help lists terraform');
  ok(joined.includes('mkdir'), 'help lists mkdir');
  ok(joined.includes('bash kit-doctor.sh'), 'help lists script runs');
  ok(s.completions('git').includes('git'), 'tab completes git');
  ok(s.completions('kub').includes('kubectl'), 'tab completes kubectl');
  ok(s.completions('ter').includes('terraform'), 'tab completes terraform');
  ok(s.completions('mk').includes('mkdir'), 'tab completes mkdir');
  ok(s.completions('ps').includes('psql'), 'tab completes psql still');
  ok(s.completions('dock').includes('docker'), 'tab completes docker still');
  r = run(s, 'frobnicate');
  ok(r.kind === 'err' && /command not found/.test(r.lines[0]), 'unknown command still errors');
  r = run(s, 'pwd');
  eq(r.lines[0], '/home/learner', 'pwd still works');
  r = run(s, 'echo hello');
  eq(r.lines[0], 'hello', 'echo still works');
  r = run(s, 'ls');
  ok(r.lines.length === 1 && r.lines[0].length > 0, 'ls still works');
  r = run(s, 'docker compose ps');
  ok(/No containers/.test(r.lines.join(' ')), 'docker compose ps still says no containers');
  ok(normalizeCmd('docker exec -it web sh') === 'docker exec web sh', 'normalizeCmd still strips -it on docker exec');
})();

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
