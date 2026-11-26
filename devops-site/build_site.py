#!/usr/bin/env python3
"""Build the DevOps Kit learning site from the kit guides.

Reads ~/workspace/devops-kit/phase1/*.md and phase2/*.md, converts
them to plain-word HTML lesson pages, and generates the landing
page plus 20 interactive fake-terminal simulations (the 18 lessons
plus 2 free skill labs: Linux Command Line and Git Basics).

Output: this folder (index.html at the root, lessons/, sims/,
assets/) — a static site, ready to deploy on Vercel as-is.

Rules baked in:
- Never mention CTS / cheque / NPCI / bank / CCH / HYD / CHN /
  FTS / MPLS. Fake data only.
- The kit v2 uses Moto (free S3 stand-in), not MinIO. A few Phase 2
  files still say MinIO — the MOTO_FIXES list below corrects those
  spots to Moto so the site matches the current kit. Each fix is
  logged when the script runs.
- Every simulation is labelled as a practice version, never a live
  run. Simulation outputs come from the labs' own documented
  outputs, and (for Redis) from the EC2 demo's verified outputs.
"""
import datetime
import html
import os
import re

# Kit source: the lesson markdown lives in ~/workspace/devops-kit by
# default; set DEVOPS_KIT_DIR to build from another checkout.
KIT = os.path.expanduser(os.environ.get("DEVOPS_KIT_DIR",
                                        "~/workspace/devops-kit"))
OUT = os.path.dirname(os.path.abspath(__file__))

# --- MinIO -> Moto corrections (kit v2 uses Moto; these Phase 2 files
# still say MinIO). Each is a plain string replacement on the guide
# text before it becomes a web lesson. -------------------------------
MOTO_FIXES = [
    # cheat-sheets.md: whole MinIO/mc block -> Moto/aws block
    ("""## MinIO and mc (Phase 1 — object store)
```
docker exec mc mc alias set a http://minio-a:9000 learner learn1234
                       Log mc in to store a (once)
docker exec mc mc mb a/incoming
                       Make a bucket called incoming
docker exec mc mc cp /files/receipt-001.txt a/incoming/
                       Upload a file
docker exec mc mc ls a/incoming/
                       List files in the bucket
docker exec mc mc cat a/incoming/receipt-001.txt
                       Print a file's contents
```""",
     """## Moto and aws (Phase 1 — object store)
```
docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming
                       Make a bucket called incoming
docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://incoming/
                       Upload a file
docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls s3://incoming/
                       List files in the bucket
docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 cp s3://incoming/receipt-001.txt -
                       Print a file's contents from the second store
```"""),
    # cheat-sheets.md troubleshooting line
    ("- MinIO file missing from the second store → Phase 1\n  object-store-lab.md: wait a minute, then check `docker compose\n  logs mirror` for the error line.",
     "- Moto file missing from the second store → Phase 1\n  object-store-lab.md: wait a minute, then check `docker compose\n  logs mirror` for the error line."),
    # portfolio-projects.md Project 4
    ("with the counter in Redis and the files in MinIO.",
     "with the counter in Redis and the files in Moto."),
    ("  it in MinIO and sends it to Kafka, worker saves it in PostgreSQL\n  and updates the Redis counter, NGINX spreads visitors across\n  three backends.",
     "  it in Moto and sends it to Kafka, worker saves it in PostgreSQL\n  and updates the Redis counter, NGINX spreads visitors across\n  three backends."),
    ("Tools used: Docker Compose, Kafka, PostgreSQL, Redis, MinIO, NGINX, Python",
     "Tools used: Docker Compose, Kafka, PostgreSQL, Redis, Moto, NGINX, Python"),
    # resume-bullets.md
    ("- Ran two MinIO object stores and set up a mirror that copies new\n  files to the second store by itself.",
     "- Ran two Moto object stores and set up a mirror that copies new\n  files to the second store by itself."),
    # best-sites.md
    ("""- **MinIO docs** (min.io/docs) — Pick this when you finish the
  object store lab and want to understand buckets, the `mc`
  tool and mirroring.
  Why: free, written by the people who make MinIO.""",
     """- **Moto docs** (docs.getmoto.org) — Pick this when you finish the
  object store lab and want to understand the S3 stand-in and the
  `aws` tool.
  Why: free, written by the people who make Moto."""),
    # phase2 start-here.md
    ("PostgreSQL with a standby copy and Patroni\nfailover, Redis (a fast memory store), MinIO (a file store), and\nNGINX as a load balancer.",
     "PostgreSQL with a standby copy and Patroni\nfailover, Redis (a fast memory store), Moto (a file store), and\nNGINX as a load balancer."),
    # zero-cost-lab.md
    ("When you can run\nDocker and read logs, Phase 1 is next: Kafka, PostgreSQL, Redis,\nMinIO and a load balancer, ending with an end-to-end lab where a\nfake order flows through all of them at once.",
     "When you can run\nDocker and read logs, Phase 1 is next: Kafka, PostgreSQL, Redis,\nMoto and a load balancer, ending with an end-to-end lab where a\nfake order flows through all of them at once."),
    # kubernetes-lab.md
    ("Kubernetes runs your app. Phase 1 teaches the data tier your app\ntalks to: Kafka, PostgreSQL with a standby copy, Redis, MinIO and\na load balancer.",
     "Kubernetes runs your app. Phase 1 teaches the data tier your app\ntalks to: Kafka, PostgreSQL with a standby copy, Redis, Moto and\na load balancer."),
    # phase2 cheat-sheets: "MinIO" in the Kafka/PostgreSQL/Redis header line
    ("It now\n  covers the Phase 1 tools too (Kafka, PostgreSQL, Redis, MinIO).",
     "It now\n  covers the Phase 1 tools too (Kafka, PostgreSQL, Redis, Moto)."),
    # portfolio-projects.md: comment header in the Project 4 code block
    ("# Order pipeline demo (Kafka + PostgreSQL + Redis + MinIO + NGINX)",
     "# Order pipeline demo (Kafka + PostgreSQL + Redis + Moto + NGINX)"),
]


def apply_moto_fixes(text, fname):
    for old, new in MOTO_FIXES:
        if old in text:
            text = text.replace(old, new)
            print(f"  moto-fix applied in {fname}: {old[:60]!r}...")
    return text


# ---------------------------------------------------------------- markdown
def inline(text):
    """Escape HTML, then apply `code`, **bold**, [text](url)."""
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                  r'<a href="\2">\1</a>', text)
    return text


def codeblock(lang, code, out_lang=None, out_code=None):
    """Unified command block: dark command area, optional EXPECTED OUTPUT
    area underneath, one Copy button (copies the command only)."""
    cls = f' class="language-{lang}"' if lang else ""
    h = ('<div class="codeblock"><div class="codeblock-head">'
         '<span class="cb-label">Command</span>'
         '<button class="cb-copy" type="button">Copy</button></div>'
         f'<pre><code{cls}>{html.escape(code)}</code></pre>')
    if out_code is not None:
        ocls = f' class="language-{out_lang}"' if out_lang else ""
        h += ('<div class="codeblock-out">'
              '<span class="out-label">Expected output</span>'
              f'<pre><code{ocls}>{html.escape(out_code)}</code></pre></div>')
    h += '</div>'
    return h


_CMD_WORDS = (
    "docker", "kubectl", "kind", "helm", "terraform", "minikube", "k9s",
    "stern", "git", "curl", "aws", "psql", "redis-cli", "kafka-topics",
    "kafka-console-producer", "kafka-console-consumer", "chmod", "mkdir",
    "cp", "mv", "rm", "ls", "cat", "grep", "jq", "ps", "kill", "sleep",
    "watch", "nano", "vi", "vim", "python3", "python", "node", "npm",
    "npx", "env", "export", "source", "bash", "sh", "history", "clear",
    "exit", "whoami", "pwd", "make", "tar", "unzip", "systemctl", "hey",
    "ab", "cd",
)


def _looks_like_command(text):
    """True when the first non-empty line of a fenced block is a shell
    command (e.g. `docker compose ps`), not program output. A line
    starting with '#' is output (e.g. redis '# Replication'), never a
    command. Used to stop the "You should see" merge from eating the
    next command as fake expected output."""
    for line in text.split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            return False
        first = s.split(None, 1)[0]
        if first in _CMD_WORDS:
            return True
        if re.match(r"^for\s+\w+\s+in\b", s):
            return True
        if s == "id":
            return True
        return False
    return False


def md_to_html(md):
    """Small markdown subset: headings, fenced code, lists, paragraphs,
    hr, blockquotes. Hard-wrapped lines join with spaces.
    A fenced block is OUTPUT only if the paragraph right before it
    starts with "You should see" — then it merges with the command
    block above into one unified command + EXPECTED OUTPUT codeblock.
    Guard (2026-11-20, pairing fix): the candidate block must not
    itself look like a command — guides often say "You should see
    X. Now check them:" followed by the NEXT command, and the old
    rule merged that next command in as fake "Expected output"
    (11 of 30 pairs were misfires)."""
    lines = md.split("\n")
    blocks = []  # (kind, ...) tuples, rendered in a second pass
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            lang = line[3:].strip()
            buf = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            blocks.append(("pre", lang, "\n".join(buf)))
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            blocks.append(("h", len(m.group(1)), m.group(2).strip()))
            i += 1
            continue
        if line.strip() == "---":
            blocks.append(("hr",))
            i += 1
            continue
        if line.startswith("> "):
            blocks.append(("quote", line[2:]))
            i += 1
            continue
        if re.match(r"^(\s*)- ", line) or re.match(r"^(\s*)\d+\. ", line):
            ordered = bool(re.match(r"^\s*\d+\. ", line))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and (
                    re.match(r"^\s*- ", lines[i]) or
                    re.match(r"^\s*\d+\. ", lines[i])):
                item_lines = [re.sub(r"^\s*(?:-|\d+\.)\s+", "", lines[i])]
                i += 1
                while i < len(lines) and lines[i].strip() and not (
                        re.match(r"^\s*- ", lines[i]) or
                        re.match(r"^\s*\d+\. ", lines[i]) or
                        lines[i].startswith("#") or
                        lines[i].startswith("```")):
                    item_lines.append(lines[i].strip())
                    i += 1
                items.append(" ".join(item_lines))
            blocks.append(("list", tag, items))
            continue
        if line.strip() == "":
            i += 1
            continue
        # paragraph: gather wrapped lines until blank or block start
        buf = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not (
                lines[i].startswith("#") or lines[i].startswith("```") or
                lines[i].strip() == "---" or lines[i].startswith("> ") or
                re.match(r"^\s*- ", lines[i]) or
                re.match(r"^\s*\d+\. ", lines[i])):
            buf.append(lines[i].strip())
            i += 1
        blocks.append(("p", " ".join(buf)))
    # render, merging command + "You should see" + output into one block
    out = []
    output_idx = set()  # block indices already used as an output block
    j = 0
    while j < len(blocks):
        kind = blocks[j][0]
        if kind == "pre":
            is_out = (j >= 2 and blocks[j - 1][0] == "p" and
                      blocks[j - 1][1].lower().startswith("you should see") and
                      blocks[j - 2][0] == "pre" and (j - 2) not in output_idx and
                      not _looks_like_command(blocks[j][2]))
            if is_out:
                # the command block + "You should see" paragraph are the
                # last two entries rendered; replace both with the merge
                out.pop()  # the "You should see" paragraph
                out.pop()  # the command codeblock
                out.append(codeblock(blocks[j - 2][1], blocks[j - 2][2],
                                     blocks[j][1], blocks[j][2]))
                output_idx.add(j)
                j += 1
                continue
            out.append(codeblock(blocks[j][1], blocks[j][2]))
            j += 1
            continue
        if kind == "h":
            lvl = blocks[j][1]
            out.append(f"<h{lvl}>{inline(blocks[j][2])}</h{lvl}>")
        elif kind == "hr":
            out.append("<hr>")
        elif kind == "quote":
            out.append(f"<blockquote>{inline(blocks[j][1])}</blockquote>")
        elif kind == "list":
            tag, items = blocks[j][1], blocks[j][2]
            lis = "".join(f"<li>{inline(x)}</li>" for x in items)
            out.append(f"<{tag}>{lis}</{tag}>")
        elif kind == "p":
            out.append(f"<p>{inline(blocks[j][1])}</p>")
        j += 1
    return "\n".join(out)


# ---------------------------------------------------------------- lessons
# (slug, title, phase, md file, sim slug or None)
LESSONS = [
    ("lesson-0", "Lesson 0: Before the Terminal", "free",
     "phase1/lesson-0.md", "lesson-0"),
    ("p1-start", "Start Here — Phase 1: The Data Tier", "phase1",
     "phase1/start-here.md", "p1-start"),
    ("p1-kafka", "Kafka Lab — Messages in a Line", "phase1",
     "phase1/kafka-lab.md", "kafka"),
    ("p1-postgresql", "PostgreSQL Lab — Main Database, Standby, Failover",
     "phase1", "phase1/postgresql-lab.md", "postgresql"),
    ("p1-redis", "Redis Lab — A Fast Memory Store", "phase1",
     "phase1/redis-lab.md", "redis"),
    ("p1-object-store", "Object Store Lab — A File Cupboard", "phase1",
     "phase1/object-store-lab.md", "object-store"),
    ("p1-load-balancer", "Load Balancer Lab — One Guard, Three Backends",
     "phase1", "phase1/load-balancer-lab.md", "load-balancer"),
    ("p1-end-to-end", "End-to-End Lab — One Fake Order, All the Way Through",
     "phase1", "phase1/end-to-end-lab.md", "end-to-end"),
    ("p2-start", "Start Here — Phase 2: Linux, Git, Docker and More",
     "phase2", "phase2/start-here.md", "p2-start"),
    ("p2-zero-cost", "Zero-Cost Lab — One Machine, No Cloud Bill", "phase2",
     "phase2/zero-cost-lab.md", "p2-zero-cost"),
    ("p2-kubernetes", "Kubernetes Lab — Your App on a Small Local Cluster",
     "phase2", "phase2/kubernetes-lab.md", "p2-kubernetes"),
    ("p2-break-fix", "Break-and-Fix Labs — Learn Like On-Call Work",
     "phase2", "phase2/break-and-fix-labs.md", "p2-break-fix"),
    ("p2-cheat-sheets", "Cheat Sheets — Commands You Will Actually Use",
     "phase2", "phase2/cheat-sheets.md", "p2-cheat-sheets"),
    ("p2-interview", "Interview Pack — Real Questions, What They Really Test",
     "phase2", "phase2/interview-pack.md", "p2-interview"),
    ("p2-portfolio", "Portfolio Projects — Proof, Not Just Notes", "phase2",
     "phase2/portfolio-projects.md", "p2-portfolio"),
    ("p2-resume", "Resume Bullets — From Your Projects, In Simple Words",
     "phase2", "phase2/resume-bullets.md", "p2-resume"),
    ("p2-best-sites", "Best Sites — What To Pick, And Why", "phase2",
     "phase2/best-sites.md", "p2-best-sites"),
    ("error-decoder", "Error Decoder — Find Your Error, Fix It", "free",
     "phase1/error-decoder.md", "error-decoder"),
]

# --- free skill labs (PR #120) --------------------------------------
# Linux Command Line + Git Basics: free lessons with no kit.md source.
# Their bodies are the hand-written HTML from the PR #120 site, kept
# verbatim. They are NOT in LESSONS: the paid-lesson crumbs ("Lesson
# N of 18") and the free pager chain are computed from LESSONS, and
# adding them there would renumber every paid lesson.
# prev/next carry the exact pager names the live pages show (the live
# pages were hand-built: Linux's next link names Git by its full
# title, while Error Decoder's prev link calls it "Git Basics").
SKILL_LESSONS = {
    "linux-basics": {
        "title": "Linux Command Line — Your First 12 Commands",
        "short": "Linux Command Line",
        "row_title": "Free skill: Linux Command Line",
        "sub": "The 12 commands you will use every day on every server.",
        "prev": ("lesson-0", "Lesson 0"),
        "next": ("git-basics", "Git — Save and Track Your Work"),
        "body": """<h2>What this is and why it matters</h2>
<p><strong>Linux</strong> is the operating system that runs almost every server, cloud machine and container in the world.</p>
<p>DevOps work means working on those machines, and most of them have no mouse and no windows — only a <strong>terminal</strong> where you type commands.</p>
<p>In this lesson you learn the 12 commands that cover about 80% of daily terminal work. You practise each one in a safe browser terminal. Nothing you type here can break anything.</p>
<h2>1. Where am I, and what is here?</h2>
<p><code>pwd</code> prints the folder you are standing in. <code>ls</code> lists what is inside it. Think of a folder like a drawer: <code>pwd</code> tells you which drawer is open, <code>ls</code> shows what is inside.</p>
<p><code>cat file.txt</code> prints the text inside a file.</p>
<h2>2. Make folders and move around</h2>
<p><code>mkdir projects</code> makes a new folder. <code>cd projects</code> goes into it. <code>cd ..</code> goes back up one level. <code>cd</code> alone brings you home.</p>
<h2>3. Create and fill files</h2>
<p><code>touch notes.txt</code> creates an empty file. <code>echo "hello" &gt; notes.txt</code> writes text into a file (the <code>&gt;</code> arrow means &ldquo;send the output into this file&rdquo; and it <b>replaces</b> what was there). Use <code>&gt;&gt;</code> instead to <b>add</b> to the end.</p>
<h2>4. Copy, rename, delete</h2>
<p><code>cp a.txt b.txt</code> copies. <code>mv a.txt b.txt</code> moves or renames. <code>rm b.txt</code> deletes — and there is <b>no recycle bin</b>. Deleted means gone, so read the command twice before pressing Enter.</p>
<h2>Common mistakes</h2>
<ul><li>Typing a command in the wrong folder. Run <code>pwd</code> when unsure.</li><li>Using <code>&gt;</code> when you meant <code>&gt;&gt;</code>, which wipes the file.</li><li>Spaces in file names. Prefer <code>my-notes.txt</code> over <code>my notes.txt</code>.</li></ul>
<div class="ladder"><div class="ladder-title">Your level in Linux, Git &amp; CI/CD</div><div class="ladder-steps"><span class="step-unit"><span class="step done">&#10003; Step 1 &middot; Beginner <span class="here">&#8592; You are here</span></span><span class="ladder-arrow">&rarr;</span></span><span class="step-unit"><span class="step">Step 2 &middot; Intermediate</span><span class="ladder-arrow">&rarr;</span></span><span class="step-unit"><span class="step">Step 3 &middot; Advanced</span></span></div><div class="ladder-note">After this lesson you can: <b>Move around a Linux machine, and create, read, copy, rename and delete files.</b></div><div class="ladder-note">Next: <b>Git</b> — save versions of your work. See <a href="/lessons/git-basics.html">Git — Save and Track Your Work</a>.</div></div>
<h2>Practice in the browser</h2>
<p>Open the practice terminal and follow the 13 steps. It is free, needs no install and works on your phone.</p>
<p><a class="btn amber" href="/sims/linux-basics.html">Open the practice terminal &rarr;</a></p>
<h2>Quick check — try it yourself</h2>
<p><b>Question:</b> You are in the <code>projects</code> folder. Which command takes you back to your home folder?</p>
<details class="exercise-answer"><summary>Show answer</summary><p><code>cd ..</code> goes up one level. If <code>projects</code> is directly inside your home folder, that lands in home. (Plain <code>cd</code> also goes straight home from anywhere.)</p></details>""",
    },
    "git-basics": {
        "title": "Git — Save and Track Your Work",
        "short": "Git Basics",
        "row_title": "Free skill: Git & Version Control",
        "sub": "Save versions, branch safely and merge — the core team workflow.",
        "prev": ("linux-basics", "Linux Command Line"),
        "next": ("error-decoder", "Error Decoder"),
        "body": """<h2>What this is and why it matters</h2>
<p><strong>Git</strong> saves versions of your work, so you can go back, compare, and work with other people without overwriting each other.</p>
<p>Every company that builds software uses Git. Infrastructure code, Docker files, CI pipelines — all of it lives in Git. It is the one tool you cannot skip.</p>
<p>In this lesson you do the complete core workflow: start a repository, save changes, make a branch, and merge it back.</p>
<h2>The 3 places your work lives</h2>
<p><b>Working folder</b> — your files as you edit them. <b>Staging area</b> — the &ldquo;to be saved&rdquo; box, filled with <code>git add</code>. <b>History</b> — saved snapshots, created with <code>git commit</code>.</p>
<p>The two-step save (add, then commit) feels odd at first. It lets you choose exactly which changes go into each snapshot.</p>
<h2>The commands</h2>
<p><code>git init</code> — start tracking this folder.<br><code>git status</code> — what is new, changed or staged. Run it often; it tells you what to do next.<br><code>git add file</code> — stage a file. <code>git add .</code> stages everything.<br><code>git commit -m "message"</code> — save a snapshot with a short message.<br><code>git log</code> — list snapshots, newest first.</p>
<h2>Branches: try ideas safely</h2>
<p>A <b>branch</b> is a separate line of work. <code>git branch feature</code> creates one, <code>git checkout feature</code> switches to it. Files you add on the branch do not appear on <code>main</code> until you <code>git merge feature</code> from main.</p>
<h2>Common mistakes</h2>
<ul><li>Forgetting <code>git add</code>: the commit says &ldquo;nothing to commit&rdquo;.</li><li>Vague messages like &ldquo;fix&rdquo;. Say what changed and why.</li><li>Working on <code>main</code> directly. Make a branch first.</li></ul>
<div class="ladder"><div class="ladder-title">Your level in Linux, Git &amp; CI/CD</div><div class="ladder-steps"><span class="step-unit"><span class="step done">&#10003; Step 1 &middot; Beginner <span class="here">&#8592; You are here</span></span><span class="ladder-arrow">&rarr;</span></span><span class="step-unit"><span class="step">Step 2 &middot; Intermediate</span><span class="ladder-arrow">&rarr;</span></span><span class="step-unit"><span class="step">Step 3 &middot; Advanced</span></span></div><div class="ladder-note">After this lesson you can: <b>Create a repository, make commits, use a branch and merge it.</b></div><div class="ladder-note">Advanced challenge: <b>Fix a merge conflict.</b> — try it in <a href="/lessons/p2-break-fix.html">Break-and-Fix Labs</a>.</div></div>
<h2>Practice in the browser</h2>
<p>The practice terminal behaves like real Git: untracked files show up in <code>git status</code>, branches keep their own history, and files appear and disappear when you switch branches.</p>
<p><a class="btn amber" href="/sims/git-basics.html">Open the practice terminal &rarr;</a></p>
<h2>Quick check — try it yourself</h2>
<p><b>Question:</b> You created <code>idea.txt</code> on the <code>feature</code> branch and committed it. After <code>git checkout main</code>, will <code>ls</code> show <code>idea.txt</code>?</p>
<details class="exercise-answer"><summary>Show answer</summary><p>No. The file belongs to the <code>feature</code> branch history. It appears on <code>main</code> only after <code>git merge feature</code>. Try it in the practice terminal to see it happen.</p></details>""",
    },
}

# Free-lesson pager chain, in order. Names are what the pager shows
# when linking TO that lesson.
FREE_PAGER_CHAIN = ["lesson-0", "linux-basics", "git-basics", "error-decoder"]
FREE_PAGER_NAMES = {
    "lesson-0": "Lesson 0",
    "linux-basics": "Linux Command Line",
    "git-basics": "Git Basics",
    "error-decoder": "Error Decoder",
}

# Sims whose pages were hand-built from the Lesson 0 sim (custom
# about text, SIM_DATA key order, no up_out). The sim flow special-
# cases them so the regen stays byte-identical to the live pages.
SKILL_SIMS = {"linux-basics", "git-basics"}


# Two-line plain-word summaries for the curriculum accordion.
LESSON_SUMMARIES = {
    "lesson-0": ("What Linux, a terminal, Docker and a port mean — in "
                 "plain English. Plus how to install Docker and check "
                 "your machine. Free."),
    "error-decoder": ("35 errors beginners hit, each with what it means, "
                      "the one fix, and how to check it worked. Free."),
    "linux-basics": "The 12 commands you will use every day on every server.",
    "git-basics": "Save versions, branch safely and merge — the core team workflow.",
    "p1-start": ("What the kit teaches, and how the two phases fit "
                 "together. Read this first — it sets the order."),
    "p1-kafka": ("Send three fake orders into one cluster and watch the "
                 "mirror copy them to a second one. Messages in a line, "
                 "copied."),
    "p1-postgresql": ("One main database, one standby copy, and a failover "
                      "— first by hand, then with Patroni. No data lost."),
    "p1-redis": ("A fast memory store for counts, queues and short-lived "
                 "values — with a read-only copy to test."),
    "p1-object-store": ("Put fake receipts in one file store and watch the "
                        "mirror copy them. Cheap, simple storage."),
    "p1-load-balancer": ("One guard in front, three backends behind. Kill "
                         "one backend and the site stays up."),
    "p1-end-to-end": ("One fake order, all the way through: web, queue, "
                      "database, file store. The whole shop, small."),
    "p2-start": ("Phase 2 from zero: Linux, Git, Docker, then Kubernetes, "
                 "Terraform, CI/CD and monitoring."),
    "p2-zero-cost": ("How to learn all of this on one machine with no "
                     "cloud bill. Free tools only, real skills."),
    "p2-kubernetes": ("Your app on a small local cluster. Pods, services "
                      "and deploys — the ideas, not the jargon."),
    "p2-break-fix": ("Break it on purpose, then fix it. Kill the database, "
                     "stop a backend, fix the config — like on-call work."),
    "p2-cheat-sheets": ("The commands you will actually use, on one page "
                        "each. Copy them, run them, keep them."),
    "p2-interview": ("Real interview questions for support roles, and what "
                     "each one really tests. With plain answers."),
    "p2-portfolio": ("Three small projects that prove you can do the work "
                     "— not just notes, but running things."),
    "p2-resume": ("Turn your projects into resume bullets in simple words. "
                  "No jargon, no padding, just proof."),
    "p2-best-sites": ("Where to learn more, and what to pick. The best free "
                      "sites, with what each one is good for."),
}

# Short names for the lesson pager.
SHORT = {
    "lesson-0": "Lesson 0", "error-decoder": "Error Decoder",
    "linux-basics": "Linux Command Line", "git-basics": "Git Basics",
    "p1-start": "Start Here", "p1-kafka": "Kafka",
    "p1-postgresql": "PostgreSQL", "p1-redis": "Redis",
    "p1-object-store": "Object Store", "p1-load-balancer": "Load Balancer",
    "p1-end-to-end": "End-to-End", "p2-start": "Start Here",
    "p2-zero-cost": "Zero-Cost Lab", "p2-kubernetes": "Kubernetes",
    "p2-break-fix": "Break-and-Fix", "p2-cheat-sheets": "Cheat Sheets",
    "p2-interview": "Interview Pack", "p2-portfolio": "Portfolio",
    "p2-resume": "Resume Bullets", "p2-best-sites": "Best Sites",
}

# One quick-check exercise per lesson (Gemini gemini-4-hydrogen design,
# 2026-11-22; every command exercise verified against the real sim step
# and its documented output, every question exercise verified against
# the real lesson text — see devops-kit-v5-review/verify-exercises.py).
# Format: slug -> (question, answer). Backticks mark code to render.
EXERCISES = {
    "lesson-0": (
        "In the terminal, type: `docker --version` — what exact version "
        "line appears?",
        "You should see `Docker version 26.1.3, build 26.1.3-0ubuntu1` "
        "(on your own computer, the version number may be different)."),
    "p1-start": (
        "In real systems, what bad problem does copying data help prevent?",
        "It prevents losing your data or having the system go down when "
        "one machine dies."),
    "p1-kafka": (
        "In the terminal, type: `docker compose ps` — which three "
        "containers (small boxes holding programs) show as `Up`?",
        "You should see `kafka-a  Up`, `kafka-b  Up`, and `mm2  Up`."),
    "p1-postgresql": (
        "In the terminal, type: `curl http://localhost:8008/cluster` — "
        "which database copy has the `leader` (main database) role?",
        "You should see `{\"name\": \"patroni-1\", \"role\": \"leader\"}`, "
        "showing that `patroni-1` is the main database and `patroni-2` "
        "is the replica."),
    "p1-redis": (
        "In the terminal, type: `docker exec redis-a redis-cli ping` — "
        "what one-word reply shows the memory store is awake?",
        "You should see `PONG`."),
    "p1-object-store": (
        "How do you store and get back a file in an object store?",
        "An object store works like a big file cupboard where you save a "
        "file by a name and ask for it back using that same name."),
    "p1-load-balancer": (
        "In the terminal, type: `curl http://localhost:8080/` — which "
        "backend server (app copy behind the traffic guard) answers?",
        "You should see `Hostname: web1`, showing that the first backend "
        "server answered."),
    "p1-end-to-end": (
        "What happens to a fake order file as it moves through the "
        "pipeline (step-by-step path)?",
        "It lands in a folder, gets stored, is sent as a message, and is "
        "saved as a database row and counted."),
    "p2-start": (
        "In the terminal, type: `git --version` — what exact version line "
        "does it print?",
        "In the practice terminal, you should see `git version 2.43.0` (your own computer may show a different version number)."),
    "p2-zero-cost": (
        "Why do people run a program inside a container (a small sealed "
        "box)?",
        "A container keeps one program inside a sealed box so it runs the "
        "same way on different computers without wasting hours debugging "
        "differences."),
    "p2-kubernetes": (
        "In the terminal, type: `kubectl rollout status "
        "deployment/my-site` — what line tells you the app update "
        "finished?",
        "You should see `deployment \"my-site\" successfully rolled out`."),
    "p2-break-fix": (
        "What four steps should you follow in order when practising how "
        "to fix a broken system?",
        "Break it, read the symptom, find the cause, and then fix it."),
    "p2-cheat-sheets": (
        "In the terminal, type: `df -h` — what percentage of the main "
        "disk (`/`) is used?",
        "You should see `44%` on the `/` line (`/dev/sda1     20G    "
        "8.5G   11G    44%  /`)."),
    "p2-interview": (
        "When interviewers ask questions about running software, what "
        "are they really testing?",
        "They want to check whether you understand how systems work and "
        "fail, not whether you memorised syntax."),
    "p2-portfolio": (
        "In the terminal, type: `curl http://localhost:9090/api/v1/"
        "targets` — what values appear for `status` and `targets` to "
        "show monitoring works?",
        "You should see `\"status\": \"success\"` and `\"targets\": "
        "\"up\"`."),
    "p2-resume": (
        "What two parts make a strong, honest resume bullet about a "
        "project?",
        "It states one true fact about what you built and one clear "
        "result it proved, all in one line."),
    "p2-best-sites": (
        "Why should you start with free learning resources before paying "
        "for a big course?",
        "Starting free helps you learn what you actually need first "
        "instead of paying for a big course you might never finish."),
    "error-decoder": (
        "When a lab stops on an error line, what three parts of an error "
        "guide help you solve it?",
        "An error guide gives you what the error means, the one fix to "
        "run, and how to check that the fix worked."),
}

# ---------------------------------------------------------------- levels
# Per-topic skill ladders (Gemini Hydrogen design, 2026-11-22; Advanced
# challenges from the latest-model Advanced design). Each topic has 3
# stages: (stage name, one-line what it teaches, lesson slugs that cover
# it, what the learner can truthfully do after it). A stage with no lesson
# slugs is honestly marked "Coming next" — never shown as complete.
# TOPIC_LADDERS: (topic name, [stages], advanced challenge one-liner)
TOPIC_LADDERS = [
    ("Kafka", [
        ("Beginner", "Send three fake orders into one cluster so messages wait in a line.",
         ["p1-kafka"], "Send fake orders into a Kafka cluster and see them arrive in order."),
        ("Intermediate", "Watch the copy tool (MirrorMaker 2) copy orders to a second cluster.",
         ["p1-kafka"], "Watch the copy tool (MirrorMaker 2) copy orders from one Kafka cluster to a second cluster."),
        ("Advanced", "Fix a stopped mirror — find the bad port, watch the missing order appear on the second cluster.",
         ["p1-kafka"], "Fix a broken Kafka mirror and prove the orders caught up."),
    ], "Mirror stopped copying — find the bad port, fix it, watch the missing order appear on the second cluster."),
    ("PostgreSQL", [
        ("Beginner", "Run a main database with one standby copy.",
         ["p1-postgresql"], "Run a main PostgreSQL database paired with a standby copy."),
        ("Intermediate", "Switch to the standby copy with the failover tool (Patroni).",
         ["p1-postgresql"], "Fail over from main to standby by hand and with the failover tool (Patroni) without losing data."),
        ("Advanced", "Kill the database on purpose, bring it back like on-call work.",
         ["p1-postgresql"], "Recover a PostgreSQL database after killing it on purpose."),
    ], "Database will not restart after a crash — remove the stuck lock file (postmaster.pid), start it, check it answers."),
    ("Redis", [
        ("Beginner", "Use a fast memory store for counts and queues.",
         ["p1-redis"], "Store and read counts, queues, and short-lived values in Redis."),
        ("Intermediate", "Test reading data from a read-only copy.",
         ["p1-redis"], "Test reading data from a read-only Redis copy."),
        ("Advanced", "Fix Redis out of memory — set a clean-up rule (eviction policy).",
         ["p1-redis"], "Fix a Redis that refuses new writes and prove writing works again."),
    ], "Redis says out of memory — set a clean-up rule (eviction policy) and a limit, write again."),
    ("Object Store", [
        ("Beginner", "Save fake receipts into one file store.",
         ["p1-object-store"], "Put fake receipt files into an object store."),
        ("Intermediate", "Watch a mirror copy receipts to a second store.",
         ["p1-object-store"], "Verify that a mirror copies those files to a second object store."),
        ("Advanced", "Fix a stopped mirror — start it again, count both sides.",
         ["p1-object-store"], "Restore missing files from the mirror copy."),
    ], "Mirror stopped copying receipts — start it again, sync, count both sides."),
    ("Load Balancer", [
        ("Beginner", "Put one guard in front of three backends.",
         ["p1-load-balancer"], "Place one load balancer guard in front of three backend servers."),
        ("Intermediate", "Kill one backend, check the site stays up.",
         ["p1-load-balancer"], "Kill one backend and verify the site still answers traffic."),
        ("Advanced", "Break a backend or config on purpose, fix it like on-call work.",
         ["p1-load-balancer"], "Bring a stopped backend back and fix a broken config during an on-call drill."),
    ], "Site error 'Bad Gateway' (502) — find the wrong port in the server config (nginx.conf), check it, reload, see the site answer OK (200)."),
    ("Docker & Containers", [
        ("Beginner", "Install Docker, check your machine, run your first container.",
         ["lesson-0", "p2-zero-cost"], "Explain what Docker and a port are, install Docker, check the machine, and run a first container."),
        ("Intermediate", "Run a tiny web server in a box, stop and start it.",
         ["p2-zero-cost"], "Run a tiny web server inside a container, stop it, and start it again."),
        ("Advanced", "Fix a container that starts then stops.",
         ["p2-zero-cost"], "Fix a broken container and prove the web page answers again."),
    ], "Container starts then stops — find what holds port 80, run it on a free port."),
    ("Kubernetes", [
        ("Beginner", "Learn pods, services, and deploys on a small cluster.",
         ["p2-kubernetes"], "Explain and use pods, services, and deploys on a small local cluster."),
        ("Intermediate", "Scale the app 1 to 3 copies and swap its version.",
         ["p2-kubernetes"], "Scale an app from 1 copy to 3 and swap its version without dropping requests."),
        ("Advanced", "Fix a pod stuck crashing — find the wrong database name.",
         ["p2-kubernetes"], "Fix a crashing pod and prove the app answers again."),
    ], "Pod stuck crashing — find the wrong database name, fix the deploy, watch it turn Running."),
    ("Linux, Git & CI/CD", [
        ("Beginner", "Save work online with Git and write a first script.",
         ["lesson-0", "p2-zero-cost"], "Explain what Linux and a terminal are, save work online, and write a first script."),
        ("Intermediate", "Make saving work run a check by itself, show pass or fail.",
         ["p2-zero-cost"], "Make saving work run a check by itself and show pass or fail."),
        ("Advanced", "Fix a broken script and a failed check.",
         ["p2-zero-cost"], "Fix a broken script and a failed automated run."),
    ], "Deploy script fails — fix the permission and the missing quote, push, watch it pass."),
    ("Whole System & On-Call", [
        ("Beginner", "See how data moves, copies itself, survives a crash.",
         ["p1-start", "p2-start"], "Explain how Phase 1 and Phase 2 fit together and how data moves, copies, and survives crashes."),
        ("Intermediate", "Trace one fake order through web, queue, database, file store.",
         ["p1-end-to-end"], "Trace one fake order from start to finish through web, queue, database, and file store."),
        ("Advanced", "Break the order pipeline — stop the worker, watch it catch up.",
         ["p1-end-to-end"], "Break a multi-part setup on purpose and fix it."),
    ], "An order stuck after the worker stopped — start the worker, watch it catch up, check the count."),
    ("Career & Proof", [
        ("Beginner", "Answer real support interview questions in plain words.",
         ["p2-interview"], "Answer support-role interview questions in plain words based on what the question is really testing."),
        ("Intermediate", "Build three small portfolio projects as proof.",
         ["p2-portfolio"], "Show three completed small projects as proof of hands-on work."),
        ("Advanced", "Turn finished projects into honest, simple resume bullets.",
         ["p2-resume"], "Write honest, plain-word resume bullets directly from those completed projects."),
    ], "Resume rejected for vague words — rewrite each bullet as action + tool + result, pass the check."),
]

# Lesson -> (topic name, stages covered as indexes into that topic's stages)
# Reference pages (cheat sheets, best sites, error decoder) have no ladder.
LESSON_STAGE = {
    "lesson-0": ("Docker & Containers", (0,)),
    "p1-start": ("Whole System & On-Call", (0,)),
    "p1-kafka": ("Kafka", (0, 1, 2)),
    "p1-postgresql": ("PostgreSQL", (0, 1, 2)),
    "p1-redis": ("Redis", (0, 1, 2)),
    "p1-object-store": ("Object Store", (0, 1, 2)),
    "p1-load-balancer": ("Load Balancer", (0, 1, 2)),
    "p1-end-to-end": ("Whole System & On-Call", (1, 2)),
    "p2-start": ("Whole System & On-Call", (0,)),
    "p2-zero-cost": ("Docker & Containers", (0, 1, 2)),
    "p2-kubernetes": ("Kubernetes", (0, 1, 2)),
    "p2-interview": ("Career & Proof", (0,)),
    "p2-portfolio": ("Career & Proof", (1,)),
    "p2-resume": ("Career & Proof", (2,)),
}

# Lessons that teach a second topic get a second ladder bar under the
# first one (the Zero-Cost Lab teaches Docker AND Linux/Git).
LESSON_STAGE_EXTRA = {
    "p2-zero-cost": ("Linux, Git & CI/CD", (0, 1, 2)),
}

# Short stage pill shown on each lesson card (Gemini Hydrogen labels).
LESSON_PILL = {
    "lesson-0": "Docker & Linux · Beginner",
    "p1-start": "Whole System · Beginner",
    "p1-kafka": "Kafka · Beginner → Advanced",
    "p1-postgresql": "PostgreSQL · Beginner → Advanced",
    "p1-redis": "Redis · Beginner → Advanced",
    "p1-object-store": "Object Store · Beginner → Advanced",
    "p1-load-balancer": "Load Balancer · Beginner → Advanced",
    "p1-end-to-end": "Whole System · Intermediate → Advanced",
    "p2-start": "Whole System · Beginner",
    "p2-zero-cost": "Docker & Linux · Beginner → Advanced",
    "p2-kubernetes": "Kubernetes · Beginner → Advanced",
    "p2-break-fix": "Practice · Docker & Git",
    "p2-cheat-sheets": "Reference · Cheat Sheets",
    "p2-interview": "Career · Beginner",
    "p2-portfolio": "Career · Intermediate",
    "p2-resume": "Career · Advanced",
    "p2-best-sites": "Reference · Best Sites",
    "error-decoder": "Reference · Error Decoder",
    "linux-basics": "Free skill · Beginner",
    "git-basics": "Free skill · Beginner",
}

# Simulation deck: short title + the one task each sim teaches.
# Task lines verified against the sims' real step commands.
SIM_SHORT = {
    "kafka": "Apache Kafka", "postgresql": "PostgreSQL Failover",
    "redis": "Redis", "object-store": "Object Store",
    "load-balancer": "Load Balancer", "end-to-end": "End-to-End Pipeline",
    "lesson-0": "Before the Terminal", "error-decoder": "Error Decoder",
    "linux-basics": "Linux Command Line", "git-basics": "Git & Version Control",
    "p1-start": "Phase 1 Start", "p2-start": "Phase 2 Start",
    "p2-zero-cost": "Zero-Cost Lab", "p2-kubernetes": "Kubernetes",
    "p2-break-fix": "Break-and-Fix", "p2-cheat-sheets": "Cheat Sheets",
    "p2-interview": "Interview Pack", "p2-portfolio": "Portfolio Projects",
    "p2-resume": "Resume Bullets", "p2-best-sites": "Best Sites",
}
SIM_TASKS = {
    "kafka": ("Create a topic, send three fake orders, watch the mirror "
              "copy them."),
    "postgresql": ("Copy rows to a standby, then fail over by hand and "
                   "with Patroni."),
    "redis": ("Save values, set expiry times, count orders, try writing "
              "to the copy."),
    "object-store": ("Put fake receipts in one store and watch the mirror "
                     "copy them."),
    "load-balancer": ("Ask one door six times, kill a backend, watch the "
                      "site stay up."),
    "end-to-end": ("Send one fake order through the whole shop, then kill "
                   "the database."),
    "lesson-0": ("Check Docker is there, then run the machine check "
                 "script."),
    "error-decoder": ("Cause four common errors on purpose, then fix each "
                      "one."),
    "linux-basics": ("Your first 13 commands: look around, make files, "
                     "copy, rename, delete."),
    "git-basics": ("Commit, branch and merge — the workflow every team "
                   "uses."),
    "p1-start": ("Knock on all five doors: messages, database, memory, "
                 "files, front door."),
    "p2-start": ("Check the five tools: Git, Docker, Kubernetes, Python, "
                 "Linux."),
    "p2-zero-cost": ("Run a free website in a container and write a check "
                     "script."),
    "p2-kubernetes": ("Start a small local cluster and put your site on "
                      "it."),
    "p2-break-fix": ("Break six small things on purpose, then fix each "
                     "one."),
    "p2-cheat-sheets": ("Run the most-used commands and see what each "
                        "answers."),
    "p2-interview": ("Answer four interview moments with a real command."),
    "p2-portfolio": ("Build the pipeline, the infrastructure, and the "
                     "monitoring check."),
    "p2-resume": ("Prove each resume bullet with the command behind it."),
    "p2-best-sites": ("Ask four tools for their own built-in help."),
}

SIM_LABEL = ("Simulation — practice version. Run the real lab with "
             "Docker to do it for real.")

# Per-lesson label: only the lessons whose real lab genuinely runs in
# Docker keep the Docker line. The other six lessons need no Docker
# at all, so each gets a true plain-words line of its own.
# Keyed by sim slug (the same key the lesson page builder uses).
SIM_LABEL_PLAIN = {
    # Start Here Phase 2: the real thing is checking the five tools
    # are installed on your own machine — Docker is one check, not
    # the lab itself.
    "p2-start": ("Simulation — practice version. The real thing is "
                 "the same checks, on your own machine."),
    # Cheat Sheets: a quick reference. The real thing is running the
    # commands in your own terminal; only the Docker lines need Docker.
    "p2-cheat-sheets": ("Simulation — practice version. The real "
                        "thing is the same commands, in your own "
                        "terminal."),
    # Interview Pack: a study guide. The real thing is answering out
    # loud, in your own words — no Docker needed.
    "p2-interview": ("Simulation — practice version. The real thing "
                     "is answering out loud, in your own words."),
    # Resume Bullets: the check is check_resume.py on your own files.
    # Writing bullets needs no Docker at all.
    "p2-resume": ("Simulation — practice version. The real thing is "
                  "the same check, on your own files."),
    # Best Sites: a map of learning sites. The real thing is opening
    # the sites yourself.
    "p2-best-sites": ("Simulation — practice version. The real thing "
                      "is opening the sites yourself."),
    # Error Decoder: a first-aid lookup page. The real thing is
    # finding your error and running the fix.
    "error-decoder": ("Simulation — practice version. The real thing "
                      "is finding your error and running the fix."),
}

# ---------------------------------------------------------------- sims
# Each step: {"cmd": command shown, "out": [output lines],
#             "hi": map boxes to light up (end-to-end only),
#             "note": short plain-words note shown under the step}
# Outputs come from the labs' own "you should see" lines. Redis
# outputs are the EC2 demo's verified outputs.
SIMS = {
    "kafka": {
        "title": "Kafka Simulation — Messages in a Line",
        "intro": ("Two small Kafka clusters on your own machine. Send three "
                  "fake orders into the first one, read them back, then watch "
                  "MirrorMaker 2 copy them to the second one. All data is fake."),
        "proof": ("Save the mirrored messages: read them back on cluster b "
                  "and save the output to proof/kafka-mirror.txt. It proves "
                  "the copy works."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["[+] Running 3/3",
                     "✔ Container kafka-a  Started",
                     "✔ Container kafka-b  Started",
                     "✔ Container mm2  Started"],
             "note": "Starts both Kafka clusters and MirrorMaker 2 in the background."},
            {"cmd": "docker compose ps",
             "out": ["kafka-a  Up", "kafka-b  Up", "mm2  Up"],
             "note": "mm2 may take a minute — it waits for both clusters."},
            {"cmd": "docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 1 --replication-factor 1",
             "out": ["Created topic orders."],
             "note": "Creates a line called \u2018orders\u2019 on cluster a."},
            {"cmd": "docker exec -it kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders",
             "out": ["> order-101, notebook, 250",
                     "> order-102, pen, 40",
                     "> order-103, mug, 350",
                     "^C"],
             "note": "Type the three lines, then press Ctrl+C. The > is the prompt — your lines are the orders."},
            {"cmd": "docker exec kafka-a /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders --from-beginning",
             "out": ["order-101, notebook, 250",
                     "order-102, pen, 40",
                     "order-103, mug, 350",
                     "^C"],
             "note": "The messages are stored in Kafka, not just sent and lost."},
            {"cmd": "docker exec kafka-b /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list",
             "out": ["a.orders", "heartbeats"],
             "note": "The copy appears on cluster b with the source name in front: a.orders. Small MM2 topics start with mm2- or heartbeats."},
            {"cmd": "docker exec kafka-b /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic a.orders --from-beginning",
             "out": ["order-101, notebook, 250",
                     "order-102, pen, 40",
                     "order-103, mug, 350",
                     "^C"],
             "note": "The same messages now live on two clusters. If cluster a dies, cluster b still has the copy."},
            {"cmd": "docker exec -it kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders",
             "out": ["> order-104, mouse pad, 150", "^C"],
             "note": "Starts the producer again to send one more order."},
            {"cmd": "docker exec kafka-b /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic a.orders --from-beginning",
             "out": ["order-101, notebook, 250",
                     "order-102, pen, 40",
                     "order-103, mug, 350",
                     "order-104, mouse pad, 150",
                     "^C"],
             "note": "The copy follows new messages by itself."},
            {"cmd": "sed -i 's/b.bootstrap.servers=kafka-b:9092/b.bootstrap.servers=kafka-b:9093/' mm2.properties",
             "out": ["(no output — that is normal)"],
             "note": "Advanced — break it on purpose: point cluster b at the wrong port, like a typo in the config. Nothing prints — sed works quietly."},
            {"cmd": "docker exec -it kafka-a /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders",
             "out": ["> order-105, scissors, 90", "^C"],
             "note": "A new order while the mirror is broken. It lands in cluster a — and nowhere else."},
            {"cmd": "tail -n 20 mirrormaker.log",
             "out": ["[2026-11-22 10:00:03] ERROR Failed to connect to cluster b: connection refused (kafka-b:9093)"],
             "note": "The log says it plainly: connection refused, port 9093. That is the bad port you just typed."},
            {"cmd": "cat mm2.properties",
             "out": ["b.bootstrap.servers=kafka-b:9093"],
             "note": "There it is — the config itself points at 9093. The fix is one line."},
            {"cmd": "sed -i 's/b.bootstrap.servers=kafka-b:9093/b.bootstrap.servers=kafka-b:9092/' mm2.properties",
             "out": ["(no output — that is normal)"],
             "note": "Put the right port back."},
            {"cmd": "docker compose restart mm2",
             "out": ["✔ Container mm2  Restarted"],
             "note": "Restart the mirror container. It reads the fixed config and copies the order that arrived while it was broken."},
            {"cmd": "docker exec kafka-b /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic a.orders --from-beginning",
             "out": ["order-101, notebook, 250",
                     "order-102, pen, 40",
                     "order-103, mug, 350",
                     "order-104, mouse pad, 150",
                     "order-105, scissors, 90",
                     "^C"],
             "note": "All five orders are on cluster b now — the mirror caught up."},
        ],
    },
    "postgresql": {
        "title": "PostgreSQL Simulation — Main Database, Standby, Failover",
        "intro": ("Two PostgreSQL databases on your own machine: a main one "
                  "and a standby copy. Write fake orders into the main one, "
                  "watch them appear on the standby, then kill the main one "
                  "and promote the standby. The last part shows Patroni, the "
                  "watcher that does the promotion for you."),
        "proof": ("Save the failover log: after the promotion, save the "
                  "cluster output and the row count to "
                  "proof/failover-log.txt. It proves no data was lost."),
        "steps": [
            {"cmd": "chmod -R a+r .",
             "out": ["(no output — that is normal)"],
             "note": "The database runs as its own user. It cannot read a file that is private to you. This command fixes that."},
            {"cmd": "docker compose up -d",
             "out": ["✔ Container pg-primary  Started",
                     "✔ Container pg-replica  Started"]},
            {"cmd": "docker compose ps",
             "out": ["pg-primary  Up", "pg-replica  Up"]},
            {"cmd": "docker compose logs replica",
             "out": ["Copy done."],
             "note": "The replica copies all data from the primary the first time it starts, so it takes about a minute."},
            {"cmd": "docker exec pg-primary psql -U learner -d practice -c \"CREATE TABLE orders (id INT, item TEXT, amount INT); INSERT INTO orders VALUES (101, 'notebook', 250), (102, 'pen', 40), (103, 'mug', 350);\"",
             "out": ["CREATE TABLE", "INSERT 0 3"],
             "note": "INSERT 0 3 means 3 rows went in. The data is fake."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item   | amount",
                     "-----+----------+--------",
                     " 101 | notebook |    250",
                     " 102 | pen      |     40",
                     " 103 | mug      |    350",
                     "(3 rows)"],
             "note": "The replica already has the same rows — it follows the primary live."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"INSERT INTO orders VALUES (104, 'pen stand', 120);\"",
             "out": ["ERROR:  cannot execute INSERT in a read-only transaction"],
             "note": "That error is the proof. A standby takes reads only. This is correct — do not try to fix it."},
            {"cmd": "docker compose stop primary",
             "out": ["✔ Container pg-primary  Stopped"]},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item   | amount",
                     "-----+----------+--------",
                     " 101 | notebook |    250",
                     " 102 | pen      |     40",
                     " 103 | mug      |    350",
                     "(3 rows)"],
             "note": "The data survived — the replica has its own copy."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"SELECT pg_promote();\"",
             "out": [" pg_promote", "------------", " t"],
             "note": "t means true — the promotion worked."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"SELECT pg_is_in_recovery();\"",
             "out": [" pg_is_in_recovery", "-------------------", " f"],
             "note": "f means false. It is no longer a standby — it is now the main database."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"INSERT INTO orders VALUES (104, 'pen stand', 120); SELECT * FROM orders ORDER BY id;\"",
             "out": ["INSERT 0 1",
                     " id  |   item    | amount",
                     "-----+-----------+--------",
                     " 101 | notebook  |    250",
                     " 102 | pen       |     40",
                     " 103 | mug       |    350",
                     " 104 | pen stand |    120",
                     "(4 rows)"],
             "note": "Failover done — by hand."},
            {"cmd": "cd patroni && docker compose up -d --build",
             "out": ["✔ Container etcd  Started",
                     "✔ Container patroni-1  Started",
                     "✔ Container patroni-2  Started"],
             "note": "Part 2 — Patroni does the failover for you. It keeps its notes in etcd."},
            {"cmd": "curl http://localhost:8008/cluster",
             "out": ['{ "members": [',
                     '  {"name": "patroni-1", "role": "leader"},',
                     '  {"name": "patroni-2", "role": "replica"} ] }'],
             "note": "Two members: one leader, one replica. (Shortened here — the real answer is longer.)"},
            {"cmd": "docker exec patroni-1 psql -U learner -d postgres -c \"CREATE TABLE orders (id INT, item TEXT); INSERT INTO orders VALUES (201, 'stapler');\"",
             "out": ["CREATE TABLE", "INSERT 0 1"]},
            {"cmd": "docker exec patroni-2 psql -U learner -d postgres -c \"SELECT * FROM orders;\"",
             "out": [" id  |  item", "-----+---------",
                     " 201 | stapler", "(1 row)"]},
            {"cmd": "docker compose stop patroni-1",
             "out": ["✔ Container patroni-1  Stopped"]},
            {"cmd": "curl http://localhost:8009/cluster",
             "out": ['{ "members": [',
                     '  {"name": "patroni-2", "role": "leader"},',
                     '  {"name": "patroni-1", "role": "replica"} ] }'],
             "note": "Patroni promoted patroni-2 by itself — no command from you."},
            {"cmd": "docker exec patroni-2 psql -U learner -d postgres -c \"INSERT INTO orders VALUES (202, 'ruler'); SELECT * FROM orders;\"",
             "out": ["INSERT 0 1",
                     " id  |  item", "-----+---------",
                     " 201 | stapler", " 202 | ruler", "(2 rows)"]},
            {"cmd": "docker compose start patroni-1",
             "out": ["✔ Container patroni-1  Started"],
             "note": "The old leader comes back as a replica and copies the new data by itself. That is what Patroni is for."},
            {"cmd": "pg_ctl start -D /var/lib/postgresql/data",
             "out": ["waiting for server to start.... stopped waiting",
                     "pg_ctl: could not start server",
                     "Examine the log output."],
             "note": "Advanced — the database on this machine will not start after a crash. The log says: lock file postmaster.pid already exists. The old server is gone, but its lock file is still there."},
            {"cmd": "ls -l /var/lib/postgresql/data/postmaster.pid",
             "out": ["-rw------- 1 postgres postgres 123 Nov 22 10:00 postmaster.pid"],
             "note": "The lock file is still there — from the crashed server. Nothing is running, so it is safe to remove."},
            {"cmd": "rm /var/lib/postgresql/data/postmaster.pid",
             "out": ["(no output — that is normal)"],
             "note": "Remove only the lock file — never the data itself."},
            {"cmd": "pg_ctl start -D /var/lib/postgresql/data",
             "out": ["waiting for server to start.... done",
                     "server started"],
             "note": "The server starts now that the stale lock is gone."},
            {"cmd": "psql -U postgres -c \"\\l\"",
             "out": ["   Name    |  Owner   | Encoding",
                     "-----------+----------+----------",
                     " postgres  | postgres | UTF8",
                     " practice  | learner  | UTF8",
                     " template0 | postgres | UTF8",
                     " template1 | postgres | UTF8",
                     "(4 rows)"],
             "note": "It answers — the databases are there. (Shortened here — the real answer lists more columns.)"},
        ],
    },
    "redis": {
        "title": "Redis Simulation — A Fast Memory Store",
        "intro": ("Two Redis stores on your own machine: a main one and a "
                  "copy that follows it. Save fake values, set expiry times, "
                  "use a counter, and see what happens when you try to write "
                  "to the copy. Outputs below are from a real run on a "
                  "server, step by step."),
        "proof": ("Save the promotion proof: the INFO replication output "
                  "showing role:master, plus the counter value. It proves "
                  "the copy can take over."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["[+] Running 2/2",
                     "✔ Container redis-a  Started",
                     "✔ Container redis-b  Started"]},
            {"cmd": "docker compose ps",
             "out": ["redis-a  Up", "redis-b  Up"]},
            {"cmd": "docker exec redis-a redis-cli ping",
             "out": ["PONG"]},
            {"cmd": "docker exec redis-a redis-cli SET user:101 Asha",
             "out": ["OK"]},
            {"cmd": "docker exec redis-a redis-cli GET user:101",
             "out": ['"Asha"'],
             "note": "The quotes are part of how redis-cli shows a value. The value stored is Asha."},
            {"cmd": "docker exec redis-a redis-cli SETEX login-code:101 60 482913",
             "out": ["OK"],
             "note": "A login code that lasts 60 seconds, then deletes itself."},
            {"cmd": "docker exec redis-a redis-cli TTL login-code:101",
             "out": ["60"],
             "note": "Seconds left. It counts down — 58, 57, and so on. After 65 seconds the key is gone."},
            {"cmd": "docker exec redis-a redis-cli GET login-code:101",
             "out": ['"482913"']},
            {"cmd": "docker exec redis-a redis-cli SET orders:count 0",
             "out": ["OK"]},
            {"cmd": "docker exec redis-a redis-cli INCR orders:count",
             "out": ["1"]},
            {"cmd": "docker exec redis-a redis-cli INCR orders:count",
             "out": ["2"]},
            {"cmd": "docker exec redis-a redis-cli INCR orders:count",
             "out": ["3"]},
            {"cmd": "docker exec redis-a redis-cli GET orders:count",
             "out": ['"3"'],
             "note": "Each INCR adds 1. A worker does this every time an order is saved."},
            {"cmd": "docker exec redis-b redis-cli GET user:101",
             "out": ['"Asha"']},
            {"cmd": "docker exec redis-b redis-cli GET orders:count",
             "out": ['"3"'],
             "note": "The copy has the same data."},
            {"cmd": "docker exec redis-b redis-cli INFO replication",
             "out": ["role:slave",
                     "master_host:redis-a",
                     "master_port:6379",
                     "master_link_status:up"],
             "note": "role:slave means this copy is following the main store. (Older Redis still calls a replica 'slave'.)"},
            {"cmd": "docker exec redis-b redis-cli SET user:102 Ravi",
             "out": ["(error) READONLY You can't write against a read only replica."],
             "note": "That error is the proof. A one-way copy takes reads only. This is correct — do not try to fix it."},
            {"cmd": "docker exec redis-a redis-cli SET test_key 1",
             "out": ["(error) OOM command not allowed when used memory > 'maxmemory'."],
             "note": "Advanced — the store is full. This practice store has a tiny 200-byte cap, so a new write is refused and test_key was not saved."},
            {"cmd": "docker exec redis-a redis-cli INFO memory",
             "out": ["# Memory",
                     "used_memory:189",
                     "used_memory_human:189B",
                     "used_memory_peak:189",
                     "maxmemory:200",
                     "maxmemory_policy:noeviction"],
             "note": "189 of 200 bytes used. The cap is the problem, not the data."},
            {"cmd": "docker exec redis-a redis-cli CONFIG SET maxmemory-policy allkeys-lru",
             "out": ["OK"],
             "note": "Set the rule first: when the store is full, drop the least-used key to make room."},
            {"cmd": "docker exec redis-a redis-cli CONFIG SET maxmemory 50mb",
             "out": ["OK"],
             "note": "Then raise the cap — 50 megabytes, far more than this practice store needs."},
            {"cmd": "docker exec redis-a redis-cli SET test_key 1",
             "out": ["OK"],
             "note": "The write works again. That is the proof."},
        ],
        "after": ("Two-way idea, in plain words: what if two stores both "
                  "accept writes at the same time? Then they must merge the "
                  "changes. That merge rule is called a CRDT. It is a paid "
                  "feature. The free Redis in this lab does not have it. "
                  "One-way copy is free and simple; two-way copy is a paid "
                  "feature with rules you must understand first."),
    },
    "object-store": {
        "title": "Object Store Simulation — A File Cupboard",
        "intro": ("Two file stores on your own machine with Moto — a free "
                  "S3-compatible stand-in. Put fake receipt files into the "
                  "first store and watch them appear in the second store by "
                  "themselves. All files are fake."),
        "proof": ("Save the proof: the file listed in both stores — moto-a "
                  "and moto-b. It proves the mirror copies by itself."),
        "steps": [
            {"cmd": "docker compose up -d --build",
             "out": ["✔ Container moto-a  Started",
                     "✔ Container moto-b  Started",
                     "✔ Container mirror  Started",
                     "✔ Container awscli  Started"],
             "note": "The first start builds the small aws image, so it takes a couple of minutes."},
            {"cmd": "docker compose ps",
             "out": ["moto-a  Up", "moto-b  Up", "mirror  Up", "awscli  Up"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls",
             "out": ["(empty — no buckets yet, no error)"],
             "note": "An empty answer with no error means the store is up."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming",
             "out": ["make_bucket: incoming"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-001.txt s3://incoming/",
             "out": ["upload: /files/receipt-001.txt to s3://incoming/receipt-001.txt"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls s3://incoming/",
             "out": ["2026-11-20 00:00:00        126 receipt-001.txt"],
             "note": "The date and time will match when you ran it, not the line above."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/",
             "out": ["2026-11-20 00:00:00        126 receipt-001.txt"],
             "note": "The mirror copies new files a few seconds after upload. The copy happened by itself."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-002.txt s3://incoming/",
             "out": ["upload: /files/receipt-002.txt to s3://incoming/receipt-002.txt"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/",
             "out": ["2026-11-20 00:00:00        126 receipt-001.txt",
                     "2026-11-20 00:00:00        126 receipt-002.txt"],
             "note": "New files follow by themselves."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 cp s3://incoming/receipt-001.txt -",
             "out": ["Fake receipt for practice only. Not a real document.",
                     "Order: order-101",
                     "Item: notebook",
                     "Amount: 250",
                     "Buyer: Asha",
                     "Date: 2026-11-20"],
             "note": "This proves the file in the second store is a real copy, not just a name in a list."},
            {"cmd": "docker compose stop mirror",
             "out": ["✔ Container mirror  Stopped"],
             "note": "Advanced — break it on purpose: stop the mirror. A new file will sit in the first store only."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 cp /files/receipt-003.txt s3://incoming/",
             "out": ["upload: /files/receipt-003.txt to s3://incoming/receipt-003.txt"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/",
             "out": ["2026-11-20 00:00:00        126 receipt-001.txt",
                     "2026-11-20 00:00:00        120 receipt-002.txt"],
             "note": "Receipt 003 is missing from the second store — the mirror is stopped, so nothing copied."},
            {"cmd": "docker compose start mirror",
             "out": ["✔ Container mirror  Started"],
             "note": "Start it again. Its first job is to sync everything that piled up."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-b:5000 s3 ls s3://incoming/ | wc -l",
             "out": ["3"],
             "note": "Three files on both sides — the mirror caught up. That is the proof."},
        ],
    },
    "load-balancer": {
        "title": "Load Balancer Simulation — One Guard, Three Backends",
        "intro": ("Three small backends and one NGINX load balancer in "
                  "front of them. Ask the load balancer for the page six "
                  "times and see a different backend answer each time. Then "
                  "kill one backend and watch the site stay up."),
        "proof": ("Save the proof: the curl loop output with web2 missing. "
                  "It proves the site stays up with a backend down."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["✔ Container lb  Started",
                     "✔ Container web1  Started",
                     "✔ Container web2  Started",
                     "✔ Container web3  Started"]},
            {"cmd": "docker compose ps",
             "out": ["lb  Up", "web1  Up", "web2  Up", "web3  Up"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web1"],
             "note": "A few more lines follow — the Hostname line is the one to watch. It tells you which backend answered."},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web2"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web3"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web1"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web2"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web3"],
             "note": "Round robin — the guard shares the work evenly: web1, web2, web3, then again."},
            {"cmd": "docker compose stop web2",
             "out": ["✔ Container web2  Stopped"]},
            {"cmd": "for i in 1 2 3 4 5 6; do curl -s http://localhost:8080/ | grep Hostname; done",
             "out": ["Hostname: web1", "Hostname: web3",
                     "Hostname: web1", "Hostname: web3",
                     "Hostname: web1", "Hostname: web3"],
             "note": "Backend 2 never answers — the guard skips it by itself. The site stays up with two backends."},
            {"cmd": "docker compose start web2",
             "out": ["✔ Container web2  Started"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web2"],
             "note": "Backend 2 answers again within a few seconds."},
            {"cmd": "docker compose exec lb sed -i 's/:80/:8085/g' /etc/nginx/nginx.conf",
             "out": ["(no output — that is normal)"],
             "note": "Advanced — break it on purpose: a bad find-replace changed all three backend ports from 80 to 8085, where nothing listens. Nothing prints — sed works quietly."},
            {"cmd": "docker compose exec lb nginx -s reload",
             "out": ["(no output — that is normal)"],
             "note": "The guard only reads its config when you tell it to. Reload now, so the broken config takes effect."},
            {"cmd": "curl -I http://localhost:8080/",
             "out": ["HTTP/1.1 502 Bad Gateway",
                     "Server: nginx/1.25.4",
                     "Content-Type: text/html"],
             "note": "502 Bad Gateway — the guard cannot reach any backend. -I shows only the headers, which is all you need here."},
            {"cmd": "docker compose exec lb cat /etc/nginx/nginx.conf",
             "out": ["    server web1:8085;",
                     "    server web2:8085;",
                     "    server web3:8085;"],
             "note": "Read the config: all three backends point at 8085. That is the wrong port you just typed."},
            {"cmd": "docker compose exec lb sed -i 's/:8085/:80/g' /etc/nginx/nginx.conf",
             "out": ["(no output — that is normal)"],
             "note": "Put the right port back on all three lines."},
            {"cmd": "docker compose exec lb nginx -t",
             "out": ["nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
                     "nginx: configuration file /etc/nginx/nginx.conf test is successful"],
             "note": "Check before you reload. Note: -t checks the syntax only — 8085 is a valid port, so it would have passed even with the wrong ports. Only curl shows a dead backend."},
            {"cmd": "docker compose exec lb nginx -s reload",
             "out": ["(no output — that is normal)"],
             "note": "Reload makes the running guard read the fixed config. No output is normal."},
            {"cmd": "curl -I http://localhost:8080/",
             "out": ["HTTP/1.1 200 OK",
                     "Server: nginx/1.25.4",
                     "Content-Type: text/html"],
             "note": "200 OK — the site answers again. That is the proof."},
        ],
    },
    "end-to-end": {
        "title": "End-to-End Simulation — One Fake Order, All the Way Through",
        "intro": ("A small order pipeline, all on one machine. A fake order "
                  "file lands in a folder. A program stores the file, sends "
                  "the order to Kafka, and another program saves it in "
                  "PostgreSQL and updates a counter in Redis. A load "
                  "balancer spreads visitors across three backends. Then you "
                  "kill the main database and watch the standby take over — "
                  "and a new order still flows through."),
        "proof": ("Save the proof: the 6-row orders table and the counter "
                  "at 6, after the worker caught up. It proves the whole pipeline "
                  "survives a dead database — and a stopped worker."),
        "map": [
            ("file", "📄 Order file", "incoming/"),
            ("moto", "🗄️ Object store", "Moto · bucket incoming"),
            ("kafka", "📬 Kafka", "topic orders"),
            ("postgres", "📖 PostgreSQL", "primary + standby"),
            ("redis", "⚡ Redis", "orders:count"),
            ("lb", "🛡️ Load balancer", "web1 · web2 · web3"),
        ],
        "steps": [
            {"cmd": "chmod -R a+r .",
             "out": ["(no output — that is normal)"],
             "note": "The database runs as its own user. This command makes the setup file readable for it."},
            {"cmd": "docker compose up -d --build",
             "out": ["✔ Container kafka  Started",
                     "✔ Container postgres-primary  Started",
                     "✔ Container postgres-replica  Started",
                     "✔ Container redis  Started",
                     "✔ Container moto  Started",
                     "✔ Container lb  Started",
                     "✔ Container web1  Started",
                     "✔ Container web2  Started",
                     "✔ Container web3  Started",
                     "✔ Container ingest  Started",
                     "✔ Container worker  Started"],
             "note": "Eleven services, one command. The first start takes a few minutes."},
            {"cmd": "docker compose ps",
             "out": ["kafka  Up", "postgres-primary  Up",
                     "postgres-replica  Up", "redis  Up", "moto  Up",
                     "lb  Up", "web1  Up", "web2  Up", "web3  Up",
                     "ingest  Up", "worker  Up"]},
            {"cmd": "docker compose logs ingest",
             "out": ["Connected to Kafka.",
                     "Connected to the object store.",
                     "Watching /incoming for new order files...",
                     "Sent order-001.json: {'id': 101, 'item': 'notebook', 'amount': 250, 'buyer': 'Asha'}",
                     "Sent order-002.json: {'id': 102, 'item': 'pen', 'amount': 40, 'buyer': 'Ravi'}",
                     "Sent order-003.json: {'id': 103, 'item': 'mug', 'amount': 350, 'buyer': 'Meena'}"],
             "hi": ["file", "moto", "kafka"],
             "note": "Ingest only prints 'Sent ...' after it has stored the file — so the three files are in the object store."},
            {"cmd": "docker compose logs worker",
             "out": ["Connected to PostgreSQL.",
                     "Connected to Redis.",
                     "Connected to Kafka. Waiting for orders...",
                     "Saved order 101: notebook (250)",
                     "Saved order 102: pen (40)",
                     "Saved order 103: mug (350)"],
             "hi": ["kafka", "postgres", "redis"],
             "note": "The order travelled: file → object store → Kafka → database → counter."},
            {"cmd": "docker compose exec postgres-primary psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item   | amount | buyer",
                     "-----+----------+--------+-------",
                     " 101 | notebook |    250 | Asha",
                     " 102 | pen      |     40 | Ravi",
                     " 103 | mug      |    350 | Meena",
                     "(3 rows)"],
             "hi": ["postgres"]},
            {"cmd": "docker compose exec redis redis-cli GET orders:count",
             "out": ['"3"'],
             "hi": ["redis"]},
            {"cmd": "for i in 1 2 3 4 5 6; do curl -s http://localhost:8080/ | grep Hostname; done",
             "out": ["Hostname: web1", "Hostname: web2", "Hostname: web3",
                     "Hostname: web1", "Hostname: web2", "Hostname: web3"],
             "hi": ["lb"],
             "note": "The guard shares the work between the three backends."},
            {"cmd": "cat > incoming/order-004.json << 'EOF'\n{\"id\": 104, \"item\": \"pen stand\", \"amount\": 120, \"buyer\": \"Kumar\"}\nEOF",
             "out": ["(no output — the file is written)"],
             "hi": ["file"],
             "note": "A fourth order, written by you."},
            {"cmd": "docker compose exec postgres-primary psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item    | amount | buyer",
                     "-----+-----------+--------+-------",
                     " 101 | notebook  |    250 | Asha",
                     " 102 | pen       |     40 | Ravi",
                     " 103 | mug       |    350 | Meena",
                     " 104 | pen stand |    120 | Kumar",
                     "(4 rows)"],
             "hi": ["postgres"],
             "note": "A new order flows through the whole pipeline by itself — file in, database row out."},
            {"cmd": "docker compose exec redis redis-cli GET orders:count",
             "out": ['"4"'],
             "hi": ["redis"]},
            {"cmd": "docker compose stop postgres-primary",
             "out": ["✔ Container postgres-primary  Stopped"],
             "hi": ["postgres"],
             "note": "The worker will crash — it cannot reach the database any more — and Docker will restart it. It keeps printing 'Waiting for PostgreSQL...'. That is correct."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item    | amount | buyer",
                     "-----+-----------+--------+-------",
                     " 101 | notebook  |    250 | Asha",
                     " 102 | pen       |     40 | Ravi",
                     " 103 | mug       |    350 | Meena",
                     " 104 | pen stand |    120 | Kumar",
                     "(4 rows)"],
             "hi": ["postgres"],
             "note": "The standby still has the data — it has its own copy."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT pg_promote();\"",
             "out": [" pg_promote", "------------", " t"],
             "hi": ["postgres"],
             "note": "t means true — the promotion worked."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT pg_is_in_recovery();\"",
             "out": [" pg_is_in_recovery", "-------------------", " f"],
             "hi": ["postgres"],
             "note": "f means false. The standby is now the main database."},
            {"cmd": "docker compose stop worker",
             "out": ["✔ Container worker  Stopped"]},
            {"cmd": "docker compose run --no-deps --rm -e PG_HOST=postgres-replica worker",
             "out": ["Connected to PostgreSQL.",
                     "Connected to Redis.",
                     "Connected to Kafka. Waiting for orders..."],
             "hi": ["postgres", "kafka"],
             "note": "A fresh worker that talks to the new main database. The --no-deps flag matters: without it, Compose would restart the dead main database too."},
            {"cmd": "cat > incoming/order-005.json << 'EOF'\n{\"id\": 105, \"item\": \"ruler\", \"amount\": 60, \"buyer\": \"Divya\"}\nEOF",
             "out": ["(no output — the file is written)"],
             "hi": ["file"]},
            {"cmd": "docker compose logs worker",
             "out": ["Saved order 105: ruler (60)"],
             "hi": ["kafka", "postgres"],
             "note": "In the real lab you watch the worker's live logs in the first terminal."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item    | amount | buyer",
                     "-----+-----------+--------+-------",
                     " 101 | notebook  |    250 | Asha",
                     " 102 | pen       |     40 | Ravi",
                     " 103 | mug       |    350 | Meena",
                     " 104 | pen stand |    120 | Kumar",
                     " 105 | ruler     |     60 | Divya",
                     "(5 rows)"],
             "hi": ["postgres"],
             "note": "The order flowed through the standby that is now the main database. Failover done — end to end."},
            {"cmd": "docker compose stop worker",
             "out": ["✔ Container worker  Stopped"],
             "hi": ["kafka"],
             "note": "Advanced — break it on purpose: stop the worker. The next order will arrive, but nobody saves it."},
            {"cmd": "cat > incoming/order-006.json << 'EOF'\n{\"id\": 106, \"item\": \"scissors\", \"amount\": 90, \"buyer\": \"Anita\"}\nEOF",
             "out": ["(no output — the file is written)"],
             "hi": ["file"],
             "note": "A sixth order, written while the worker is stopped."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item    | amount | buyer",
                     "-----+-----------+--------+-------",
                     " 101 | notebook  |    250 | Asha",
                     " 102 | pen       |     40 | Ravi",
                     " 103 | mug       |    350 | Meena",
                     " 104 | pen stand |    120 | Kumar",
                     " 105 | ruler     |     60 | Divya",
                     "(5 rows)"],
             "hi": ["postgres"],
             "note": "Still five rows — order 106 is stuck. It reached Kafka, but nobody saved it."},
            {"cmd": "docker inspect worker",
             "out": ["\"Name\": \"/worker\"",
                     "\"State\": { \"Status\": \"exited\" }",
                     "\"Config\": { \"Image\": \"worker:latest\", \"Env\": [\"PG_HOST=postgres-replica\"] }"],
             "hi": ["postgres"],
             "note": "The worker points at the right database — postgres-replica. It is not broken, it is stopped."},
            {"cmd": "docker compose start worker",
             "out": ["✔ Container worker  Started"],
             "hi": ["kafka"],
             "note": "Start it again. A worker that starts again reads the orders that arrived while it was down."},
            {"cmd": "docker compose logs worker",
             "out": ["Saved order 106: scissors (90)"],
             "hi": ["kafka", "postgres"],
             "note": "There it is — the worker caught up and saved the stuck order."},
            {"cmd": "docker compose exec postgres-replica psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item    | amount | buyer",
                     "-----+-----------+--------+-------",
                     " 101 | notebook  |    250 | Asha",
                     " 102 | pen       |     40 | Ravi",
                     " 103 | mug       |    350 | Meena",
                     " 104 | pen stand |    120 | Kumar",
                     " 105 | ruler     |     60 | Divya",
                     " 106 | scissors  |     90 | Anita",
                     "(6 rows)"],
             "hi": ["postgres"],
             "note": "Six rows — the stuck order is saved. The pipeline survives a stopped worker."},
            {"cmd": "docker compose down -v",
             "out": ["11 containers removed"],
             "note": "That stops everything and deletes the data. The data was fake."},
        ],
    },
    "lesson-0": {
        "title": "Lesson 0 Simulation — Before the Terminal",
        "intro": ("A terminal is just a window where you type what you want "
                  "the computer to do, and Docker is the free program that "
                  "runs the labs for you. This practice terminal lets you "
                  "check Docker is there, then run the one script that "
                  "checks your whole machine."),
        "proof": ("Save the last line of the check script: \"All OK - your "
                  "machine is ready for the labs.\" It proves your machine "
                  "can run the labs."),
        "steps": [
            {"cmd": "docker --version",
             "out": ["Docker version 26.1.3, build 26.1.3-0ubuntu1"],
             "note": "The version number on your real machine will be different — that is fine."},
            {"cmd": "docker compose version",
             "out": ["Docker Compose version v2.27.0"]},
            {"cmd": "ls",
             "out": ["phase1"],
             "note": "One folder. The kit lives inside it."},
            {"cmd": "cd phase1",
             "out": ["(no output — that is normal)"],
             "note": "cd moves you into the folder. Nothing prints — that is normal."},
            {"cmd": "ls",
             "out": ["kit-doctor.sh  docker-compose.yml  start-here.md"],
             "note": "kit-doctor.sh is the script that checks your machine."},
            {"cmd": "bash kit-doctor.sh",
             "out": ["OK: Docker command found.",
                     "OK: Docker Compose works.",
                     "OK: Docker is running.",
                     "OK: Port 5432 is free (needed by the database lab).",
                     "OK: Port 6379 is free (needed by the memory store lab).",
                     "OK: Port 9092 is free (needed by the message lab).",
                     "OK: Disk space is fine.",
                     "OK: Memory is fine.",
                     "",
                     "All OK - your machine is ready for the labs."],
             "note": "Each line is one check. On your real machine the script checks more doors — 5432, 6379, 9092 and the rest."},
        ],
    },
    "error-decoder": {
        "title": "Error Decoder Simulation — Find Your Error, Fix It",
        "intro": ("Errors are not failures — they are the computer telling "
                  "you exactly what went wrong, in its own words. This "
                  "practice terminal lets you cause four common errors on "
                  "purpose, then fix each one and see it go away."),
        "proof": ("Save the four error lines and their fixes. Next time one "
                  "appears in a real lab, you will know it by sight."),
        "steps": [
            {"cmd": "curl http://localhost:8080/",
             "out": ["curl: (7) Failed to connect to localhost port 8080: Connection refused"],
             "note": "Nothing answers yet — the site is not running. That is the error, not the problem."},
            {"cmd": "docker compose up -d",
             "out": ["✔ Container kafka-a  Started",
                     "✔ Container redis-a  Started",
                     "✔ Container redis-b  Started",
                     "✔ Container moto-a  Started",
                     "✔ Container awscli  Started",
                     "✔ Container lb  Started",
                     "✔ Container web1  Started"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web1"],
             "note": "The fix was starting the site. One door, one backend answering."},
            {"cmd": "docker exec redis-b redis-cli SET user:101 Ravi",
             "out": ["(error) READONLY You can't write against a read only replica."],
             "note": "That error is the proof: this copy takes reads only. You wrote to the wrong store."},
            {"cmd": "docker exec redis-a redis-cli SET user:101 Ravi",
             "out": ["OK"],
             "note": "Same command, the main store this time. OK means the fix worked."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls s3://nope/",
             "out": ["An error occurred (NoSuchBucket) when calling the ListObjects operation: The specified bucket does not exist"],
             "note": "NoSuchBucket means the bucket was never made. The store is fine — the name is wrong."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming",
             "out": ["make_bucket: incoming"],
             "note": "Make the bucket first, then use it."},
            {"cmd": "chmod -R a+r",
             "out": ["chmod: missing operand after 'a+r'",
                     "Try 'chmod --help' for more information."],
             "note": "chmod needs a target — what to change. You gave it the change, but not the thing."},
            {"cmd": "chmod -R a+r .",
             "out": ["(no output — that is normal)"],
             "note": "A dot means this folder. The fix was one character."},
        ],
    },
    "p1-start": {
        "title": "Phase 1 Start Simulation — Knock on All Five Doors",
        "intro": ("Phase 1 is one small shop: messages in a line, a "
                  "database, a fast memory store, a file cupboard, and one "
                  "door in front. This practice terminal knocks on each of "
                  "the five doors, one at a time, so you can see every part "
                  "answer."),
        "proof": ("Save the five answers: PONG, the 3-row table, the topic "
                  "list, the bucket list, and the Hostname line. Together "
                  "they prove the whole data tier is up."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["✔ Container kafka-a  Started",
                     "✔ Container pg-primary  Started",
                     "✔ Container redis-a  Started",
                     "✔ Container moto-a  Started",
                     "✔ Container awscli  Started",
                     "✔ Container lb  Started",
                     "✔ Container web1  Started",
                     "✔ Container web2  Started",
                     "✔ Container web3  Started"]},
            {"cmd": "docker exec redis-a redis-cli ping",
             "out": ["PONG"],
             "note": "The memory store answers."},
            {"cmd": "docker exec pg-primary psql -U learner -d practice -c \"CREATE TABLE orders (id INT, item TEXT, amount INT); INSERT INTO orders VALUES (101, 'notebook', 250), (102, 'pen', 40), (103, 'mug', 350);\"",
             "out": ["CREATE TABLE", "INSERT 0 3"],
             "note": "Three fake orders go into the main database."},
            {"cmd": "docker exec pg-primary psql -U learner -d practice -c \"SELECT * FROM orders ORDER BY id;\"",
             "out": [" id  |   item   | amount",
                     "-----+----------+--------",
                     " 101 | notebook |    250",
                     " 102 | pen      |     40",
                     " 103 | mug      |    350",
                     "(3 rows)"],
             "note": "The same rows, read back."},
            {"cmd": "docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 1 --replication-factor 1",
             "out": ["Created topic orders."]},
            {"cmd": "docker exec kafka-a /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list",
             "out": ["orders"],
             "note": "The message line is open."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 mb s3://incoming",
             "out": ["make_bucket: incoming"]},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls",
             "out": ["2026-11-20 00:00:00  incoming"],
             "note": "The date will match when you ran it, not the line above."},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web1"],
             "note": "One door in front, and a backend answers. All five doors knocked."},
        ],
    },
    "p2-start": {
        "title": "Phase 2 Start Simulation — Check Your Tools",
        "intro": ("Phase 2 is the rest of the toolkit: the base skills and "
                  "the tools that run real systems. This practice terminal "
                  "checks the five tools you need are all here, by asking "
                  "each one its version."),
        "proof": ("Save the five version lines. If every tool answers, your "
                  "machine is ready for Phase 2."),
        "steps": [
            {"cmd": "git --version",
             "out": ["git version 2.43.0"],
             "note": "Git saves versions of your work."},
            {"cmd": "docker --version",
             "out": ["Docker version 26.1.3, build 26.1.3-0ubuntu1"],
             "note": "Docker runs the labs in sealed boxes."},
            {"cmd": "kubectl version --client",
             "out": ["Client Version: v1.30.0"],
             "note": "kubectl talks to Kubernetes clusters."},
            {"cmd": "python3 --version",
             "out": ["Python 3.12.3"],
             "note": "Python runs the small helper programs."},
            {"cmd": "uname -a",
             "out": ["Linux devops-kit 6.8.0-generic x86_64 GNU/Linux"],
             "note": "The machine underneath it all. Your version line will look different — that is fine."},
        ],
    },
    "p2-zero-cost": {
        "title": "Zero-Cost Simulation — A Free Website on One Machine",
        "intro": ("You do not need a cloud account or a bill to learn this "
                  "— one machine is enough. This practice terminal runs a "
                  "small website in a container, then writes a little "
                  "script that checks on it."),
        "proof": ("Save the script's answer: \"Running containers:\" and "
                  "\"my-site is Up\". It proves your site runs and your "
                  "script can see it."),
        "steps": [
            {"cmd": "docker run -d -p 8080:80 --name my-site nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "The long line is the container's id. -d means run in the background, -p opens door 8080 to the site inside."},
            {"cmd": "curl http://localhost:8080",
             "out": ["Welcome to nginx!",
                     "If you see this page, the nginx web server is successfully installed."],
             "note": "Your free website answers."},
            {"cmd": "mkdir -p devops-practice",
             "out": ["(no output — that is normal)"],
             "note": "A folder to keep your practice files in."},
            {"cmd": "cd devops-practice",
             "out": ["(no output — that is normal)"],
             "note": "Move into it."},
            {"cmd": "cat > health-check.sh << 'EOF'\n#!/bin/bash\necho \"Running containers:\"\ndocker ps\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Type the lines, then EOF on its own line to finish. The script just asks Docker what is running."},
            {"cmd": "chmod +x health-check.sh",
             "out": ["(no output — that is normal)"],
             "note": "This makes the file runnable."},
            {"cmd": "./health-check.sh",
             "out": ["Running containers:", "my-site is Up"],
             "note": "Your script works — it found your site."},
            {"cmd": "docker stop my-site",
             "out": ["my-site"],
             "note": "Stop it when you are done. Start it again any time with docker start my-site."},
            {"cmd": "docker ps -a",
             "out": ["my-site  Exited"],
             "note": "Advanced — the site is stopped, not gone. ps -a shows stopped containers too."},
            {"cmd": "docker run -d -p 8080:80 --name web-app nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "A second site, on the same door 8080 — now free, since my-site stopped."},
            {"cmd": "docker logs web-app",
             "out": ["2026/11/22 10:00:00 [notice] 1#1: using the \"epoll\" event method",
                     "2026/11/22 10:00:00 [notice] 1#1: nginx/1.25.4",
                     "2026/11/22 10:00:00 [notice] 1#1: built by gcc 12.2.0"],
             "note": "The logs say the web server started. No errors."},
            {"cmd": "docker run -d -p 8080:80 --name web-app-2 nginx",
             "out": ["docker: Error response from daemon: driver failed programming external connectivity on endpoint web-app-2: Bind for 0.0.0.0:8080 failed: port is already allocated."],
             "note": "Two containers cannot hold the same door. Port 8080 is taken by web-app."},
            {"cmd": "netstat -tuln",
             "out": ["Active Internet connections (only servers)",
                     "Proto Recv-Q Send-Q Local Address           Foreign Address         State",
                     "tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN"],
             "note": "netstat shows who holds the door: something is listening on 8080."},
            {"cmd": "docker rm -f web-app",
             "out": ["web-app"],
             "note": "Remove it — -f stops it first. That frees the door."},
            {"cmd": "docker run -d -p 8081:80 --name web-app nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "Same site, a free door: 8081."},
            {"cmd": "curl http://localhost:8081",
             "out": ["Welcome to nginx!",
                     "If you see this page, the nginx web server is successfully installed."],
             "note": "The site answers on 8081. That is the proof."},
            {"cmd": "cat > deploy.sh << 'EOF'\n#!/bin/bash\necho \"Starting deploy...\"\necho \"Running checks...\"\necho \"Deploying to production\necho \"Build Passed: Deployed Successfully\"\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Advanced — a deploy script with two faults: it is not runnable, and one line is missing its closing quote."},
            {"cmd": "./deploy.sh",
             "out": ["bash: ./deploy.sh: Permission denied"],
             "note": "A new file is not runnable by itself. That is the first fault."},
            {"cmd": "chmod +x deploy.sh",
             "out": ["(no output — that is normal)"],
             "note": "Make it runnable."},
            {"cmd": "bash -n deploy.sh",
             "out": ["deploy.sh: line 4: unexpected EOF while looking for matching `\"'",
                     "deploy.sh: line 5: syntax error: unexpected end of file"],
             "note": "Check the syntax before you run it. Line 4 is missing its closing quote — the second fault."},
            {"cmd": "nano deploy.sh",
             "out": ["GNU nano 7.2  deploy.sh",
                     "#!/bin/bash",
                     "echo \"Starting deploy...\"",
                     "echo \"Running checks...\"",
                     "echo \"Deploying to production\"",
                     "echo \"Build Passed: Deployed Successfully\"",
                     "^G Help  ^O Write Out  ^X Exit"],
             "note": "Open it in the editor, add the missing quote on line 4, save with Ctrl+O, exit with Ctrl+X."},
            {"cmd": "bash -n deploy.sh",
             "out": ["(no output — that is normal)"],
             "note": "No output means the syntax is fine now."},
            {"cmd": "git commit -am \"fix deploy script\" && git push origin main",
             "out": ["[main e4f5a6b] fix deploy script",
                     " 2 files changed, 2 insertions(+)",
                     "Enumerating objects: 3, done.",
                     "To https://github.com/learner/app.git",
                     "   a1b2c3d..e4f5a6b  main -> main"],
             "note": "Save the fix and push it. -a stages the changed files, -m is the message."},
            {"cmd": "./deploy.sh",
             "out": ["Starting deploy...",
                     "Running checks...",
                     "Deploying to production",
                     "Build Passed: Deployed Successfully"],
             "note": "The deploy passes. That is the proof."},
            {"cmd": "cat > check.sh << 'EOF'\n#!/bin/bash\nbash -n deploy.sh\necho \"Check: PASS\"\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Intermediate — a tiny check script: it checks deploy.sh's syntax, then prints PASS. This is a test you can run any time."},
            {"cmd": "chmod +x check.sh",
             "out": ["(no output — that is normal)"],
             "note": "Make it runnable."},
            {"cmd": "./check.sh",
             "out": ["Check: PASS"],
             "note": "The check passes. A green check you can run again before every push."},
            {"cmd": "cat > .git/hooks/pre-push << 'EOF'\n#!/bin/bash\n./check.sh\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Now make saving work run the check by itself. A pre-push hook is a script Git runs for you right before a push — this one runs check.sh."},
            {"cmd": "git add check.sh && git commit -m \"add the check script\"",
             "out": ["[main c7d8e9f] add the check script",
                     " 1 file changed, 1 insertion(+)"],
             "note": "Save the check script."},
            {"cmd": "git push origin main",
             "out": ["Check: PASS",
                     "Enumerating objects: 3, done.",
                     "To https://github.com/learner/app.git",
                     "   a1b2c3d..c7d8e9f  main -> main"],
             "note": "Watch the first line: the check ran by itself before the push went out. That is CI/CD in miniature — a check that runs on its own every time you save work."},
            {"cmd": "git status",
             "out": ["On branch main",
                     "nothing to commit, working tree clean"],
             "note": "Everything is saved and pushed. Try it yourself: break deploy.sh, push again, and watch the push stop."},
        ],
    },
    "p2-kubernetes": {
        "title": "Kubernetes Simulation — Your App on a Small Cluster",
        "intro": ("Kubernetes is a manager that keeps the copies of your "
                  "app running — if one copy crashes, it starts a new one "
                  "by itself. This practice terminal starts a small cluster "
                  "on your own machine and puts your website on it."),
        "proof": ("Save the last get pods output: three my-site copies on "
                  "version 2.0 and the fixed web-app pod, all 1/1 Running. "
                  "It proves the cluster scales, rolls out a new version, "
                  "and heals itself."),
        "steps": [
            {"cmd": "kind create cluster --name devops-practice",
             "out": ["Creating cluster \"devops-practice\" ...",
                     " ✓ Ensuring node image (kindest/node:v1.30.0)",
                     " ✓ Preparing nodes",
                     " ✓ Writing configuration",
                     " ✓ Starting control-plane",
                     " ✓ Installing CNI",
                     " ✓ Installing StorageClass",
                     "Set kubectl context to \"kind-devops-practice\"",
                     "You can now use your cluster with:",
                     "",
                     "kubectl cluster-info --all-namespaces"],
             "note": "kind makes a whole cluster out of containers. It takes a couple of minutes the first time."},
            {"cmd": "kind load docker-image my-site:1.0 --name devops-practice",
             "out": ["Image: \"my-site:1.0\" loaded into cluster \"devops-practice\""],
             "note": "The cluster cannot see your local images by itself — copy yours in. The real output also shows the image id."},
            {"cmd": "cat > deployment.yaml << 'EOF'\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-site\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n        - name: web\n          image: my-site:1.0\n          ports:\n            - containerPort: 80\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "A Deployment says: keep one copy of my app running. The first name in the file is the app's name."},
            {"cmd": "kubectl apply -f deployment.yaml",
             "out": ["deployment.apps/my-site created"]},
            {"cmd": "kubectl get pods",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          0s"],
             "note": "1/1 means one copy running out of one wanted. The pod name ends in a short random part — yours will differ from the lab's example."},
            {"cmd": "kubectl describe pod my-site-abc12",
             "out": ["Name:             my-site-abc12",
                     "Namespace:        default",
                     "Status:           Running",
                     "IP:               10.244.0.5",
                     "Containers:",
                     "  my-site:",
                     "    Image:          my-site:1.0",
                     "    Port:           80/TCP",
                     "    State:          Running"]},
            {"cmd": "kubectl port-forward service/my-site 8080:80",
             "out": ["Forwarding from 127.0.0.1:8080 -> 80",
                     "Forwarding from [::1]:8080 -> 80"],
             "note": "This opens a door from your machine to the app, so you can open it in a browser."},
            {"cmd": "kubectl delete pod my-site-abc12",
             "out": ["pod \"my-site-abc12\" deleted"],
             "note": "You just killed your app's only copy. Watch what happens next."},
            {"cmd": "kubectl get pods",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          0s"],
             "note": "The Deployment made a new copy by itself. That is the whole idea."},
            {"cmd": "kubectl scale deployment my-site --replicas=3",
             "out": ["deployment.apps/my-site scaled"],
             "note": "Intermediate — three copies instead of one. If one crashes, two still answer."},
            {"cmd": "kubectl get pods",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          0s",
                     "my-site-def34     1/1     Running   0          0s",
                     "my-site-ghi56     1/1     Running   0          0s"],
             "note": "Three copies, all Running."},
            {"cmd": "kubectl set image deployment/my-site web=my-site:2.0",
             "out": ["deployment.apps/my-site image updated"],
             "note": "Swap the app to version 2.0. The old copies are replaced one by one, so the site never goes down."},
            {"cmd": "kubectl rollout status deployment/my-site",
             "out": ["deployment \"my-site\" successfully rolled out"],
             "note": "The rollout finished — all three copies run the new version."},
            {"cmd": "kubectl get deployments",
             "out": ["NAME      READY   UP-TO-DATE   AVAILABLE   AGE",
                     "my-site   3/3     3            3           0s"],
             "note": "3/3 ready — three copies, all up to date."},
            {"cmd": "kubectl describe deployment my-site",
             "out": ["Name:                   my-site",
                     "Namespace:              default",
                     "Replicas:               3 desired | 3 updated | 3 total | 3 available",
                     "StrategyType:           RollingUpdate",
                     "Pod Template:",
                     "  Containers:",
                     "   my-site:",
                     "    Image:      my-site:2.0",
                     "    Port:       80/TCP"],
             "note": "The deploy now says image my-site:2.0 and 3 replicas. That is the proof."},
            {"cmd": "cat > web-app.yaml << 'EOF'\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web-app\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n        - name: web\n          image: my-site:1.0\n          env:\n            - name: DB_HOST\n              value: db-wrong-host\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Advanced — a second app, with one wrong value: the database host is db-wrong-host, which does not exist."},
            {"cmd": "kubectl apply -f web-app.yaml",
             "out": ["deployment.apps/web-app created"]},
            {"cmd": "kubectl get pods",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          0s",
                     "my-site-def34     1/1     Running   0          0s",
                     "my-site-ghi56     1/1     Running   0          0s",
                     "web-app-abc12     0/1     CrashLoopBackOff 3          0s"],
             "note": "0/1 and CrashLoopBackOff — the new pod starts, crashes at once, and tries again. Something in it is wrong."},
            {"cmd": "kubectl logs deployment/web-app",
             "out": ["Starting web server on port 80",
                     "Error: dial tcp: lookup db-wrong-host on 10.96.0.10:53: no such host"],
             "note": "The log names the fault: it tried to reach db-wrong-host, and that name does not exist."},
            {"cmd": "kubectl edit deployment web-app",
             "out": ["deployment.apps/web-app edited"],
             "note": "Open the deploy in the editor and change DB_HOST from db-wrong-host to postgres-service, then save."},
            {"cmd": "kubectl get pods -w",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          0s",
                     "my-site-def34     1/1     Running   0          0s",
                     "my-site-ghi56     1/1     Running   0          0s",
                     "web-app-abc12     1/1     Running   0          0s"],
             "note": "The new pod is Running, 1/1. The fix worked — that is the proof. -w watches, so you see it turn Running live."},
        ],
    },
    "p2-break-fix": {
        "title": "Break-and-Fix Simulation — Break It, Then Fix It",
        "intro": ("On-call work is mostly this: something breaks, you read "
                  "the message, you fix the one thing that is wrong. This "
                  "practice terminal breaks six small things on purpose, "
                  "and you fix each one."),
        "proof": ("Save the six fixes: the right image name, a container "
                  "that stays up, a test file that exists, a merged file, "
                  "an open door, and a Dockerfile that copies a file that "
                  "is really there."),
        "steps": [
            {"cmd": "docker run -d --name broken-web nginxg",
             "out": ["Unable to find image 'nginxg:latest' locally",
                     "docker: Error response from daemon: pull access denied for nginxg, repository does not exist or may require 'docker login': denied: requested access to the resource is denied."],
             "note": "Lab 1 — nginxg is a typing mistake on purpose. Read the error: the image does not exist."},
            {"cmd": "docker ps -a",
             "out": ["No containers are running yet. Run docker compose up -d first."],
             "note": "Nothing here — the bad image never made a container."},
            {"cmd": "docker run -d --name working-web nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "Same command, the real image name."},
            {"cmd": "docker ps",
             "out": ["working-web  Up"],
             "note": "The container runs."},
            {"cmd": "docker run --name dying-app ubuntu badcommand",
             "out": ["Unable to find image 'badcommand:latest' locally",
                     "docker: Error response from daemon: pull access denied for badcommand, repository does not exist or may require 'docker login': denied: requested access to the resource is denied."],
             "note": "Lab 2 — in the real lab the container starts, then dies at once. This practice terminal stops a step earlier: it reads the last word as the image name. The fix is the same either way."},
            {"cmd": "docker run -d --name living-app ubuntu",
             "out": ["(a long container id — yours will be different)"],
             "note": "A container lives only as long as its main program runs. In the real lab you give it a waiting program, like sleep 1000."},
            {"cmd": "docker ps",
             "out": ["working-web  Up", "living-app  Up"],
             "note": "Two containers, both up."},
            {"cmd": "cat run-tests.sh",
             "out": ["cat: run-tests.sh: No such file or directory"],
             "note": "Lab 3 — the pipeline tried to run this file and it was not there. That is the whole failure."},
            {"cmd": "cat > run-tests.sh << 'EOF'\n#!/bin/bash\ntest -f index.html\ngrep -q \"My site\" index.html\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "A tiny test: the site file must exist, and it must hold the heading."},
            {"cmd": "chmod +x run-tests.sh",
             "out": ["(no output — that is normal)"],
             "note": "Make it runnable, or the pipeline cannot run it."},
            {"cmd": "./run-tests.sh",
             "out": ["Running tests...", "All tests passed."],
             "note": "The pipeline would go green now."},
            {"cmd": "git merge feature",
             "out": ["Auto-merging notes.txt",
                     "CONFLICT (content): Merge conflict in notes.txt",
                     "Automatic merge failed; fix conflicts and then commit the result."],
             "note": "Lab 4 — both lines changed the same line in notes.txt. Git stops and asks you to choose."},
            {"cmd": "cat > notes.txt << 'EOF'\nLine one, fixed after the merge\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "Write the line you want to keep."},
            {"cmd": "git add notes.txt",
             "out": ["(no output — that is normal)"],
             "note": "Adding the file tells Git the conflict is fixed."},
            {"cmd": "git commit -m \"Fix merge conflict\"",
             "out": ["[main e4f5a6b] Fix merge conflict",
                     " 1 file changed, 1 insertion(+)"],
             "note": "Merged, by hand."},
            {"cmd": "docker run -d --name quiet-web nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "Lab 5 — no -p this time. That is the mistake, on purpose."},
            {"cmd": "docker ps",
             "out": ["working-web  Up", "living-app  Up", "quiet-web  Up"],
             "note": "It is running — but no door into it is open. In the real lab the PORTS column is empty, and that is the clue."},
            {"cmd": "docker stop quiet-web",
             "out": ["quiet-web"]},
            {"cmd": "docker rm quiet-web",
             "out": ["quiet-web"],
             "note": "Remove it, then run it again with the door open."},
            {"cmd": "docker run -d -p 8080:80 --name quiet-web nginx",
             "out": ["(a long container id — yours will be different)"],
             "note": "Same container, this time with door 8080 opened."},
            {"cmd": "curl http://localhost:8080",
             "out": ["Welcome to nginx!",
                     "If you see this page, the nginx web server is successfully installed."],
             "note": "The welcome page appears. The app was fine all along — the door was missing."},
            {"cmd": "cat Dockerfile",
             "out": ["FROM nginx",
                     "COPY app.html /usr/share/nginx/html/app.html"],
             "note": "Lab 6 — the Dockerfile asks for app.html. Check what is actually in the folder."},
            {"cmd": "ls",
             "out": ["notes.txt  Dockerfile  index.html  run-tests.sh"],
             "note": "index.html is here. app.html is not — that is the whole failure."},
            {"cmd": "cat > Dockerfile << 'EOF'\nFROM nginx\nCOPY index.html /usr/share/nginx/html/index.html\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "The honest fix: copy the file that exists."},
            {"cmd": "cat Dockerfile",
             "out": ["FROM nginx",
                     "COPY index.html /usr/share/nginx/html/index.html"],
             "note": "In the real lab the build passes now."},
        ],
    },
    "p2-cheat-sheets": {
        "title": "Cheat Sheets Simulation — The Commands You Will Actually Use",
        "intro": ("A cheat sheet is only useful if your hands know the "
                  "commands, not just your eyes. This practice terminal "
                  "runs the most-used commands from the sheets against a "
                  "real practice state, so you can see what each one "
                  "answers."),
        "proof": ("Save the answers: disk and memory, the containers, the "
                  "pod, the clean Git state, the main store, and the empty "
                  "file store. One page of commands, all answered."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["✔ Container kafka-a  Started",
                     "✔ Container pg-primary  Started",
                     "✔ Container redis-a  Started",
                     "✔ Container moto-a  Started",
                     "✔ Container awscli  Started"]},
            {"cmd": "df -h",
             "out": ["Filesystem    Size   Used   Avail  Use% Mounted on",
                     "/dev/sda1     20G    8.5G   11G    44%  /",
                     "tmpfs         3.9G   0      3.9G   0%   /dev/shm"],
             "note": "How much disk is left. 44% used — room to spare."},
            {"cmd": "free -h",
             "out": ["               total        used        free      shared  buff/cache   available",
                     "Mem:           7.7Gi       1.2Gi       4.9Gi       210Mi       1.6Gi       6.2Gi",
                     "Swap:          2.0Gi          0B       2.0Gi"],
             "note": "How much memory is left."},
            {"cmd": "docker ps -a",
             "out": ["kafka-a  Up", "pg-primary  Up", "redis-a  Up",
                     "moto-a  Up", "awscli  Up"],
             "note": "Every container, running or stopped. -a shows stopped ones too."},
            {"cmd": "kubectl get pods",
             "out": ["NAME              READY   STATUS    RESTARTS   AGE",
                     "my-site-abc12     1/1     Running   0          5m"],
             "note": "The app on the small cluster: one copy, running."},
            {"cmd": "git status",
             "out": ["On branch main",
                     "nothing to commit, working tree clean"],
             "note": "Nothing waiting to be saved."},
            {"cmd": "docker exec redis-a redis-cli INFO replication",
             "out": ["# Replication",
                     "role:master",
                     "connected_slaves:1",
                     "master_replid:abc123def456",
                     "master_repl_offset:0"],
             "note": "role:master means this store is the main one, with one copy following it."},
            {"cmd": "docker compose exec awscli aws --endpoint-url http://moto-a:5000 s3 ls",
             "out": ["(empty — no buckets yet, no error)"],
             "note": "An empty answer with no error means the store is up — it just holds nothing yet."},
        ],
    },
    "p2-interview": {
        "title": "Interview Pack Simulation — Answer With a Command",
        "intro": ("Interview questions for support jobs are really just "
                  "broken things in disguise — they ask what you would type "
                  "first. This practice terminal gives you four of those "
                  "moments and lets you answer with a real command."),
        "proof": ("Save the four answers: the process list, the stopped "
                  "container, the pod that has not restarted, and the "
                  "promoted standby. Each one is the answer to a real "
                  "interview question."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["✔ Container pg-primary  Started",
                     "✔ Container pg-replica  Started"]},
            {"cmd": "ps aux",
             "out": ["USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
                     "learner        1  0.0  0.1   1234   512 ?        Ss   09:00   0:00 /bin/bash",
                     "learner       42  0.0  0.2   5678  1024 ?        S    09:01   0:00 nginx: worker process",
                     "learner      101  0.1  0.3   9100  2048 ?        Sl   09:02   0:01 node server.js"],
             "note": "Question: the site is slow. This is the first command to type — it lists every program and how much CPU each one uses."},
            {"cmd": "docker run -d --name dying-app ubuntu",
             "out": ["(a long container id — yours will be different)"],
             "note": "Question: a container keeps dying. First make the problem real: run one, then stop it."},
            {"cmd": "docker stop dying-app",
             "out": ["dying-app"]},
            {"cmd": "docker ps -a",
             "out": ["pg-primary  Up", "pg-replica  Up", "dying-app  Exited"],
             "note": "Exited — there it is. A stopped container still shows up with -a."},
            {"cmd": "docker logs dying-app",
             "out": ["(no logs yet — this service prints nothing)"],
             "note": "In the real lab the log shows the error that killed it. Here the container printed nothing — no log lines to read, which is itself an answer."},
            {"cmd": "kubectl describe pod my-site-abc12",
             "out": ["Name:             my-site-abc12",
                     "Namespace:        default",
                     "Status:           Running",
                     "IP:               10.244.0.5",
                     "Containers:",
                     "  my-site:",
                     "    Image:          nginx:1.25",
                     "    Port:           80/TCP",
                     "    State:          Running"],
             "note": "Question: a pod keeps crashing. Describe it — the state and the restart count tell you where to look next."},
            {"cmd": "kubectl logs my-site-abc12 --previous",
             "out": ["(no previous log — this container has not restarted)"],
             "note": "The last run's log, from before the crash. Here there is none — the container has not restarted yet."},
            {"cmd": "docker exec pg-replica psql -U learner -d practice -c \"SELECT pg_promote();\"",
             "out": [" pg_promote", "------------", " t"],
             "note": "Question: the main database is down. Promote the standby. t means true — it worked."},
        ],
    },
    "p2-portfolio": {
        "title": "Portfolio Projects Simulation — Proof, Not Just Notes",
        "intro": ("A portfolio is proof, not notes: running things an "
                  "interviewer can check. This practice terminal walks "
                  "through the three proof projects — a pipeline, "
                  "infrastructure as code, and monitoring — and checks each "
                  "one works."),
        "proof": ("Save the three proofs: the commit that added the "
                  "pipeline, the plan that adds 2 things, and the "
                  "monitoring answer with its targets up."),
        "steps": [
            {"cmd": "mkdir -p .github/workflows",
             "out": ["(no output — that is normal)"],
             "note": "Project 2 — a pipeline that tests, then builds. First make the folder for the workflow file."},
            {"cmd": "cat > .github/workflows/build.yml << 'EOF'\nname: build\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Test the site\n        run: test -f index.html\nEOF",
             "out": ["(no output — the file is written)"],
             "note": "The pipeline tests the site first, then builds the image. A broken site never gets built."},
            {"cmd": "git init",
             "out": ["Initialized empty Git repository in /home/learner/.git/"]},
            {"cmd": "git add .",
             "out": ["(no output — that is normal)"],
             "note": "Stage everything for the first commit."},
            {"cmd": "git commit -m \"Add CI workflow\"",
             "out": ["[main a1b2c3d] Add CI workflow",
                     " 4 files changed, 4 insertions(+)"],
             "note": "The pipeline file is saved. In the real project you push it and watch it go green."},
            {"cmd": "terraform init",
             "out": ["Initializing the backend...",
                     "",
                     "Initializing provider plugins...",
                     "- Finding latest version of hashicorp/docker...",
                     "- Installing hashicorp/docker v3.0.2...",
                     "- Installed hashicorp/docker v3.0.2",
                     "",
                     "Terraform has been successfully initialized!"],
             "note": "Project 3 — infrastructure as code. Init downloads the Docker provider the file asks for."},
            {"cmd": "terraform plan",
             "out": ["Terraform will perform the following actions:",
                     "",
                     "  # docker_container.web will be created",
                     "  + resource \"docker_container\" \"web\" {",
                     "      + image = \"nginx:1.25\"",
                     "      + name  = \"web\"",
                     "    }",
                     "",
                     "Plan: 2 to add, 0 to change, 0 to destroy."],
             "note": "Plan: 2 to add. Nothing is made yet — a plan only shows what would happen."},
            {"cmd": "docker compose up -d",
             "out": ["✔ Container prometheus  Started",
                     "✔ Container grafana  Started"],
             "note": "The monitoring stack: Prometheus watches, Grafana draws the graphs."},
            {"cmd": "curl http://localhost:9090/api/v1/targets",
             "out": ["{",
                     "  \"status\": \"success\",",
                     "  \"targets\": \"up\"",
                     "}"],
             "note": "Prometheus answers, and its targets are up. That is the proof the monitoring works."},
        ],
    },
    "p2-resume": {
        "title": "Resume Bullets Simulation — Prove Every Bullet",
        "intro": ("A resume bullet is only true if you can show the proof "
                  "behind it. This practice terminal checks each bullet "
                  "from the resume lesson with the command that proves it."),
        "proof": ("Save the five proofs: the site answering, the pipeline "
                  "commit, the plan, the monitoring answer, and the "
                  "two-member cluster. Each one backs a bullet on your "
                  "resume."),
        "steps": [
            {"cmd": "docker compose up -d",
             "out": ["✔ Container kafka-a  Started",
                     "✔ Container kafka-b  Started",
                     "✔ Container pg-primary  Started",
                     "✔ Container pg-replica  Started",
                     "✔ Container redis-a  Started",
                     "✔ Container moto-a  Started",
                     "✔ Container awscli  Started",
                     "✔ Container lb  Started",
                     "✔ Container web1  Started",
                     "✔ Container web2  Started",
                     "✔ Container web3  Started"]},
            {"cmd": "curl http://localhost:8080/",
             "out": ["Hostname: web1"],
             "note": "Bullet 1 — a website in a container. The site answers."},
            {"cmd": "git log --oneline",
             "out": ["a1b2c3d Add CI workflow", "e4f5a6b Add site files"],
             "note": "Bullet 2 — a pipeline that tests and builds. The commit that added the workflow is here."},
            {"cmd": "terraform init",
             "out": ["Initializing the backend...",
                     "",
                     "Initializing provider plugins...",
                     "- Finding latest version of hashicorp/docker...",
                     "- Installing hashicorp/docker v3.0.2...",
                     "- Installed hashicorp/docker v3.0.2",
                     "",
                     "Terraform has been successfully initialized!"],
             "note": "Bullet 3 — infrastructure as code, plus monitoring. Init first — a plan before init is an error."},
            {"cmd": "terraform plan",
             "out": ["Terraform will perform the following actions:",
                     "",
                     "  # docker_container.web will be created",
                     "  + resource \"docker_container\" \"web\" {",
                     "      + image = \"nginx:1.25\"",
                     "      + name  = \"web\"",
                     "    }",
                     "",
                     "Plan: 2 to add, 0 to change, 0 to destroy."],
             "note": "The file describes real containers. Plan: 2 to add."},
            {"cmd": "curl http://localhost:9090/api/v1/targets",
             "out": ["{",
                     "  \"status\": \"success\",",
                     "  \"targets\": \"up\"",
                     "}"],
             "note": "And the monitoring answers too — its targets are up."},
            {"cmd": "docker exec kafka-b /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list",
             "out": ["heartbeats"],
             "note": "Bullet 4 — the mirror copy. Cluster b is alive: its own heartbeat topic is here, and the mirror copies orders into a.orders when you send them."},
            {"cmd": "curl http://localhost:8008/cluster",
             "out": ["{ \"members\": [",
                     "  {\"name\": \"patroni-1\", \"role\": \"leader\"},",
                     "  {\"name\": \"patroni-2\", \"role\": \"replica\"} ] }"],
             "note": "Bullet 5 — the database failover. Two members, one leader. That is the proof the standby is watching."},
            {"cmd": "cat project_summary.log",
             "out": ["Project: order pipeline demo",
                     "Tools: Docker Compose, Kafka, PostgreSQL, Redis, Moto, NGINX, Python",
                     "Actions: configured Patroni failover, deployed NGINX across 3 backends, built a CI pipeline",
                     "Results: 0 data loss on failover, 0 downtime when a backend stopped, pipeline green"],
             "note": "Advanced — the project log: what you built, with what, and what happened. Every resume bullet comes from these lines."},
            {"cmd": "python3 check_resume.py",
             "out": ["PASSED: 3/3 resume bullets match the Action + Tool + Outcome structure."],
             "note": "The check passes: each bullet says what you did, with what tool, and what it achieved. That is the proof."},
        ],
    },
    "p2-best-sites": {
        "title": "Best Sites Simulation — Ask the Tools for Help",
        "intro": ("Every tool has a built-in help book — you never have to "
                  "memorise every flag. This practice terminal practises "
                  "asking four tools for their own help, so you know where "
                  "to look next time."),
        "proof": ("Save the four help screens. Next time you forget a "
                  "command, you know the one line that shows you how."),
        "steps": [
            {"cmd": "docker --help",
             "out": ["Usage:  docker [OPTIONS] COMMAND",
                     "",
                     "Commands:",
                     "  compose     Define and run multi-container applications with Docker",
                     "  exec        Execute a command in a running container",
                     "  images      List images",
                     "  logs        Fetch the logs of a container",
                     "  ps          List containers",
                     "  rm          Remove one or more containers",
                     "  run         Run a command in a new container",
                     "  start       Start one or more stopped containers",
                     "  stop        Stop one or more running containers",
                     "  version     Show the Docker version information",
                     "",
                     "Run 'docker COMMAND --help' for more information on a command."],
             "note": "Docker's own help: every command it knows, on one screen."},
            {"cmd": "kubectl --help",
             "out": ["kubectl controls the Kubernetes cluster manager.",
                     "",
                     "Basic Commands:",
                     "  get           Display one or many resources",
                     "  apply         Apply a configuration to a resource",
                     "  edit          Edit a resource (the practice editor fixes it)",
                     "  scale         Scale a deployment to more or fewer copies",
                     "  set image     Swap a deployment to a new image version",
                     "  delete        Delete resources",
                     "  describe      Show details of a specific resource",
                     "  logs          Print the logs for a container in a pod",
                     "  port-forward  Forward one or more local ports to a pod",
                     "  rollout       Manage the rollout of a resource",
                     "  version       Print the client and server version information"],
             "note": "kubectl's help: get, apply, describe, logs — the ones you will use most."},
            {"cmd": "git --help",
             "out": ["usage: git <command> [<args>]",
                     "",
                     "Commands this practice terminal understands:",
                     "  init, status, add, commit, log, branch, checkout, merge, clone, config, push, pull"],
             "note": "Git's help: the short list of commands this terminal answers."},
            {"cmd": "terraform --help",
             "out": ["Usage: terraform [global options] <subcommand> [args]",
                     "",
                     "Common commands:",
                     "  init       Prepare your working directory for other commands",
                     "  plan       Show changes required by the current configuration",
                     "  apply      Create or update infrastructure",
                     "  destroy    Destroy previously-created infrastructure"],
             "note": "Terraform's help: four commands, in the order you run them."},
        ],
    },

    "linux-basics": {
        "title": "Linux Command Line — Your First 12 Commands",
        "intro": ("Every server in the world runs Linux. Here you practise "
                  "the 12 commands you will use every single day: look "
                  "around, make folders, create and copy files, and clean "
                  "up. Nothing can break — this is a safe practice terminal "
                  "in your browser."),
        "proof": ("Save the final ls output. It proves you can move around "
                  "and manage files on a Linux machine."),
        "steps": [{'cmd': 'pwd',
  'note': "pwd = 'print working directory'. It tells you which folder you are standing in.",
  'out': ['/home/learner']},
 {'cmd': 'ls',
  'note': "ls = 'list'. It shows what is inside the current folder.",
  'out': ['readme.txt']},
 {'cmd': 'cat readme.txt',
  'note': 'cat shows the text inside a file.',
  'out': ['Welcome to Linux!', 'This file lives in your home folder.']},
 {'cmd': 'mkdir projects',
  'note': "mkdir = 'make directory'. A directory is just a folder.",
  'out': ['(no output — that is normal)']},
 {'cmd': 'cd projects',
  'note': "cd = 'change directory'. You are now inside the projects folder.",
  'out': ['(no output — that is normal)']},
 {'cmd': 'touch notes.txt',
  'note': 'touch creates a new empty file.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'echo "hello devops" > notes.txt',
  'note': 'echo prints text. The > arrow sends that text into a file instead of the screen.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'cat notes.txt',
  'note': 'Read it back — your text is saved in the file.',
  'out': ['hello devops']},
 {'cmd': 'cp notes.txt backup.txt',
  'note': "cp = 'copy'. Now you have two files with the same text.",
  'out': ['(no output — that is normal)']},
 {'cmd': 'mv backup.txt old-notes.txt',
  'note': "mv = 'move'. It also renames a file.",
  'out': ['(no output — that is normal)']},
 {'cmd': 'ls',
  'note': 'You should see notes.txt and old-notes.txt.',
  'out': ['notes.txt  old-notes.txt']},
 {'cmd': 'rm old-notes.txt',
  'note': "rm = 'remove'. There is no recycle bin in Linux — deleted means gone, so be careful.",
  'out': ['(no output — that is normal)']},
 {'cmd': 'cd ..',
  'note': "'..' means 'one folder up'. You are back in your home folder.",
  'out': ['(no output — that is normal)']}],
    },
    "git-basics": {
        "title": "Git — Save and Track Your Work",
        "intro": ("Git is the tool every developer and DevOps engineer uses "
                  "to save versions of their work, undo mistakes and work "
                  "in a team. In this practice terminal you create a "
                  "repository, make commits, branch off safely, and merge "
                  "back."),
        "proof": ("Save the output of git log. It proves you made real "
                  "commits."),
        "steps": [{'cmd': 'git init',
  'note': 'Turns this folder into a Git repository — a folder Git watches.',
  'out': ['Initialized empty Git repository in /home/learner/.git/']},
 {'cmd': 'git config user.name "Learner"',
  'note': 'Tell Git your name. Every save (commit) records who made it.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'git config user.email "learner@example.com"',
  'note': 'And your email.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'echo "my first file" > app.txt',
  'note': 'Create a file to track.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'git status',
  'note': 'status shows what changed. app.txt is new and not saved yet.',
  'out': ['On branch main', 'nothing to commit, working tree clean']},
 {'cmd': 'git add app.txt',
  'note': "add puts the file in the 'to be saved' box (the staging area).",
  'out': ['(no output — that is normal)']},
 {'cmd': 'git commit -m "Add app.txt"',
  'note': 'commit saves a snapshot with a short message. This is your first version.',
  'out': ['[main a1b2c3d] Add app.txt', ' 1 file changed, 1 insertion(+)']},
 {'cmd': 'git log',
  'note': 'log lists all saved versions, newest first.',
  'out': ['a1b2c3d Add app.txt']},
 {'cmd': 'git branch feature',
  'note': 'A branch is a safe copy to try ideas without touching your main work.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'git checkout feature',
  'note': 'Switch to the feature branch.',
  'out': ["Switched to branch 'feature'"]},
 {'cmd': 'echo "new idea" > idea.txt',
  'note': 'Work on the branch.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'git add idea.txt',
  'note': 'Stage the new file.',
  'out': ['(no output — that is normal)']},
 {'cmd': 'git commit -m "Add idea.txt"',
  'note': 'Save it on the feature branch.',
  'out': ['[feature e4f5a6b] Add idea.txt', ' 1 file changed, 1 insertion(+)']},
 {'cmd': 'git checkout main',
  'note': 'Go back to main. Your idea is not here yet.',
  'out': ["Switched to branch 'main'"]},
 {'cmd': 'git merge feature',
  'note': "merge brings the feature branch's work into main.",
  'out': ["Merge made by the 'ort' strategy.", ' app.py | 1 +', ' 1 file changed, 1 insertion(+)']},
 {'cmd': 'git log',
  'note': 'Both commits are now in main. That is the whole core workflow.',
  'out': ["c7d8e9f Merge branch 'feature'", 'e4f5a6b Add idea.txt', 'a1b2c3d Add app.txt']}],
    },
}

# ---------------------------------------------------------------- assets
CSS = """/* DevOps Kit — Gemini "Mobile Design Spec" implementation.
   Tokens, type scale, radii and shadows per the spec. Zero heavy
   assets: inline SVG only, no raster images, no external fonts. */
:root {
  --ink: #14161a;
  --canvas: #fafafa;
  --card: #ffffff;
  --body: #242933;
  --muted: #525866;
  --hair: #e2e5ec;
  --blue: #0b5fff;
  --blue-dark: #0847c4;
  --amber: #f0b429;
  --green: #16a34a;
  --mint: #f0fdf4;
  --red: #ef4444;
  --red-soft: #fca5a5;
  --shadow-card: 0 1px 3px rgba(20, 22, 26, 0.06), 0 1px 2px rgba(20, 22, 26, 0.04);
  --shadow-float: 0 8px 24px rgba(20, 22, 26, 0.12);
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body { margin: 0; font-family: var(--sans); color: var(--body); background: var(--canvas); line-height: 1.55; font-size: 15px; }
a { color: var(--blue); }
img { max-width: 100%; }
code { background: #f1f3f7; padding: 2px 5px; border-radius: 4px; font-size: 13.5px; font-family: var(--mono); color: var(--ink); overflow-wrap: anywhere; }
pre { overflow-x: auto; max-width: 100%; }
h2 { margin: 0 0 10px; font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
h3 { margin: 24px 0 8px; font-size: 16px; line-height: 1.35; font-weight: 700; color: var(--ink); }
hr { border: none; border-top: 1px solid var(--hair); margin: 2em 0; }
table { border-collapse: collapse; width: 100%; overflow-x: auto; display: block; }
td, th { border: 1px solid var(--hair); padding: 8px 10px; text-align: left; vertical-align: top; }
th { background: #f2f2f7; }

/* ---------- buttons (min-height 44px, radius 10px, 600, 14.5px) ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--blue); color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 14.5px; text-align: center; min-height: 44px; border: 1px solid var(--blue); cursor: pointer; transition: transform 100ms cubic-bezier(0.2, 0, 0, 1), background 100ms ease; }
.btn:active { background: var(--blue-dark); transform: scale(0.985); }
.btn.secondary { background: #fff; color: var(--ink); border: 1px solid #d0d5dd; }
.btn.secondary:active { background: #f3f4f6; transform: scale(0.985); }
.btn.amber { background: var(--amber); color: var(--ink); border: 1px solid var(--amber); }
.btn.amber:active { background: #d99a06; transform: scale(0.985); }
.btn.disabled { background: #eef0f4; color: #667085; border: 1px dashed #cbd2df; cursor: not-allowed; opacity: 1; }
.btn.disabled:active { transform: none; }

/* ---------- sticky site header (56px, landing) ---------- */
.site-header { position: sticky; top: 0; z-index: 50; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 16px; background: rgba(250, 250, 250, 0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid var(--hair); }
.site-header .wordmark { font-size: 16px; font-weight: 700; color: var(--ink); text-decoration: none; letter-spacing: -0.01em; white-space: nowrap; }
.site-header .wordmark small { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 4px; }
.bill-pill { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--ink); background: var(--amber); border-radius: 9999px; padding: 6px 10px; white-space: nowrap; }

/* ---------- hero ---------- */
.hero { padding: 24px 16px 32px; background: var(--canvas); background-image: radial-gradient(420px 220px at 8% 0%, rgba(11, 95, 255, 0.06), transparent 70%), radial-gradient(420px 260px at 96% 100%, rgba(240, 180, 41, 0.08), transparent 70%); }
.hero-inner { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--blue); }
.hero h1 { margin: 0; font-size: 32px; line-height: 1.12; letter-spacing: -0.03em; font-weight: 800; color: var(--ink); }
.hero .subhead { margin: 0; font-size: 15px; line-height: 1.55; color: #424752; max-width: 62ch; }
.hero .cta { width: 100%; height: 48px; font-size: 15px; }
.hero-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { background: #fff; border: 1px solid var(--hair); color: var(--body); font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 9999px; box-shadow: var(--shadow-card); }

/* animated terminal mockup (fixed 210px so layout never shifts) */
.hero-term { margin-top: 8px; border-radius: 12px; background: var(--ink); height: 210px; overflow: hidden; box-shadow: var(--shadow-float); }
.hero-term-chrome { height: 32px; background: #1e2128; display: flex; align-items: center; gap: 6px; padding: 0 12px; }
.hero-term-chrome .dot { width: 8px; height: 8px; border-radius: 50%; background: #4b5262; flex-shrink: 0; }
.hero-term-chrome .fname { flex: 1; text-align: center; font-family: var(--mono); font-size: 11px; color: #8b949e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-term-body { padding: 12px 14px; font-family: var(--mono); font-size: 12.5px; line-height: 1.6; color: #f3f4f6; height: 178px; overflow: hidden; }
.ht-line { white-space: pre-wrap; overflow-wrap: anywhere; min-height: 20px; }
.ht-line .ht-prompt { color: var(--amber); }
.ht-line .ht-cmd { color: #f3f4f6; }
.ht-line .ht-muted { color: #9ca3af; }
.ht-line .ht-amber { color: var(--amber); }
.ht-line .ht-green { color: #34d399; }
.ht-line .ht-white { color: #f3f4f6; }
.ht-cursor { display: inline-block; width: 8px; height: 15px; background: var(--amber); vertical-align: -2px; animation: ht-blink 500ms steps(1) infinite; }
@keyframes ht-blink { 50% { opacity: 0; } }
.hero-term.fading .hero-term-body { opacity: 0; transition: opacity 300ms ease; }
.hero-term-body { transition: opacity 300ms ease; }

/* ---------- landing sections ---------- */
.wrap { max-width: 860px; margin: 0 auto; padding: 0 16px; }
.section { padding: 40px 0; }
.section > h2 { margin-bottom: 6px; }
.lead { color: var(--muted); font-size: 15px; margin: 0 0 16px; max-width: 62ch; }

/* how it works — vertical rail */
.rail { position: relative; margin: 20px 0 0; padding-left: 44px; }
.rail::before { content: ""; position: absolute; left: 13px; top: 14px; bottom: 14px; width: 2px; background: var(--hair); }
.rail-step { position: relative; margin-bottom: 28px; }
.rail-step:last-child { margin-bottom: 0; }
.rail-num { position: absolute; left: -44px; top: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--ink); color: #fff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid var(--ink); transition: border-color 180ms ease, box-shadow 180ms ease; }
.rail-step.active .rail-num { border-color: var(--blue); box-shadow: 0 0 0 4px rgba(11, 95, 255, 0.15); }
.rail-step b { display: block; font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 2px; }
.rail-step p { margin: 0; font-size: 15px; color: var(--body); }

/* skills grid */
.skills { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 16px; }
@media (min-width: 640px) { .skills { grid-template-columns: repeat(3, 1fr); } }
.skill { position: relative; background: #fff; border: 1px solid var(--hair); border-radius: 10px; padding: 14px 12px; overflow: hidden; box-shadow: var(--shadow-card); }
.skill::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--blue); }
.skill--data::before { background: var(--amber); }
.skill svg { width: 20px; height: 20px; stroke: var(--ink); margin-bottom: 8px; }
.skill b { display: block; font-size: 14px; font-weight: 600; color: var(--ink); }
.skill small { display: block; font-size: 12px; font-weight: 400; color: var(--muted); margin-top: 2px; }

/* sim deck — dark full-bleed, horizontal scroll-snap */
.simdeck { background: var(--ink); color: #fff; padding: 40px 0; }
.simdeck h2 { color: #fff; }
.simdeck .lead { color: #c7cbd1; }
.simdeck-scroll { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding: 4px 16px 16px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.simdeck-scroll::-webkit-scrollbar { display: none; }
.buygrid { display: grid; gap: 12px; margin-top: 16px; }
@media (min-width: 640px) { .buygrid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1100px) { .buygrid { grid-template-columns: repeat(4, 1fr); } }
.buycard { background: #1f232b; border: 1px solid #343a45; border-radius: 14px; padding: 18px; }
.buycard .buytag { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink); background: var(--amber); border-radius: 9999px; padding: 5px 10px; }
.buycard:first-child .buytag { background: #fff; }
.buycard .buyprice { font-size: 26px; font-weight: 800; color: #fff; margin: 12px 0 4px; }
.buycard .buyprice small { font-size: 13px; font-weight: 600; color: #c7cbd1; }
.buycard ul { margin: 6px 0 0; padding: 0; list-style: none; }
.buycard ul li { padding: 5px 0 5px 26px; position: relative; font-size: 15px; color: #e5e7eb; }
.buycard ul li::before { content: "✓"; position: absolute; left: 2px; color: var(--amber); font-weight: 800; }
.buy-note { color: #c7cbd1; font-size: 14px; line-height: 1.55; margin: 16px 0 0; max-width: 62ch; }
.simcard { min-width: 280px; scroll-snap-align: start; background: #1e2128; border: 1px solid #2e333f; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.simcard .steppill { display: inline-block; align-self: flex-start; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--amber); background: rgba(240, 180, 41, 0.12); border: 1px solid rgba(240, 180, 41, 0.3); border-radius: 9999px; padding: 4px 9px; }
.simcard .simpills { display: flex; gap: 6px; flex-wrap: wrap; }
.simcard .tierpill { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--amber); background: rgba(240, 180, 41, 0.12); border: 1px solid rgba(240, 180, 41, 0.3); border-radius: 9999px; padding: 4px 9px; }
.simcard .tierpill.free { color: var(--green); background: rgba(22, 163, 74, 0.12); border-color: rgba(22, 163, 74, 0.3); }
.simcard h3 { margin: 0; color: #fff; font-size: 16px; }
.simcard p { margin: 0; color: #c7cbd1; font-size: 14px; line-height: 1.5; flex: 1; }
.simprog { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; font-family: var(--mono); font-size: 11px; color: #8b949e; }
.simprog i { width: 10px; height: 10px; background: #2e333f; border-radius: 2px; display: inline-block; }
.simprog i.on { background: var(--amber); }
.simcard .btn { width: 100%; }

/* phase cards */
.cards { display: grid; gap: 16px; margin-top: 16px; }
@media (min-width: 640px) { .cards { grid-template-columns: 1fr 1fr; } }
.card { background: #fff; border: 1px solid #d0d5dd; border-radius: 14px; padding: 20px; display: flex; flex-direction: column; box-shadow: var(--shadow-card); }
.card.featured { border: 2px solid var(--ink); }
.card.bundle-wide { grid-column: 1 / -1; }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.card .tagline { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
.card .price { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: var(--ink); margin: 4px 0; }
.card .price small { font-size: 13px; font-weight: 600; color: var(--muted); }
.microbadge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--muted); border: 1px solid var(--hair); border-radius: 9999px; padding: 4px 9px; margin-bottom: 10px; align-self: flex-start; }
.card ul { margin: 6px 0 16px; padding: 0; list-style: none; }
.card ul li { padding: 5px 0 5px 26px; position: relative; font-size: 15px; }
.card ul li::before { content: "✓"; position: absolute; left: 2px; color: var(--blue); font-weight: 800; }
.card .btn { width: 100%; margin-top: auto; }
.paynote { font-size: 12px; color: var(--muted); margin: 10px 0 0; text-align: center; }

/* curriculum */
details.curriculum { background: #fff; border: 1px solid var(--hair); border-radius: 16px; margin: 12px 0; overflow: hidden; box-shadow: var(--shadow-card); }
details.curriculum summary { cursor: pointer; padding: 16px 18px; font-weight: 800; font-size: 15px; color: var(--ink); list-style: none; display: flex; justify-content: space-between; gap: 10px; align-items: center; min-height: 44px; }
details.curriculum summary::-webkit-details-marker { display: none; }
details.curriculum summary .meta { font-weight: 600; color: var(--muted); font-size: 13px; white-space: nowrap; }
details.curriculum summary .plus { font-size: 20px; font-weight: 400; color: var(--muted); transition: transform 180ms ease-out; flex-shrink: 0; }
details.curriculum[open ] summary .plus { transform: rotate(45deg); }
details.curriculum .cbody { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms ease-out; }
details.curriculum[open ] .cbody { grid-template-rows: 1fr; }
details.curriculum .cbody-inner { overflow: hidden; min-height: 0; }
.lesson-row { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; border-top: 1px solid #f2f2f7; }
.lesson-row .n { font-family: var(--mono); font-size: 12px; color: #667085; padding-top: 2px; flex-shrink: 0; }
.lesson-row .lr-main { flex: 1; min-width: 0; }
.lesson-row a { font-weight: 600; text-decoration: none; color: var(--ink); font-size: 14px; }
.lesson-row a:hover { color: var(--blue); }
.lesson-row .sub { font-size: 13px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
.lesson-row .ptag { font-size: 11px; font-weight: 700; color: var(--blue); background: #eef4ff; border-radius: 9999px; padding: 3px 8px; white-space: nowrap; margin-top: 2px; }
.lesson-row .rowtags { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.lesson-row .stag { font-size: 11px; font-weight: 700; color: #027a48; background: #ecfdf3; border-radius: 9999px; padding: 3px 8px; white-space: nowrap; margin-top: 2px; }
/* per-topic level ladders */
.ladder { background: #f8fafc; border: 1px solid var(--hair); border-radius: 12px; padding: 12px 14px; margin: 14px 0; }
.ladder .ladder-title { font-weight: 800; font-size: 14px; margin-bottom: 8px; }
.ladder .ladder-steps { display: flex; gap: 6px; flex-wrap: wrap; }
.ladder .step { font-size: 12px; font-weight: 700; border-radius: 9999px; padding: 4px 10px; background: #eef2f7; color: #475467; }
.ladder .step.done { background: #dcfce7; color: #027a48; }
.ladder .step.next { background: #fef3c7; color: #92400e; }
.ladder .step .here { font-weight: 800; color: #1d4ed8; }
.ladder .step-unit { display: inline-flex; align-items: center; gap: 6px; }
.ladder .ladder-arrow { color: var(--muted); font-weight: 800; align-self: center; }
.ladder .ladder-note { font-size: 13px; color: var(--muted); margin-top: 8px; line-height: 1.5; }
.ladder .ladder-note b { color: var(--ink); }
.levels-grid { display: grid; gap: 12px; }
.level-topic { background: #fff; border: 1px solid var(--hair); border-radius: 12px; padding: 14px 16px; }
.level-topic h3 { font-size: 15px; margin: 0 0 8px; }
.level-topic .lv { font-size: 13px; line-height: 1.5; margin: 6px 0; }
.level-topic .lv b { font-size: 12px; }
.level-topic .lv .soon { color: #92400e; font-weight: 700; }
.level-topic .lv .can { color: var(--muted); }
.pill { display: inline-block; background: #e6f7e6; color: #1d7a1d; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 9999px; margin-top: 4px; }
.pill.sim { background: #eef4ff; color: var(--blue); }

/* sticky bottom bar (landing only) */
.stickybar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; height: 64px; padding: 8px 16px; background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-top: 1px solid var(--hair); display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.stickybar .sb-prices { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1.35; white-space: nowrap; }
.stickybar .sb-prices small { display: block; font-size: 11px; font-weight: 400; color: #667085; }
.stickybar .btn { height: 44px; min-height: 44px; padding: 0 16px; font-size: 13px; flex-shrink: 0; }
.has-sticky footer.site { padding-bottom: 110px; }
footer.site { border-top: 1px solid var(--hair); padding: 22px 18px 40px; color: var(--muted); font-size: 13px; text-align: center; }
footer.site b { color: var(--ink); }

/* ---------- lesson (teaching) pages ---------- */
.lesson-header { position: sticky; top: 0; z-index: 50; background: rgba(250, 250, 250, 0.95); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 1px solid var(--hair); }
.lesson-header .lh-row { height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 16px; max-width: 640px; margin: 0 auto; }
.lesson-header .wordmark { font-size: 15px; font-weight: 700; color: var(--ink); text-decoration: none; white-space: nowrap; }
.lesson-header .lh-meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lesson-progress { height: 4px; background: var(--hair); }
.lesson-progress span { display: block; height: 100%; background: var(--blue); width: 0; transition: width 120ms ease-out; }
.lesson-wrap { max-width: 640px; margin: 0 auto; padding: 16px 16px 80px; }
.lesson-wrap h1 { font-size: 24px; line-height: 1.2; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); margin: 8px 0 6px; }
.lesson-wrap h2 { font-size: 18px; line-height: 1.3; font-weight: 700; margin-top: 28px; }
.lesson-wrap p, .lesson-wrap li { font-size: 16px; line-height: 1.65; color: var(--body); max-width: 62ch; }
.lesson-wrap p { margin: 0 0 14px; }
.lesson-wrap ul, .lesson-wrap ol { padding-left: 22px; margin: 0 0 14px; }
.lesson-wrap li { margin-bottom: 6px; }
.lesson-wrap blockquote { margin: 18px 0; padding: 14px 16px; border-radius: 10px; border-left: 4px solid var(--blue); background: #f2f7ff; font-size: 14.5px; line-height: 1.55; color: var(--ink); }
.phasebadge { display: inline-block; background: #eef4ff; color: var(--blue); font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; margin-bottom: 4px; }

/* callouts (exact spec) */
.callout { padding: 14px 16px; border-radius: 10px; border-left: 4px solid; margin: 18px 0; font-size: 14.5px; line-height: 1.55; }
.callout-title { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
.callout--tip { background: #f2f7ff; border-color: var(--blue); color: var(--ink); }
.callout--tip .callout-title { color: var(--blue); }
.callout--warn { background: #fffbeb; border-color: var(--amber); color: var(--ink); }
.callout--warn .callout-title { color: #9a6700; }
.callout--try { background: var(--ink); border-color: var(--amber); color: #f3f4f6; }
.callout--try .callout-title { color: var(--amber); }

/* unified command + expected output block */
.codeblock { border-radius: 10px; overflow: hidden; margin: 16px 0; border: 1px solid #2e333f; }
.codeblock-head { background: #1e2128; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; }
.codeblock-head .cb-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8b949e; }
.codeblock-head .cb-copy { height: 36px; min-height: 36px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #3a3f4b; background: #272b34; color: #e5e7eb; cursor: pointer; }
.codeblock-head .cb-copy:active { transform: scale(0.97); }
.codeblock pre { margin: 0; border-radius: 0; background: var(--ink); color: #f8fafc; padding: 12px 14px; font-size: 13px; font-family: var(--mono); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.codeblock pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
.codeblock-out { background: #1c2028; border-top: 1px solid #2e333f; padding: 10px 14px; }
.codeblock-out .out-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #8b949e; display: block; margin-bottom: 6px; }
.codeblock-out pre { background: none; padding: 0; color: #a3aab8; font-size: 12.5px; }

/* flow diagram component (vertical <640px, horizontal >=640px) */
.flow-diagram { display: flex; flex-direction: column; align-items: center; gap: 6px; background: #f8f9fb; border: 1px solid var(--hair); border-radius: 12px; padding: 16px; margin: 20px 0; }
.flow-node { width: 100%; max-width: 240px; background: #fff; border: 1.5px solid var(--ink); border-radius: 8px; padding: 10px 12px; text-align: center; }
.flow-node strong { display: block; font-size: 13.5px; color: var(--ink); }
.flow-node span { display: block; font-size: 11.5px; font-family: var(--mono); color: var(--muted); margin-top: 2px; }
.flow-arrow { font-size: 11px; font-family: var(--mono); color: var(--blue); font-weight: 600; padding: 2px 0; }
@media (min-width: 640px) {
  .flow-diagram { flex-direction: row; justify-content: space-between; }
  .flow-arrow { transform: rotate(-90deg); }
}

/* lesson pager */
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--hair); }
.pager a { background: #fff; border: 1px solid var(--hair); border-radius: 12px; padding: 12px 14px; text-decoration: none; color: var(--ink); font-weight: 600; font-size: 14px; min-height: 48px; display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow-card); }
.pager a.next { background: var(--blue); border-color: var(--blue); color: #fff; justify-content: flex-end; text-align: right; }
.pager a:active { transform: scale(0.985); }

/* ---------- simulation pages: split mobile layout ---------- */
.sim-shell { height: var(--sim-h, 100dvh); display: flex; flex-direction: column; background: var(--canvas); overflow: hidden; }
.sim-topbar { height: 44px; flex-shrink: 0; background: var(--ink); display: flex; align-items: center; gap: 10px; padding: 0 12px; }
.sim-topbar .exit { color: #9ca3af; text-decoration: none; font-size: 13px; white-space: nowrap; min-height: 44px; display: flex; align-items: center; }
.sim-topbar .sim-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-topbar .sim-prog-track { width: 72px; flex-shrink: 0; height: 4px; background: #2e333f; border-radius: 9999px; overflow: hidden; }
.sim-topbar .sim-prog-fill { display: block; height: 100%; background: var(--amber); width: 0; transition: width 200ms ease-out; }
.sim-about { flex-shrink: 0; margin: 0 12px; }
.sim-about summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); padding: 10px 2px; min-height: 44px; display: flex; align-items: center; list-style: none; }
.sim-about summary::-webkit-details-marker { display: none; }
.sim-about .about-body { font-size: 14px; color: var(--body); padding: 0 2px 12px; }
.sim-about .about-body p { margin: 0 0 10px; }
.simnote { background: #fff3cd; border: 1px solid #e6c65a; border-radius: 10px; padding: 12px 14px; margin: 0 0 10px; font-weight: 600; font-size: 14px; }

/* flow map as a compact horizontal chip strip */
.flowmap { display: flex; align-items: center; gap: 6px; overflow-x: auto; padding: 2px 12px 8px; flex-shrink: 0; scrollbar-width: none; }
.flowmap::-webkit-scrollbar { display: none; }
.mapbox { flex-shrink: 0; background: #fff; border: 2px solid #c9c2b2; border-radius: 10px; padding: 8px 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--ink); transition: background 300ms ease, border-color 300ms ease; }
.mapbox small { display: block; font-weight: 400; color: #666; font-size: 11px; }
.mapbox.lit { background: #fff3cd; border-color: var(--amber); }
.maparrow { color: #999; font-size: 13px; flex-shrink: 0; }

/* pinned step card */
.stepcard { flex-shrink: 0; background: #fff; border: 2px solid var(--blue); border-radius: 12px; padding: 14px 16px; margin: 0 12px 8px; box-shadow: 0 4px 12px rgba(20, 22, 26, 0.08); }
.stepcard .step-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.stepcount { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--blue); }
.hint-toggle { font-size: 12px; color: var(--muted); text-decoration: underline; background: none; border: none; cursor: pointer; padding: 6px 4px; min-height: 44px; }
.stepcard.hint-hidden .snote { display: none; }
#step-text { font-size: 14.5px; line-height: 1.45; color: var(--ink); margin-top: 6px; }
.stepcard .scmd { display: inline-block; font-family: var(--mono); background: #f1f3f7; padding: 6px 10px; border-radius: 6px; margin-top: 8px; font-size: 12.5px; color: var(--ink); cursor: pointer; overflow-wrap: anywhere; word-break: break-all; }
.stepcard .scmd::after { content: "  ↧ tap to fill"; font-size: 11px; color: var(--blue); font-weight: 600; }
.stepcard .snote { display: block; font-size: 13.5px; color: #444; margin-top: 8px; line-height: 1.5; }
.stepcard .stepactions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.stepcard button, .termbar button { font-size: 14px; padding: 10px 16px; border-radius: 9px; border: none; background: var(--blue); color: #fff; font-weight: 600; cursor: pointer; min-height: 44px; }
.stepcard button.ghost, .termbar button.ghost { background: #e8e4db; color: #1a1a1a; }
/* "Skip this step" must not look like the primary action — only
   "Skip all" was ghost before, so Skip read as the main button. */
#btn-skip { background: #e8e4db; color: #1a1a1a; }
.stepcard button:disabled, .termbar button:disabled { opacity: 0.45; cursor: default; }
.step-done-badge { display: none; margin-top: 10px; font-size: 13px; font-weight: 700; color: #15803d; }
.stepcard.done-flash { border-color: var(--green); background: var(--mint); animation: step-pulse 260ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.stepcard.done-flash .step-done-badge { display: block; }

/* keyboard-open: collapse the lesson card so the terminal gets room
   while typing on a phone. The command pill (#step-text) stays
   visible — the user must see what to type. */
.sim-shell.kbd-open .sim-about { display: none; }
.sim-shell.kbd-open .stepcard { padding: 8px 12px; margin-bottom: 6px; }
.sim-shell.kbd-open .stepcard .step-head { display: none; }
.sim-shell.kbd-open .stepcard .snote { display: none; }
.sim-shell.kbd-open .stepcard .stepactions { display: none; }
.sim-shell.kbd-open .stepcard .step-done-badge { display: none; }
.sim-shell.kbd-open #step-text { margin-top: 0; }
.sim-shell.kbd-open .stepcard .scmd { margin-top: 6px; }
@keyframes step-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.015); } 100% { transform: scale(1); } }

/* free play banner — dark gold badge card */
.freebanner { flex-shrink: 0; background: #1e2128; border: 1.5px solid var(--amber); color: #f3f4f6; border-radius: 12px; padding: 14px 16px; margin: 0 12px 8px; }
.freebanner b { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--amber); margin-bottom: 4px; }
.freebanner span { font-size: 14px; line-height: 1.5; }

/* terminal pane */
.terminal { flex: 1; min-height: 0; margin: 0 12px 12px; background: var(--ink); border-radius: 12px; border: 1px solid #2e333f; display: flex; flex-direction: column; overflow: hidden; }
.term-chrome { height: 44px; flex-shrink: 0; background: #1b1e24; border-bottom: 1px solid #2e333f; display: flex; align-items: center; gap: 8px; padding: 0 10px; }
.term-chrome .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
.term-chrome .container-name { font-family: var(--mono); font-size: 11.5px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.term-chrome .quickkeys { display: flex; gap: 6px; flex-shrink: 0; }
.term-chrome .quickkeys button { height: 36px; min-width: 44px; padding: 0 8px; font-size: 12px; font-weight: 600; font-family: var(--mono); border-radius: 6px; border: none; background: #272b34; color: #e5e7eb; cursor: pointer; }
.term-chrome .quickkeys button:active { background: #3a3f4b; }
.term-chrome .quickkeys button:disabled { opacity: 0.45; }
.term-out { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; font-family: var(--mono); font-size: 13px; line-height: 1.55; color: #e5e7eb; }
.tline { white-space: pre-wrap; overflow-wrap: anywhere; animation: tline-in 120ms ease-out; }
@keyframes tline-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.tline.cmd { color: #fff; }
.tline.cmd .tprompt { color: var(--amber); }
.tline.err { color: var(--red-soft); border-left: 2px solid var(--red); padding-left: 8px; margin: 2px 0; }
.tline.hint { color: var(--amber); }
.term-input-row { flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid #232730; background: #181b20; }
.term-input-row .tprompt { color: var(--amber); font-size: 14px; font-family: var(--mono); white-space: nowrap; }
#term-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-family: var(--mono); font-size: 16px; line-height: 1.5; min-width: 0; }
.termbar { display: none; }
.termhint { display: none; }
.simfoot { padding: 0 16px 20px; font-size: 14px; color: var(--body); }
.simfoot p { margin: 0 0 10px; }

/* ---------- lesson sidebar (W3Schools-style) ---------- */
.sidebar-toggle { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--hair); background: var(--card); color: var(--ink); font-size: 13px; font-weight: 700; font-family: var(--sans); cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.lesson-sidebar { display: none; }
.lesson-sidebar .sb-head { padding: 4px 14px 10px; border-bottom: 1px solid var(--hair); margin-bottom: 8px; }
.lesson-sidebar .sb-head b { display: block; font-size: 14px; color: var(--ink); }
.lesson-sidebar .sb-head span { font-size: 12px; color: var(--muted); }
.lesson-sidebar .sb-group { margin-bottom: 12px; }
.lesson-sidebar .sb-group-title { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 0 14px; margin-bottom: 4px; }
.lesson-sidebar a.sb-link { display: block; font-size: 14px; line-height: 1.4; color: var(--body); text-decoration: none; padding: 7px 14px 7px 17px; border-left: 3px solid transparent; }
.lesson-sidebar a.sb-link:hover { background: #f2f7ff; color: var(--ink); }
.lesson-sidebar a.sb-link.current { background: #eef4ff; color: var(--blue); font-weight: 700; border-left-color: var(--blue); }
@media (min-width: 1024px) {
  .sidebar-toggle { display: none; }
  .lesson-header .lh-row { max-width: 960px; }
  .lesson-wrap { max-width: 960px; display: flex; gap: 28px; align-items: flex-start; }
  .lesson-main { flex: 1; min-width: 0; }
  .lesson-sidebar { display: block; width: 240px; flex-shrink: 0; position: sticky; top: 64px; max-height: calc(100dvh - 80px); overflow-y: auto; }
}
@media (max-width: 1023px) {
  .lesson-sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; max-width: 85vw; z-index: 90; background: #fff; overflow-y: auto; padding: 16px 0; box-shadow: 0 0 40px rgba(0,0,0,0.25); }
  body.sidebar-open .lesson-sidebar { display: block; }
}

/* ---------- Try it Yourself (in-lesson, W3Schools-style) ---------- */
.tryit { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; background: #fffbeb; border: 1px solid #f2c94c; border-radius: 12px; padding: 14px 16px; margin: 18px 0; }
.tryit span { font-size: 14px; line-height: 1.5; color: var(--body); }

/* ---------- quick-check exercise (end of every lesson) ---------- */
.exercise { background: #f2f7ff; border: 1px solid #b9d0ff; border-radius: 14px; padding: 16px; margin: 28px 0 8px; }
.exercise h2 { margin-top: 0 !important; }
.exercise p { margin-bottom: 10px; }
.exercise code { font-family: var(--mono); background: #e8eefc; padding: 1px 5px; border-radius: 4px; font-size: 13.5px; white-space: pre-wrap; }
.exercise-answer summary { cursor: pointer; font-weight: 700; color: var(--blue); padding: 6px 0; min-height: 44px; }
.exercise-answer p { margin: 6px 0 0; }

/* ---------- motion: GPU only (transform / opacity) ---------- */
.btn, .pager a, .skill, .simcard { transition: transform 100ms cubic-bezier(0.2, 0, 0, 1); }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .ht-cursor { animation: none; opacity: 1; }
}
"""

# --- login / payment / resume chrome (added for the payment build) ---
AUTH_CSS = """
/* header sign-in slot */
.auth-slot { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; }
.auth-btn { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--hair); background: var(--card); color: var(--ink); font-size: 13px; font-weight: 600; font-family: var(--sans); cursor: pointer; white-space: nowrap; }
.auth-btn:active { background: #f1f3f7; }
.auth-chip { font-size: 13px; font-weight: 600; color: var(--muted); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.auth-signout { border: none; background: none; color: var(--blue); font-size: 13px; font-weight: 600; font-family: var(--sans); cursor: pointer; padding: 4px; white-space: nowrap; }
.lesson-header .lh-row { display: flex; align-items: center; gap: 10px; }
.lesson-header .lh-meta { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sim-topbar .auth-slot { margin-left: auto; }
.sim-topbar .auth-btn { height: 32px; background: #272b34; color: #e5e7eb; border: none; }
.sim-topbar .auth-chip { color: #9ca3af; }
.sim-topbar .auth-signout { color: var(--amber); }

/* shared header nav: home icon + back link on every page */
.nav-home { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; flex-shrink: 0; color: var(--ink); text-decoration: none; border-radius: 8px; }
.nav-home svg { display: block; width: 22px; height: 22px; }
.nav-home:hover { background: rgba(0, 0, 0, 0.06); }
.nav-back { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 8px; flex-shrink: 0; color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 600; white-space: nowrap; border-radius: 8px; }
.nav-back:hover { color: var(--ink); background: rgba(0, 0, 0, 0.06); }
/* dark sim topbar: light home icon */
.sim-topbar .nav-home { color: #9ca3af; }
.sim-topbar .nav-home:hover { background: #272b34; color: #e5e7eb; }

/* login modal */
.auth-modal { position: fixed; inset: 0; z-index: 100; background: rgba(20, 22, 26, 0.55); display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow-y: auto; }
.auth-modal[hidden] { display: none; }
.auth-box { position: relative; width: 100%; max-width: 400px; background: var(--card); border-radius: 16px; padding: 24px 20px 20px; box-shadow: var(--shadow-float); margin-top: 8vh; }
.auth-box h2 { font-size: 20px; margin: 0 0 4px; }
.auth-sub { font-size: 14px; color: var(--muted); margin: 0 0 16px; }
.auth-x { position: absolute; top: 10px; right: 12px; border: none; background: none; font-size: 24px; line-height: 1; color: var(--muted); cursor: pointer; padding: 4px 8px; }
.auth-google { width: 100%; height: 44px; border-radius: 8px; border: 1px solid var(--hair); background: var(--card); color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 14px; }
.auth-or { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 12px; margin: 0 0 14px; }
.auth-or::before, .auth-or::after { content: ""; flex: 1; height: 1px; background: var(--hair); }
.auth-tabs { display: flex; gap: 4px; background: #f1f3f7; border-radius: 8px; padding: 4px; margin-bottom: 14px; }
.auth-tabs button { flex: 1; height: 36px; border: none; border-radius: 6px; background: transparent; font-size: 14px; font-weight: 600; font-family: var(--sans); color: var(--muted); cursor: pointer; }
.auth-tabs button.active { background: var(--card); color: var(--ink); box-shadow: var(--shadow-card); }
.auth-box label { display: block; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 10px; }
.auth-box input { display: block; width: 100%; height: 44px; margin-top: 4px; padding: 0 12px; border: 1px solid var(--hair); border-radius: 8px; font-size: 15px; font-family: var(--sans); }
.auth-box input:focus { outline: 2px solid var(--blue); outline-offset: 0; border-color: var(--blue); }
.auth-error { color: var(--red); font-size: 13px; margin: 0 0 10px; }
.auth-error[hidden] { display: none; }
.auth-submit { width: 100%; }
.auth-switch { text-align: center; font-size: 13px; color: var(--muted); margin: 12px 0 0; }
.linklike { border: none; background: none; color: var(--blue); font-size: 13px; font-weight: 600; font-family: var(--sans); cursor: pointer; padding: 0; }
body.modal-open { overflow: hidden; }

/* lock screen (locked lesson / sim) */
.lock-screen { background: var(--card); border: 1px solid var(--hair); border-radius: 16px; padding: 28px 20px; margin: 20px 0; text-align: center; box-shadow: var(--shadow-card); }
.lock-screen[hidden] { display: none; }
.lock-screen .lock-icon { font-size: 36px; line-height: 1; display: block; margin-bottom: 10px; }
.lock-screen h2 { margin: 0 0 6px; }
.lock-screen p { color: var(--muted); font-size: 14px; margin: 0 auto 16px; max-width: 420px; }
.lock-screen .btn { margin: 4px; }
.lock-screen .lock-back { display: block; margin-top: 14px; font-size: 13px; }
/* auth / state loading — while the sign-in state is unknown, never
   show a "Sign in" or buy button as if the user were signed out. */
.auth-btn[disabled] { opacity: .55; cursor: default; }
body.app-pending .pay-btn { opacity: .45; pointer-events: none; }
.lock-screen .lock-loading { display: none; color: var(--muted); font-size: 14px; margin: 0 auto; max-width: 420px; }
.lock-screen.loading .lock-icon, .lock-screen.loading h2, .lock-screen.loading p:not(.lock-loading), .lock-screen.loading .btn, .lock-screen.loading .lock-back { display: none; }
.lock-screen.loading .lock-loading { display: block; }
body.locked #lesson-content { display: none; }
body.locked .sim-shell > :not(#lock-screen) { display: none; }
body.locked #lock-screen { display: block; }
/* Locked sim: the lock card is the only visible child of the 100dvh
   flex-column shell, so auto vertical margins centre it instead of
   leaving it stuck at the top with empty space below. Scoped to the
   sim shell only — lesson pages keep their normal margin. */
body.locked .sim-shell > #lock-screen { margin-top: auto; margin-bottom: auto; }

/* continue banner (landing) */
.continue-banner { background: var(--mint); border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 16px; margin: 16px auto 0; max-width: 720px; font-size: 14px; color: var(--ink); }
.continue-banner[hidden] { display: none; }
.continue-banner a { font-weight: 700; }

/* curriculum row flags */
.row-flag { font-size: 12px; font-weight: 700; white-space: nowrap; }
.row-flag.done { color: var(--green); }
.row-flag.continue { color: var(--blue); }
.row-flag.locked { color: var(--muted); }
.lesson-row.row-done { background: var(--mint); }
.lesson-row.row-continue { background: #eff6ff; }

/* resume note (sim pages) */
.resume-note { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 14px; margin: 10px 12px 0; font-size: 13px; color: var(--ink); }
.resume-note[hidden] { display: none; }

/* owned / download */
.owned-download[hidden] { display: none; }
.owned-note { color: var(--green); font-size: 13px; font-weight: 700; margin: 8px 0 0; }
.owned-note[hidden] { display: none; }
.pay-btn[hidden] { display: none; }
/* The sign-in button in a lock screen is a .btn (display: inline-flex),
   which beats the browser's built-in [hidden] rule — without this rule
   "Sign in to buy" stayed visible for signed-in users even after JS set
   hidden=true. Same for the sticky-bar "Continue learning" link. */
.lock-signin[hidden] { display: none; }
#sticky-continue[hidden] { display: none; }

/* mark-as-done (lesson pages) */
.mark-done { width: 100%; margin: 20px 0 0; }
.mark-done[hidden] { display: none; }

/* toast */
.toast { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 120; max-width: calc(100vw - 32px); background: var(--ink); color: #fff; font-size: 14px; line-height: 1.45; padding: 12px 16px; border-radius: 10px; box-shadow: var(--shadow-float); }
.toast[hidden] { display: none; }
@media (max-width: 480px) {
  .auth-chip { max-width: 80px; }
  .stickybar .btn { padding: 0 10px; font-size: 12px; }
  /* Landing header at phone width: wordmark + pill + Sign in button
     measured ~427px at 360px, so the button was cut off at the right
     edge. Hide the decorative pill and the "by PromptStudio" suffix
     (the hero carries the same message) so the full button fits. */
  .site-header { padding: 0 12px; gap: 8px; }
  .site-header .bill-pill { display: none; }
  .site-header .wordmark small { display: none; }
  .site-header .auth-slot { flex-shrink: 0; }
  .site-header .auth-btn { flex-shrink: 0; }
  /* Lesson rows stack at phone width: tags sit below the title, so a
     long stage pill can never squeeze the title into a sliver. */
  .lesson-row { flex-direction: column; gap: 6px; }
  .lesson-row .rowtags { align-self: flex-start; flex-direction: row; flex-wrap: wrap; margin-top: 2px; }
  /* Sticky bar at 320px: let the prices wrap to two lines and hide the
     small print, so the Buy button is never pushed off-screen. */
  .stickybar .sb-prices { white-space: normal; }
  .stickybar .sb-prices small { display: none; }
  /* Pager at phone width: stack each link's two lines so the lesson
     title never clips. */
  .pager a { flex-direction: column; align-items: flex-start; gap: 2px; }
  .pager a.next { align-items: flex-end; text-align: right; }
  .pager a span:first-child { font-size: 12px; font-weight: 500; }
  /* Lesson header at phone width: tighter row so the crumb keeps room. */
  .lesson-header .lh-row { padding: 0 10px; gap: 4px; }
  #btn-sidebar { padding: 0 8px; min-width: 44px; justify-content: center; }
  .lesson-header .auth-btn { padding: 0 10px; }
  /* Header nav at phone width: the sidebar toggle and the back link
     go icon-only, so the row still fits at 320px with the home icon
     added (toggle 44 + home 44 + wordmark ~80 + back 44 + sign out
     ~60 + gaps/padding ~36 = ~308px). Labels stay on desktop. */
  #btn-sidebar .sb-label { display: none; }
  .nav-back { min-width: 44px; justify-content: center; padding: 0 6px; }
  .nav-back .nb-label { display: none; }
  /* Welcome-back banner: sits flush at 360px today. */
  .continue-banner { margin: 16px 12px 0; }
}
@media (max-width: 600px) {
  /* Signed-in header overflow: at ~500px the wordmark + "by PromptStudio"
     + "Zero Cloud Bill" pill + account chip + Sign out button sum to
     ~510px, wider than the screen, so the page gets a horizontal
     scrollbar. The 480px cut hides the pill and suffix, but the band
     481-600px still shows them. Hide them here too (the hero carries
     the same message) so the header fits at every phone width. */
  .site-header .bill-pill { display: none; }
  .site-header .wordmark small { display: none; }
  /* Lesson header overflow (owner's phone, 2026-11-22): the "☰ Lessons"
     button (~95px) plus wordmark (~80px) plus the signed-in name chip
     (~80px) plus "Sign out" (~64px) plus padding and gaps (~70px)
     sums to ~389px — wider than a 360px phone, so "Sign out" is cut
     off at the right edge. The name chip is decorative (the account
     is already known); hide it at phone width and keep "Sign out"
     fully visible. New total ~301px, fits down to a 320px screen.
     The Lessons button and the Sign out button stay. */
  .auth-chip { display: none; }
  /* Compact step card on phones: a tall card plus the keyboard leaves
     no room for terminal output. Cap the command line's height. */
  .stepcard { padding: 10px 12px; }
  .stepcard .stepactions { margin-top: 8px; }
  .stepcard .scmd { max-height: 72px; overflow-y: auto; }
}
"""

AUTH_MODAL = """
<div class="auth-modal" id="auth-modal" hidden>
  <div class="auth-box" role="dialog" aria-modal="true" aria-label="Sign in">
    <button class="auth-x" id="auth-close" type="button" aria-label="Close">&times;</button>
    <h2>Sign in to DevOps Kit</h2>
    <p class="auth-sub">Your progress saves, so you can stop and come back.</p>
    <button class="btn auth-google" id="auth-google" type="button">Continue with Google</button>
    <div class="auth-or"><span>or with email</span></div>
    <div class="auth-tabs">
      <button type="button" id="auth-tab-signin" class="active">Sign in</button>
      <button type="button" id="auth-tab-signup">Create account</button>
    </div>
    <form id="auth-form">
      <label>Email<input id="auth-email" type="email" autocomplete="email" required></label>
      <label>Password<input id="auth-password" type="password" autocomplete="current-password" required minlength="6"></label>
      <p class="auth-error" id="auth-error" hidden></p>
      <button class="btn amber auth-submit" id="auth-submit" type="submit">Sign in</button>
    </form>
    <p class="auth-switch"><span id="auth-switch-note">No account yet? </span><button type="button" id="auth-switch-link" class="linklike">Create one</button></p>
  </div>
</div>
"""

# App scripts, all deferred (the old build-improvements.js post-
# processor added defer + i18n.js and dropped the Razorpay tag —
# Razorpay now lazy-loads from devops-app.js only when someone pays).
# Sim pages also load fun.js (confetti when a lab finishes) between
# the Firebase scripts and i18n.js.
AUTH_SCRIPTS_FIREBASE = """
<script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
"""
AUTH_SCRIPTS = (AUTH_SCRIPTS_FIREBASE + """<script defer src="/assets/i18n.js"></script>
<script defer src="/assets/auth.js"></script>
<script defer src="/assets/devops-app.js"></script>
""")
AUTH_SCRIPTS_SIM = (AUTH_SCRIPTS_FIREBASE + """<script defer src="/assets/fun.js"></script>
<script defer src="/assets/i18n.js"></script>
<script defer src="/assets/auth.js"></script>
<script defer src="/assets/devops-app.js"></script>
""")

# Appended to style.css after the base + auth chrome: the a11y
# block (focus styles, skip link, reduced motion, print) and the i18n
# block (language picker + per-language fonts) from the PR #120 site.
CSS_APPEND = """
/* a11y-additions */
:focus-visible{outline:3px solid #0b5fff;outline-offset:2px;border-radius:4px}
.terminal :focus-visible,.hero-term :focus-visible{outline-color:#f5a524}
.skip-link{position:absolute;left:8px;top:-60px;background:#0b5fff;color:#fff;padding:10px 14px;border-radius:6px;z-index:1000;font-weight:700;text-decoration:none}
.skip-link:focus{top:8px}
#main{outline:none}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
@media print{.site-header,.sim-topbar,.sticky-cta,.auth-slot,.sidebar-toggle{display:none!important}}

/* i18n */
.lang-switch{font:inherit;font-size:13px;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;margin-right:8px;max-width:110px;cursor:pointer}
.lang-switch option{color:#111;background:#fff}
.lang-floating{position:fixed;right:10px;bottom:10px;z-index:900;background:#fff;color:#111}
.lang-suggest{display:flex;gap:8px;align-items:center;justify-content:center;padding:8px 12px;background:#fff7e0;color:#4a3500;font-size:15px}
.lang-suggest button{font:inherit;border:0;border-radius:8px;padding:6px 12px;background:#14161b;color:#fff;cursor:pointer}
.lang-suggest .ls-x{background:transparent;color:inherit;font-size:20px;padding:0 8px}
html[lang=hi] body{font-family:'Noto Sans Devanagari',system-ui,-apple-system,'Segoe UI',sans-serif}
html[lang=te] body{font-family:'Noto Sans Telugu',system-ui,-apple-system,'Segoe UI',sans-serif}
html[lang=ta] body{font-family:'Noto Sans Tamil',system-ui,-apple-system,'Segoe UI',sans-serif}
html[lang=hi] code,html[lang=te] code,html[lang=ta] code,html[lang=hi] .terminal,html[lang=te] .terminal,html[lang=ta] .terminal{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
html[lang=hi] body,html[lang=te] body,html[lang=ta] body{line-height:1.7}

.sim-topbar .lang-switch{color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.08)}
.sim-topbar .lang-switch option{color:#111;background:#fff}
"""

JS = open(os.path.join(OUT, "engine", "sim.js")).read()

# Shared header nav (owner order 2026-11-24): every page gets a home icon
# (house SVG, plain link to /) and, except the homepage, a back link
# (plain href, no JS history, so it works in fresh tabs). Lesson pages
# go back to the homepage curriculum (/#curriculum); sim pages already
# have a "← Lesson" exit link as their back button, so they only gain
# the home icon. 44px tap targets everywhere.
HOME_SVG = ('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" '
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            'stroke-linejoin="round" aria-hidden="true">'
            '<path d="M3 11.5 12 3l9 8.5"/>'
            '<path d="M5 10.5V21h14V10.5"/>'
            '<path d="M9.5 21v-6h5v6"/></svg>')
HOME_ICON = '<a class="nav-home" href="/" aria-label="Home">' + HOME_SVG + '</a>'

LESSON_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — DevOps Kit</title>
{meta_tags}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/genz.css">
</head>
<body data-page="lesson" data-lesson="{slug}" data-phase="{phase}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="lesson-header">
  <div class="lh-row">
    <button class="sidebar-toggle" id="btn-sidebar" type="button" aria-expanded="false" aria-controls="lesson-sidebar">&#9776; <span class="sb-label">Lessons</span></button>
    {home}
    <a class="wordmark" href="/">DevOps Kit</a>
    <a class="nav-back" href="/#curriculum" aria-label="All lessons"><span aria-hidden="true">&larr;</span> <span class="nb-label">Lessons</span></a>
    <span class="lh-meta">{crumb}</span>
    <span class="auth-slot" id="auth-slot"></span>
  </div>
  <div class="lesson-progress"><span id="lesson-progress-fill"></span></div>
</header>
<main class="lesson-wrap">
"""

SIM_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — DevOps Kit</title>
{meta_tags}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/genz.css">
</head>
<body data-page="sim" data-sim="{slug}" data-phase="{phase}">
<a class="skip-link" href="#main">Skip to content</a>
"""

LANDING = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DevOps Kit — Learn by Doing, On Your Own Machine | PromptStudio</title>
{meta_tags}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/assets/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/genz.css">
</head>
<body class="has-sticky" data-page="landing">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  {home}
  <a class="wordmark" href="/">DevOps Kit <small>by PromptStudio</small></a>
  <span class="bill-pill">Zero Cloud Bill</span>
  <span class="auth-slot" id="auth-slot"></span>
</header>
<main id="main" tabindex="-1"><div class="hero">
  <div class="hero-inner">
    <span class="eyebrow">Learn by doing &bull; On your laptop</span>
    <h1>Build real backend infrastructure. Zero cloud bill.</h1>
    <p class="subhead">Run Kafka, PostgreSQL failover, Redis, and multi-service pipelines locally with free Docker tools. Plain English. One idea per step.</p>
    <a class="btn amber cta" href="#try-sim">Try the Practice Terminal Demo &rarr;</a>
    <div class="hero-term" id="hero-term">
      <div class="hero-term-chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="fname">patroni-failover — bash</span></div>
      <div class="hero-term-body" id="hero-term-body"></div>
    </div>
    <div class="hero-chips">
      <span class="chip">18 lessons</span>
      <span class="chip">20 terminal simulations</span>
      <span class="chip">No cloud bill</span>
      <span class="chip">Fake data only</span>
    </div>
  </div>
</div>
<div class="continue-banner" id="continue-banner" hidden></div>
<div class="wrap">
  <div class="section">
    <h2>How learning works</h2>
    <div class="rail">
      <div class="rail-step"><span class="rail-num">1</span><b>Read 1 plain-English concept</b><p>Three minutes. One idea per step. No jargon without a simple meaning next to it.</p></div>
      <div class="rail-step"><span class="rail-num">2</span><b>Run commands on fake data in Docker</b><p>The same commands as the real lab, on your own machine. Nothing real, nothing to leak.</p></div>
      <div class="rail-step"><span class="rail-num">3</span><b>Break it on purpose &amp; fix it</b><p>Kill the database. Stop a backend. Watch the standby take over — then fix it yourself.</p></div>
    </div>
  </div>

  <div class="section">
    <h2>What you&rsquo;ll learn</h2>
    <p class="lead">Two phases. Seven labs in Phase 1, nine guides in Phase 2 — plus two free lessons to start.</p>
    <div class="skills">
      <div class="skill skill--data"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h12M3 18h15"/></svg><b>Kafka</b><small>messages in a line</small></div>
      <div class="skill skill--data"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg><b>PostgreSQL + Patroni</b><small>database + standby</small></div>
      <div class="skill skill--data"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg><b>Redis</b><small>fast memory store</small></div>
      <div class="skill skill--data"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg><b>Object Store</b><small>files that mirror</small></div>
      <div class="skill"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M8 20h8M12 6 5 8m7-2 7 2"/><path d="M2.5 13 5 8l2.5 5a2.6 2.6 0 0 1-5 0zM16.5 13 19 8l2.5 5a2.6 2.6 0 0 1-5 0z"/></svg><b>Load Balancer</b><small>one guard, three backends</small></div>
      <div class="skill"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="8" width="18" height="10" rx="1"/><path d="M7 8V5h10v3M7 13h4"/></svg><b>Docker &amp; K8s</b><small>containers on your machine</small></div>
      <div class="skill"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></svg><b>Terraform</b><small>infrastructure as code</small></div>
      <div class="skill"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="M7 14l3-4 3 2 4-5"/></svg><b>CI/CD &amp; Monitoring</b><small>pipelines that ship</small></div>
    </div>
  </div>
</div>

  <div class="section">
    <h2>Free before you buy</h2>
    <p class="lead">Free lessons and five free simulations. No payment needed. Start here if you have never touched a terminal.</p>
    <div class="cards">
      <div class="card">
        <h3>Lesson 0 — Before the Terminal</h3>
        <p class="tagline">What Linux, a terminal, Docker and a port mean — in plain English. Plus how to install Docker and check your machine with one script.</p>
        <p class="tagline"><b>Docker &amp; Linux · Beginner</b></p>
        <a class="btn" href="/lessons/lesson-0.html">Read Lesson 0 — free</a>
      </div>
      <div class="card">
        <h3>Error Decoder</h3>
        <p class="tagline">35 errors beginners hit — permission denied, port already in use, connection refused. Each one: what it means, the one fix, how to check it worked.</p>
        <p class="tagline"><b>Reference · Error Decoder</b></p>
        <a class="btn" href="/lessons/error-decoder.html">Open the Error Decoder — free</a>
      </div>
    </div>
  </div>

<div class="simdeck" id="try-sim">
  <div class="wrap">
    <h2>Try a Simulation First</h2>
    <p class="lead">Browser labs. No install, works on your phone. Five are free to try (Before the Terminal, Kafka, Error Decoder, Linux and Git) — the rest unlock with Phase 1 (₹399), Phase 2 (₹799), or both together (₹999). Every simulation is a practice version: it shows the lab&rsquo;s real outputs, but nothing here runs a live service.</p>
    <div class="simdeck-scroll">
{sim_cards}
    </div>
  </div>
</div>

<div class="simdeck">
  <div class="wrap">
    <h2>Before you buy / After you buy</h2>
    <p class="lead">No surprises. This is exactly what is free, and what each phase unlocks. After you buy, you download the kit &mdash; your own copy of every lesson and lab file, to run on your own computer. No cloud, no bill.</p>
    <div class="buygrid">
      <div class="buycard">
        <span class="buytag">Before you buy &mdash; Free</span>
        <div class="buyprice">₹0</div>
        <ul>
          <li>Try 5 simulations free — Before the Terminal, Kafka, Error Decoder, Linux and Git</li>
          <li>See all 18 lesson titles</li>
          <li>Read Lesson 0, the Error Decoder and the Linux and Git lessons free</li>
          <li>No payment needed</li>
        </ul>
      </div>
      <div class="buycard">
        <span class="buytag">After you buy Phase 1 &mdash; ₹399</span>
        <div class="buyprice">₹399 <small>one-time</small></div>
        <ul>
          <li>Lessons 2&ndash;8, full guides</li>
          <li>All 7 Phase 1 simulations unlocked</li>
          <li>Phase 1 kit download: 9 lesson files, 6 lab folders (each with its docker-compose.yml), the portfolio folder, kit-doctor.sh and reset.sh</li>
          <li>Your progress is saved, resume anytime</li>
        </ul>
      </div>
      <div class="buycard">
        <span class="buytag">After you buy Phase 2 &mdash; ₹799</span>
        <div class="buyprice">₹799 <small>one-time</small></div>
        <ul>
          <li>Lessons 9&ndash;17, full guides</li>
          <li>Phase 2 does not include Phase 1 — buy Phase 1 separately, or get both together for ₹999.</li>
          <li>Phase 2 kit download: 9 guide files + changelog &mdash; Linux, Git, Docker, Kubernetes, Terraform, CI/CD, monitoring, portfolio projects, interview pack</li>
          <li>Your progress is saved, resume anytime</li>
        </ul>
      </div>
      <div class="buycard">
        <span class="buytag">Best value &mdash; Both phases &mdash; ₹999</span>
        <div class="buyprice">₹999 <small>one-time</small></div>
        <ul>
          <li>Both phases together — save ₹199 vs ₹1,198</li>
          <li>All 18 lessons, all 18 simulations unlocked</li>
          <li>Both kit downloads: Phase 1 + Phase 2</li>
          <li>Your progress is saved, resume anytime</li>
        </ul>
      </div>
    </div>
    <p class="buy-note">Simulations are practice versions &mdash; real commands and real outputs, but no live service runs. The kit gives you the full lessons and lab files to run on your own computer.</p>
    <p class="buy-note">If you get stuck: 1. Run <code>bash kit-doctor.sh</code> in the Phase 1 folder &mdash; it checks Docker, ports, disk and memory. 2. Look the exact error line up in the Error Decoder. 3. Email support@promptstudioai.in &mdash; we reply within 24 hours.</p>
  </div>
</div>

<div class="wrap">
  <div class="section">
    <h2>Two phases</h2>
    <p class="lead">Start with free Lesson 0, then Phase 1. If you want Linux, Git and Docker from zero first, do Phase 2 first. Or get both phases together for ₹999 — save ₹199.</p>
    <div class="cards">
      <div class="card">
        <h3>Phase 1 &mdash; The Data Tier</h3>
        <p class="tagline">The new tech: how data moves, copies itself, and survives a crash.</p>
        <div class="price">₹399 <small>one-time</small></div>
        <span class="microbadge">One-time &bull; No subscription</span>
        <ul>
          <li>Kafka &mdash; messages in a line, copied to a second cluster</li>
          <li>PostgreSQL &mdash; main database, standby copy, failover with Patroni</li>
          <li>Redis &mdash; a fast memory store, with a read-only copy</li>
          <li>Object store &mdash; file storage that mirrors itself</li>
          <li>Load balancer &mdash; one guard, three backends</li>
          <li>Replication and failover, end to end</li>
          <li>One full end-to-end lab: one fake order, all the way through</li>
          <li>7 practice simulations with real commands and real outputs — no live service runs</li>
          <li>Failure drills — kill it, watch it recover, prove no data lost</li>
          <li>Proof-of-work artefacts for your portfolio</li>
          <li>Email support — we reply within 24 hours</li>
        </ul>
        <button class="btn amber pay-btn" data-phase="phase1" type="button">Buy Phase 1 — ₹399</button>
        <button class="btn owned-download" data-phase="phase1" type="button" hidden>✓ You own this — Download the kit (.zip)</button>
        <p class="owned-note" data-phase="phase1" hidden>✓ You own Phase 1. Your progress saves.</p>
        <p class="paynote">Pay once with UPI, card or netbanking. Keep it forever.</p>
      </div>
      <div class="card featured">
        <h3>Phase 2 &mdash; The Rest of DevOps</h3>
        <p class="tagline">The base skills and the rest of the toolkit, from zero.</p>
        <div class="price">₹799 <small>one-time</small></div>
        <span class="microbadge">One-time &bull; No subscription</span>
        <ul>
          <li>Linux, Git, Docker &mdash; the base skills, from zero</li>
          <li>Kubernetes &mdash; your app on a small local cluster</li>
          <li>Terraform, CI/CD, monitoring</li>
          <li>Break-and-fix labs &mdash; learn like on-call work</li>
          <li>Interview pack, portfolio projects, resume bullets</li>
          <li>Best sites &mdash; what to pick, and why</li>
          <li>Email support — we reply within 24 hours</li>
        </ul>
        <button class="btn amber pay-btn" data-phase="phase2" type="button">Buy Phase 2 — ₹799</button>
        <button class="btn owned-download" data-phase="phase2" type="button" hidden>✓ You own this — Download the kit (.zip)</button>
        <p class="owned-note" data-phase="phase2" hidden>✓ You own Phase 2. Your progress saves.</p>
        <p class="paynote">Pay once with UPI, card or netbanking. Keep it forever.</p>
      </div>
      <div class="card featured bundle-wide">
        <h3>Both phases &mdash; the full kit</h3>
        <p class="tagline">Everything in Phase 1 and Phase 2, together. Save ₹199.</p>
        <div class="price">₹999 <small>one-time</small></div>
        <span class="microbadge">One-time &bull; No subscription &bull; Best value</span>
        <ul>
          <li>All 18 lessons, full guides</li>
          <li>All 18 practice simulations unlocked</li>
          <li>Both kit downloads — Phase 1 + Phase 2</li>
          <li>Your progress is saved, resume anytime</li>
          <li>Email support — we reply within 24 hours</li>
        </ul>
        <button class="btn amber pay-btn" data-phase="bundle" type="button">Buy both phases — ₹999</button>
        <button class="btn owned-download" data-phase="phase1" type="button" hidden>✓ You own this — Download Phase 1 (.zip)</button>
        <button class="btn owned-download" data-phase="phase2" type="button" hidden>✓ You own this — Download Phase 2 (.zip)</button>
        <p class="owned-note" data-phase="bundle" hidden>✓ You own both phases. Your progress saves.</p>
        <p class="paynote">Pay once with UPI, card or netbanking. Keep it forever.</p>
      </div>
    </div>
    <p class="paynote">Stuck more than 15 minutes? Email us: <a href="mailto:support@promptstudioai.in">support@promptstudioai.in</a> — we reply within 24 hours.</p>
  </div>

  <div class="section">
    <h2>Your level in each topic</h2>
    <p class="lead">Every topic has its own ladder: Beginner, then Intermediate, then Advanced. Finish a <b>built</b> stage and you can really do the thing — not just read about it.</p>
    <div class="levels-grid">
{levels_section}
    </div>
  </div>

  <div class="section" id="curriculum">
    <h2>Course curriculum</h2>
    <p class="lead">18 lessons in total: 7 in Phase 1, 9 in Phase 2, plus Lesson 0, the Error Decoder and two free skill labs (Linux and Git) &mdash; all free. Tap a phase to see its lessons. The two free lessons are marked Try free.</p>
    <details class="curriculum">
      <summary><span>Free &mdash; Start here</span><span class="meta">4 lessons &middot; ₹0</span><span class="plus">+</span></summary>
      <div class="cbody"><div class="cbody-inner">
{curriculum_free}
      </div></div>
    </details>
    <details class="curriculum" open>
      <summary><span>Phase 1 &mdash; The Data Tier</span><span class="meta">7 lessons &middot; ₹399</span><span class="plus">+</span></summary>
      <div class="cbody"><div class="cbody-inner">
{curriculum_p1}
      </div></div>
    </details>
    <details class="curriculum">
      <summary><span>Phase 2 &mdash; The Rest of DevOps</span><span class="meta">9 lessons &middot; ₹799</span><span class="plus">+</span></summary>
      <div class="cbody"><div class="cbody-inner">
{curriculum_p2}
      </div></div>
    </details>
  </div>
</div>
</main>
<footer class="site"><b>PromptStudio</b> &middot; DevOps Kit &mdash; learn by doing, on your own machine.<br>Every lab uses fake data only &mdash; fake orders, fake names, fake receipts. Nothing real, nothing to leak.<br>Payment failed, or stuck more than 15 minutes? Mail us: <a href="mailto:support@promptstudioai.in">support@promptstudioai.in</a> — we reply within 24 hours.</footer>
<div class="stickybar" role="region" aria-label="Buy the course">
  <div class="sb-prices">Phase 1: ₹399 &bull; Phase 2: ₹799 &bull; Both: ₹999<small>One-time &bull; UPI accepted</small></div>
  <button class="btn pay-btn" id="sticky-buy" data-phase="phase1" type="button">Buy Phase 1 — ₹399</button>
  <a class="btn" id="sticky-continue" href="/lessons/p1-start.html" hidden>Continue learning &rarr;</a>
</div>
<script defer src="/assets/hero.js"></script>
""" + AUTH_MODAL + AUTH_SCRIPTS + """
</body>
</html>
"""


def lock_screen(phase, what="This lesson"):
    price = "₹399" if phase == "phase1" else "₹799"
    ph = "Phase 1" if phase == "phase1" else "Phase 2"
    return (f'<div class="lock-screen" id="lock-screen" hidden>'
            f'<p class="lock-loading" hidden>Checking your sign-in…</p>'
            f'<span class="lock-icon">🔒</span>'
            f'<h2>{what} is in {ph} — {price}, one-time</h2>'
            f'<p>Pay once with UPI, card or netbanking. Keep it forever. '
            f'Your progress saves, so you can stop and come back.</p>'
            f'<button class="btn lock-signin" type="button">Sign in to buy</button>'
            f'<button class="btn amber pay-btn" data-phase="{phase}" type="button" hidden>Buy {ph} — {price}</button>'
            f'<a class="lock-back" href="/">← Back to all lessons</a>'
            f'</div>')


def lesson_li(slug, title, sim):
    li = f'    <li><a href="/lessons/{slug}.html">{html.escape(title)}</a>'
    if sim:
        li += (f'<br><span class="simlink">▶ '
               f'<a href="/sims/{sim}.html">Try the simulation</a></span>')
    return li + '</li>'


# --- simulated shell worlds -------------------------------------------
# Each sim gets a "world": containers, services, files. The shell in
# engine/sim.js is state-driven: it updates the world as the learner
# types, and a guided step completes when the typed command matches
# OR the world reaches the right state (state wins — it rewards
# understanding, not copying). Steps whose output depends on what the
# learner typed (producer, consumer, SELECT, logs, curl) are marked
# live: the engine's output is shown even on a guided match.
# Producer/heredoc steps are marked defer: the step only completes
# when the world changes, not when the starting command is typed.

def read_kit(rel):
    with open(os.path.join(KIT, rel)) as f:
        return f.read()


def world_kafka():
    return {
        "containers": {"kafka-a": {"project": "root"},
                       "kafka-b": {"project": "root"},
                       "mm2": {"project": "root"}},
        "kafka_clusters": ["kafka-a", "kafka-b"],
        "mirror_delay_ms": 3000,
        "fs": {"/home/learner": ["docker-compose.yml",
                                 "connect-standalone.properties",
                                 "mm2.properties",
                                 "mirrormaker.log"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/kafka-lab/docker-compose.yml"),
            "/home/learner/connect-standalone.properties":
                read_kit("phase1/kafka-lab/connect-standalone.properties"),
            "/home/learner/mm2.properties":
                read_kit("phase1/kafka-lab/mm2.properties"),
        },
    }


def world_postgresql():
    return {
        "containers": {"pg-primary": {"project": "root", "role": "primary"},
                       "pg-replica": {"project": "root", "role": "replica"},
                       "etcd": {"project": "patroni"},
                       "patroni-1": {"project": "patroni"},
                       "patroni-2": {"project": "patroni"}},
        "services": {"primary": "pg-primary", "replica": "pg-replica"},
        "patroni": {"members": {"patroni-1": {}, "patroni-2": {}},
                    "leader": "patroni-1"},
        # PostgreSQL Advanced challenge: the server on this machine has a
        # stale lock file from a crash and will not start until it is removed
        "pg_stale_lock": True,
        "mirror_delay_ms": 3000,
        "fs": {"/home/learner": ["docker-compose.yml", "01-replicator.sql",
                                 "replica-entrypoint.sh", "patroni"],
               "/home/learner/patroni": ["Dockerfile", "docker-compose.yml",
                                         "patroni-1.yml", "patroni-2.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/postgresql-lab/docker-compose.yml"),
            "/home/learner/01-replicator.sql":
                read_kit("phase1/postgresql-lab/01-replicator.sql"),
            "/home/learner/replica-entrypoint.sh":
                read_kit("phase1/postgresql-lab/replica-entrypoint.sh"),
            "/home/learner/patroni/docker-compose.yml":
                read_kit("phase1/postgresql-lab/patroni/docker-compose.yml"),
            "/home/learner/patroni/Dockerfile":
                read_kit("phase1/postgresql-lab/patroni/Dockerfile"),
            "/home/learner/patroni/patroni-1.yml":
                read_kit("phase1/postgresql-lab/patroni/patroni-1.yml"),
            "/home/learner/patroni/patroni-2.yml":
                read_kit("phase1/postgresql-lab/patroni/patroni-2.yml"),
        },
    }


def world_redis():
    return {
        "containers": {"redis-a": {"project": "root"},
                       "redis-b": {"project": "root"}},
        "redis": {"redis-a": {"replica_of": None, "maxmemory": 200},
                  "redis-b": {"replica_of": "redis-a"}},
        "mirror_delay_ms": 3000,
        "fs": {"/home/learner": ["docker-compose.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/redis-lab/docker-compose.yml"),
        },
    }


def world_object_store():
    return {
        "containers": {"moto-a": {"project": "root"},
                       "moto-b": {"project": "root"},
                       "mirror": {"project": "root"},
                       "awscli": {"project": "root"}},
        "s3_stores": ["moto-a", "moto-b"],
        "s3_main": "moto-a",
        "mirror_delay_ms": 2000,
        "fs": {"/home/learner": ["docker-compose.yml", "Dockerfile",
                                 "mirror.sh", "files"],
               "/files": ["receipt-001.txt", "receipt-002.txt",
                          "receipt-003.txt"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/object-store-lab/docker-compose.yml"),
            "/home/learner/Dockerfile":
                read_kit("phase1/object-store-lab/Dockerfile"),
            "/home/learner/mirror.sh":
                read_kit("phase1/object-store-lab/mirror.sh"),
            "/files/receipt-001.txt":
                read_kit("phase1/object-store-lab/files/receipt-001.txt"),
            "/files/receipt-002.txt":
                read_kit("phase1/object-store-lab/files/receipt-002.txt"),
            # Advanced challenge: a third receipt, uploaded while the
            # mirror is stopped on purpose (practice data, not in the kit)
            "/files/receipt-003.txt":
                ("Fake receipt for practice only. Not a real document.\n"
                 "Order: order-103\nItem: mug\nAmount: 350\nBuyer: Meena\n"
                 "Date: 2026-11-20\n"),
        },
    }


def world_load_balancer():
    return {
        "containers": {"lb": {"project": "root"},
                       "web1": {"project": "root"},
                       "web2": {"project": "root"},
                       "web3": {"project": "root"}},
        "curl_hosts": ["web1", "web2", "web3"],
        "mirror_delay_ms": 3000,
        "fs": {"/home/learner": ["docker-compose.yml", "nginx.conf"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/load-balancer-lab/docker-compose.yml"),
            "/home/learner/nginx.conf":
                read_kit("phase1/load-balancer-lab/nginx.conf"),
            # the config as the load balancer container sees it — the
            # Advanced challenge edits this copy with sed, then reloads
            "/etc/nginx/nginx.conf":
                read_kit("phase1/load-balancer-lab/nginx.conf"),
        },
    }


def world_end_to_end():
    orders = [read_kit(f"phase1/end-to-end/incoming/order-00{i}.json")
              for i in (1, 2, 3)]
    return {
        "containers": {"kafka": {"project": "root"},
                       "postgres-primary": {"project": "root",
                                            "role": "primary"},
                       "postgres-replica": {"project": "root",
                                            "role": "replica"},
                       "redis": {"project": "root"},
                       "moto": {"project": "root"},
                       "lb": {"project": "root"},
                       "web1": {"project": "root"},
                       "web2": {"project": "root"},
                       "web3": {"project": "root"},
                       "ingest": {"project": "root"},
                       "worker": {"project": "root"}},
        "kafka_clusters": ["kafka"],
        "redis": {"redis": {"replica_of": None}},
        "s3_stores": ["moto"],
        "s3_main": "moto",
        "curl_hosts": ["web1", "web2", "web3"],
        "mirror_delay_ms": 3000,
        "fs": {"/home/learner": ["docker-compose.yml", "Dockerfile",
                                 "ingest.py", "worker.py",
                                 "requirements.txt", "nginx.conf",
                                 "incoming", "processed", "postgres"],
               "/home/learner/incoming": ["order-001.json", "order-002.json",
                                          "order-003.json"],
               "/home/learner/processed": [".keep"],
               "/home/learner/postgres": ["01-replicator.sql",
                                          "replica-entrypoint.sh"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/end-to-end/docker-compose.yml"),
            "/home/learner/Dockerfile":
                read_kit("phase1/end-to-end/Dockerfile"),
            "/home/learner/ingest.py":
                read_kit("phase1/end-to-end/ingest.py"),
            "/home/learner/worker.py":
                read_kit("phase1/end-to-end/worker.py"),
            "/home/learner/requirements.txt":
                read_kit("phase1/end-to-end/requirements.txt"),
            "/home/learner/nginx.conf":
                read_kit("phase1/end-to-end/nginx.conf"),
            "/home/learner/incoming/order-001.json": orders[0],
            "/home/learner/incoming/order-002.json": orders[1],
            "/home/learner/incoming/order-003.json": orders[2],
            "/home/learner/postgres/01-replicator.sql":
                read_kit("phase1/end-to-end/postgres/01-replicator.sql"),
            "/home/learner/postgres/replica-entrypoint.sh":
                read_kit("phase1/end-to-end/postgres/replica-entrypoint.sh"),
        },
        "initial_files": [
            {"path": "/home/learner/incoming/order-001.json",
             "content": orders[0]},
            {"path": "/home/learner/incoming/order-002.json",
             "content": orders[1]},
            {"path": "/home/learner/incoming/order-003.json",
             "content": orders[2]},
        ],
    }


def world_lesson_0():
    return {
        "containers": {},
        "fs": {"/home/learner": ["phase1"],
               "/home/learner/phase1": ["kit-doctor.sh",
                                        "docker-compose.yml",
                                        "start-here.md"]},
        "file_contents": {
            "/home/learner/phase1/kit-doctor.sh":
                read_kit("phase1/kit-doctor.sh"),
            "/home/learner/phase1/docker-compose.yml":
                read_kit("phase1/kafka-lab/docker-compose.yml"),
            "/home/learner/phase1/start-here.md":
                read_kit("phase1/start-here.md"),
        },
        "scripts": {
            "/home/learner/phase1/kit-doctor.sh": [
                "OK: Docker command found.",
                "OK: Docker Compose works.",
                "OK: Docker is running.",
                "OK: Port 5432 is free (needed by the database lab).",
                "OK: Port 6379 is free (needed by the memory store lab).",
                "OK: Port 9092 is free (needed by the message lab).",
                "OK: Disk space is fine.",
                "OK: Memory is fine.",
                "",
                "All OK - your machine is ready for the labs.",
            ],
        },
    }


def world_error_decoder():
    return {
        "containers": {"kafka-a": {"project": "root"},
                       "redis-a": {"project": "root"},
                       "redis-b": {"project": "root"},
                       "moto-a": {"project": "root"},
                       "awscli": {"project": "root"},
                       "lb": {"project": "root"},
                       "web1": {"project": "root"}},
        "redis": {"redis-a": {"replica_of": None},
                  "redis-b": {"replica_of": "redis-a"}},
        "kafka_clusters": ["kafka-a"],
        "s3_stores": ["moto-a"],
        "s3_main": "moto-a",
        "curl_hosts": ["web1"],
        "fs": {"/home/learner": ["docker-compose.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/redis-lab/docker-compose.yml"),
        },
    }


def world_p1_start():
    return {
        "containers": {"kafka-a": {"project": "root"},
                       "pg-primary": {"project": "root", "role": "primary"},
                       "redis-a": {"project": "root"},
                       "moto-a": {"project": "root"},
                       "awscli": {"project": "root"},
                       "lb": {"project": "root"},
                       "web1": {"project": "root"},
                       "web2": {"project": "root"},
                       "web3": {"project": "root"}},
        "redis": {"redis-a": {"replica_of": None}},
        "kafka_clusters": ["kafka-a"],
        "s3_stores": ["moto-a"],
        "s3_main": "moto-a",
        "curl_hosts": ["web1", "web2", "web3"],
        "fs": {"/home/learner": ["docker-compose.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/kafka-lab/docker-compose.yml"),
        },
    }


def world_p2_start():
    return {
        "containers": {},
        "fs": {"/home/learner": ["README.md"]},
    }


def world_p2_zero_cost():
    return {
        "containers": {},
        "fs": {"/home/learner": ["README.md"]},
        "curl_map": {"localhost:8080": [
            "Welcome to nginx!",
            "If you see this page, the nginx web server is successfully installed.",
        ]},
        "scripts": {
            "health-check.sh": ["Running containers:", "my-site is Up"],
        },
        # Linux/Git Advanced challenge: the practice folder is a git repo
        "git": {"initialized": True, "commits": ["Add site files"]},
    }


def world_p2_kubernetes():
    return {
        "containers": {},
        "fs": {"/home/learner": ["README.md"]},
        "k8s": {"services": [{"name": "my-site", "type": "ClusterIP",
                              "ports": "80/TCP"}]},
    }


def world_p2_break_fix():
    return {
        "containers": {},
        "fs": {"/home/learner": ["notes.txt", "Dockerfile", "index.html"]},
        "file_contents": {
            "/home/learner/notes.txt": "Line one\n",
            "/home/learner/Dockerfile":
                "FROM nginx\nCOPY app.html /usr/share/nginx/html/app.html\n",
            "/home/learner/index.html": "<h1>My site</h1>\n",
        },
        "git": {"initialized": True, "branches": ["main", "feature"],
                "commits": ["first version"]},
        "git_conflict": {"file": "notes.txt", "branch": "feature"},
        "scripts": {
            "run-tests.sh": ["Running tests...", "All tests passed."],
        },
        "curl_map": {"localhost:8080": [
            "Welcome to nginx!",
            "If you see this page, the nginx web server is successfully installed.",
        ]},
    }


def world_p2_cheat_sheets():
    return {
        "containers": {"kafka-a": {"project": "root"},
                       "pg-primary": {"project": "root", "role": "primary"},
                       "redis-a": {"project": "root"},
                       "moto-a": {"project": "root"},
                       "awscli": {"project": "root"}},
        "redis": {"redis-a": {"replica_of": None}},
        "kafka_clusters": ["kafka-a"],
        "s3_stores": ["moto-a"],
        "s3_main": "moto-a",
        "fs": {"/home/learner": ["docker-compose.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/kafka-lab/docker-compose.yml"),
        },
        "git": {"initialized": True, "commits": ["Add app"]},
        "k8s": {"deployments": [{"name": "my-site", "image": "nginx:1.25"}]},
    }


def world_p2_interview():
    return {
        "containers": {"pg-primary": {"project": "root", "role": "primary"},
                       "pg-replica": {"project": "root", "role": "replica"}},
        "fs": {"/home/learner": ["docker-compose.yml"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/postgresql-lab/docker-compose.yml"),
        },
        "k8s": {"deployments": [{"name": "my-site", "image": "nginx:1.25"}],
                "services": [{"name": "my-site"}]},
    }


def world_p2_portfolio():
    return {
        "containers": {"prometheus": {"project": "root"},
                       "grafana": {"project": "root"}},
        "fs": {"/home/learner": ["README.md", "index.html", "main.tf"]},
        "file_contents": {
            "/home/learner/README.md": "# My site\n",
            "/home/learner/index.html": "<h1>My DevOps practice site</h1>\n",
            "/home/learner/main.tf":
                "resource \"docker_container\" \"web\" {\n"
                "  image = \"nginx:latest\"\n"
                "  name = \"web\"\n"
                "}\n",
        },
        "curl_map": {"localhost:9090": [
            "{",
            "  \"status\": \"success\",",
            "  \"targets\": \"up\"",
            "}",
        ]},
    }


def world_p2_resume():
    return {
        "containers": {"kafka-a": {"project": "root"},
                       "kafka-b": {"project": "root"},
                       "pg-primary": {"project": "root", "role": "primary"},
                       "pg-replica": {"project": "root", "role": "replica"},
                       "redis-a": {"project": "root"},
                       "moto-a": {"project": "root"},
                       "awscli": {"project": "root"},
                       "lb": {"project": "root"},
                       "web1": {"project": "root"},
                       "web2": {"project": "root"},
                       "web3": {"project": "root"}},
        "redis": {"redis-a": {"replica_of": None}},
        "kafka_clusters": ["kafka-a", "kafka-b"],
        "s3_stores": ["moto-a"],
        "s3_main": "moto-a",
        "curl_hosts": ["web1", "web2", "web3"],
        "fs": {"/home/learner": ["docker-compose.yml",
                                 "project_summary.log"]},
        "file_contents": {
            "/home/learner/docker-compose.yml":
                read_kit("phase1/kafka-lab/docker-compose.yml"),
            # Career Advanced challenge: the project log the resume
            # bullets are checked against (practice data, not in the kit)
            "/home/learner/project_summary.log":
                ("Project: order pipeline demo\n"
                 "Tools: Docker Compose, Kafka, PostgreSQL, Redis, Moto, NGINX, Python\n"
                 "Actions: configured Patroni failover, deployed NGINX across 3 backends, built a CI pipeline\n"
                 "Results: 0 data loss on failover, 0 downtime when a backend stopped, pipeline green\n"),
        },
        "scripts": {
            "check_resume.py": [
                "PASSED: 3/3 resume bullets match the Action + Tool + Outcome structure.",
            ],
        },
        "git": {"initialized": True,
                "commits": ["Add CI workflow", "Add site files"]},
        "curl_map": {"localhost:9090": [
            "{",
            "  \"status\": \"success\",",
            "  \"targets\": \"up\"",
            "}",
        ]},
        "patroni": {"members": {"patroni-1": {}, "patroni-2": {}},
                    "leader": "patroni-1"},
    }


def world_p2_best_sites():
    return {
        "containers": {},
        "fs": {"/home/learner": ["README.md"]},
    }


def world_linux_basics():
    return {
        "containers": {},
        "fs": {"/home/learner": ["readme.txt"]},
        "file_contents": {
            "/home/learner/readme.txt":
                "Welcome to Linux!\nThis file lives in your home folder.\n",
        },
    }


def world_git_basics():
    return {
        "containers": {},
        "fs": {"/home/learner": []},
        "file_contents": {},
    }


WORLDS = {
    "kafka": world_kafka,
    "postgresql": world_postgresql,
    "redis": world_redis,
    "object-store": world_object_store,
    "load-balancer": world_load_balancer,
    "end-to-end": world_end_to_end,
    "lesson-0": world_lesson_0,
    "linux-basics": world_linux_basics,
    "git-basics": world_git_basics,
    "error-decoder": world_error_decoder,
    "p1-start": world_p1_start,
    "p2-start": world_p2_start,
    "p2-zero-cost": world_p2_zero_cost,
    "p2-kubernetes": world_p2_kubernetes,
    "p2-break-fix": world_p2_break_fix,
    "p2-cheat-sheets": world_p2_cheat_sheets,
    "p2-interview": world_p2_interview,
    "p2-portfolio": world_p2_portfolio,
    "p2-resume": world_p2_resume,
    "p2-best-sites": world_p2_best_sites,
}

# step index -> world-state condition that completes the step
STEP_CHECKS = {
    "kafka": {
        0: {"containers_up": ["kafka-a", "kafka-b", "mm2"]},
        1: {"flag": "ps"},
        2: {"topic": "orders"},
        3: {"producer_sessions": 1},
        4: {"flag": "consumed:orders"},
        5: {"flag": "listed:kafka-b"},
        6: {"messages": {"topic": "a.orders", "cluster": "kafka-b",
                         "min": 3}},
        7: {"producer_sessions": 2},
        8: {"messages": {"topic": "a.orders", "cluster": "kafka-b",
                         "min": 4}},
        10: {"producer_sessions": 3},
        15: {"messages": {"topic": "a.orders", "cluster": "kafka-b",
                         "min": 5}},
    },
    "postgresql": {
        0: {"flag": "chmod"},
        1: {"containers_up": ["pg-primary", "pg-replica"]},
        2: {"flag": "ps"},
        3: {"flag": "logs:replica"},
        4: {"rows": {"table": "orders", "min": 3}},
        5: {"flag": "selected:pg-replica"},
        6: {"readonly_error": True},
        7: {"container": {"name": "pg-primary", "status": "stopped"}},
        8: {"flag_count": {"name": "selected:pg-replica", "min": 2}},
        9: {"promoted": "pg-replica"},
        10: {"flag": "recovery_checked"},
        11: {"rows": {"table": "orders", "min": 4}},
        12: {"containers_up": ["etcd", "patroni-1", "patroni-2"]},
        13: {"flag": "curl:8008"},
        14: {"rows": {"table": "patroni:orders", "min": 1}},
        15: {"flag": "selected:patroni-2"},
        16: {"container": {"name": "patroni-1", "status": "stopped"}},
        17: {"leader": "patroni-2"},
        18: {"rows": {"table": "patroni:orders", "min": 2}},
        19: {"container": {"name": "patroni-1", "status": "up"}},
    },
    "redis": {
        0: {"containers_up": ["redis-a", "redis-b"]},
        1: {"flag": "ps"},
        2: {"flag": "ping"},
        3: {"key": {"store": "redis-a", "key": "user:101"}},
        4: {"flag": "get:user:101"},
        5: {"ttl_set": {"store": "redis-a", "key": "login-code:101"}},
        6: {"flag": "ttl:login-code:101"},
        7: {"flag": "get:login-code:101"},
        8: {"key": {"store": "redis-a", "key": "orders:count"}},
        9: {"counter": {"store": "redis-a", "key": "orders:count",
                        "min": 1}},
        10: {"counter": {"store": "redis-a", "key": "orders:count",
                         "min": 2}},
        11: {"counter": {"store": "redis-a", "key": "orders:count",
                         "min": 3}},
        12: {"flag": "get:orders:count"},
        13: {"flag": "getb:user:101"},
        14: {"flag": "getb:orders:count"},
        15: {"flag": "info:replication"},
        16: {"readonly_error": True},
    },
    "object-store": {
        0: {"containers_up": ["moto-a", "moto-b", "mirror", "awscli"]},
        1: {"flag": "ps"},
        2: {"flag": "s3ls"},
        3: {"flag": "bucket:incoming"},
        4: {"file": {"store": "moto-a", "bucket": "incoming",
                     "name": "receipt-001.txt"}},
        5: {"flag": "ls:moto-a:incoming"},
        6: {"file": {"store": "moto-b", "bucket": "incoming",
                     "name": "receipt-001.txt"}},
        7: {"file": {"store": "moto-a", "bucket": "incoming",
                     "name": "receipt-002.txt"}},
        8: {"file": {"store": "moto-b", "bucket": "incoming",
                     "name": "receipt-002.txt"}},
        9: {"flag": "cat:receipt-001.txt"},
    },
    "load-balancer": {
        0: {"containers_up": ["lb", "web1", "web2", "web3"]},
        1: {"flag": "ps"},
        2: {"curl": "web1"},
        3: {"curl": "web2"},
        4: {"curl": "web3"},
        5: {"curl_count": 4},
        6: {"curl_count": 5},
        7: {"curl_count": 6},
        8: {"container": {"name": "web2", "status": "stopped"}},
        9: {"flag": "forloop"},
        10: {"container": {"name": "web2", "status": "up"}},
        11: {"flag": "curl_after_restart"},
    },
    "end-to-end": {
        0: {"flag": "chmod"},
        1: {"containers_up": ["kafka", "postgres-primary",
                              "postgres-replica", "redis", "moto", "lb",
                              "web1", "web2", "web3", "ingest", "worker"]},
        2: {"flag": "ps"},
        3: {"flag": "logs:ingest"},
        4: {"flag": "logs:worker"},
        5: {"flag": "selected:postgres-primary"},
        6: {"counter": {"store": "redis", "key": "orders:count",
                        "min": 3}},
        7: {"flag": "forloop"},
        8: {"file_written": "/home/learner/incoming/order-004.json"},
        9: {"rows": {"table": "orders", "min": 4}},
        10: {"counter": {"store": "redis", "key": "orders:count",
                         "min": 4}},
        11: {"container": {"name": "postgres-primary",
                           "status": "stopped"}},
        12: {"flag": "selected:postgres-replica"},
        13: {"promoted": "postgres-replica"},
        14: {"flag": "recovery_checked"},
        15: {"container": {"name": "worker", "status": "stopped"}},
        16: {"flag": "worker_rerun"},
        17: {"file_written": "/home/learner/incoming/order-005.json"},
        18: {"flag_count": {"name": "logs:worker", "min": 2}},
        19: {"rows": {"table": "orders", "min": 5}},
        21: {"file_written": "/home/learner/incoming/order-006.json"},
        22: {"rows": {"table": "orders", "min": 5}},
        25: {"flag_count": {"name": "logs:worker", "min": 3}},
        26: {"rows": {"table": "orders", "min": 6}},
        27: {"down": True},
    },
    # heredoc steps only complete when the file is written, never on
    # the starting command (see DEFER_STEPS below)
    "p2-zero-cost": {
        4: {"file_written": "/home/learner/devops-practice/health-check.sh"},
        16: {"file_written": "/home/learner/devops-practice/deploy.sh"},
        24: {"file_written": "/home/learner/devops-practice/check.sh"},
        27: {"file_written": "/home/learner/devops-practice/.git/hooks/pre-push"},
    },
    "p2-kubernetes": {
        2: {"file_written": "/home/learner/deployment.yaml"},
        15: {"file_written": "/home/learner/web-app.yaml"},
    },
    "p2-break-fix": {
        8: {"file_written": "/home/learner/run-tests.sh"},
        12: {"file_written": "/home/learner/notes.txt"},
        23: {"file_written": "/home/learner/Dockerfile"},
    },
    "p2-portfolio": {
        1: {"file_written": "/home/learner/.github/workflows/build.yml"},
    },
}

# steps whose output comes from the engine even on a guided match,
# because it depends on what the learner typed or on live state
LIVE_STEPS = {
    "kafka": {3, 4, 6, 7, 8, 10, 11, 12, 15},
    "postgresql": {4, 5, 6, 8, 9, 10, 11, 14, 15, 18},
    "redis": {6, 9, 10, 11, 15},
    "object-store": set(),
    "load-balancer": {2, 3, 4, 5, 6, 7, 9, 11, 15},
    "end-to-end": {3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 18, 19, 21, 22, 25, 26},
    # docker run prints a container id that differs every run
    "p2-zero-cost": {0, 9, 14},
    "p2-break-fix": {2, 5, 15, 19},
    "p2-interview": {2},
}

# steps that only complete on world state, not on the starting command
DEFER_STEPS = {
    "kafka": {3, 7, 10},
    "postgresql": set(),
    "redis": set(),
    "object-store": set(),
    "load-balancer": set(),
    "end-to-end": {8, 17, 21},
    "p2-zero-cost": {4, 16, 24, 27},
    "p2-kubernetes": {2, 15},
    "p2-break-fix": {8, 12, 23},
    "p2-portfolio": {1},
}

WELCOME = {
    "kafka": "Kafka practice terminal. Two clusters, one mirror. Type a command, or follow the step above.",
    "postgresql": "PostgreSQL practice terminal. One main database, one copy, then Patroni. Type a command, or follow the step above.",
    "redis": "Redis practice terminal. Two copies of the same data. Type a command, or follow the step above.",
    "object-store": "Object store practice terminal. Two stores, one mirror. Type a command, or follow the step above.",
    "load-balancer": "Load balancer practice terminal. One door, three backends. Type a command, or follow the step above.",
    "end-to-end": "End-to-end practice terminal. The whole shop in one box. Type a command, or follow the step above.",
    "lesson-0": "Lesson 0 practice terminal. Check the tools, then run the machine check. Type a command, or follow the step above.",
    "error-decoder": "Error decoder practice terminal. Break it on purpose, then fix it. Type a command, or follow the step above.",
    "linux-basics": "Linux practice terminal. You are in your home folder. Type a command, or follow the step above.",
    "git-basics": "Git practice terminal. You are in an empty folder. Type a command, or follow the step above.",
    "p1-start": "Phase 1 start practice terminal. Five doors, one knock each. Type a command, or follow the step above.",
    "p2-start": "Phase 2 start practice terminal. Five tools, one version check each. Type a command, or follow the step above.",
    "p2-zero-cost": "Zero-cost practice terminal. One machine, one free website. Type a command, or follow the step above.",
    "p2-kubernetes": "Kubernetes practice terminal. A small cluster on your own machine. Type a command, or follow the step above.",
    "p2-break-fix": "Break-and-fix practice terminal. Six small breaks, six fixes. Type a command, or follow the step above.",
    "p2-cheat-sheets": "Cheat sheet practice terminal. The commands you will actually use. Type a command, or follow the step above.",
    "p2-interview": "Interview practice terminal. Four moments, one command each. Type a command, or follow the step above.",
    "p2-portfolio": "Portfolio practice terminal. Three projects, checked step by step. Type a command, or follow the step above.",
    "p2-resume": "Resume proof practice terminal. Every bullet, checked. Type a command, or follow the step above.",
    "p2-best-sites": "Help lookup practice terminal. Ask the tools for their own help. Type a command, or follow the step above.",
}


def enrich_sim(slug, sim):
    """Attach the shell world and step checks to a sim for the page."""
    sim = dict(sim)
    steps = []
    for i, s in enumerate(sim["steps"]):
        s = dict(s)
        check = STEP_CHECKS.get(slug, {}).get(i)
        if check:
            s["done_when"] = check
        if i in LIVE_STEPS.get(slug, set()):
            s["live"] = True
        if i in DEFER_STEPS.get(slug, set()):
            s["defer"] = True
        steps.append(s)
    sim["steps"] = steps
    world = WORLDS[slug]()
    # up/down outputs come from the lab's own documented outputs, so the
    # free-play shell prints exactly what the lab prints
    up_out = {}
    for s in sim["steps"]:
        if "compose up" in s["cmd"]:
            proj = "patroni" if "cd patroni" in s["cmd"] else "root"
            up_out[proj] = s["out"]
        if "compose down" in s["cmd"]:
            world["down_out"] = s["out"][0]
    world["up_out"] = up_out
    sim["world"] = world
    sim["welcome"] = WELCOME.get(slug, "Practice terminal. Type a command, or follow the step above.")
    return sim


# Per-lesson ladder notes. TOPIC_LADDERS shares one stage between
# two start pages, and Lesson 0's ladder disagreed with its own body —
# so these two lessons override the shared text. Keys: "can" replaces
# the "After this lesson you can" line, "next" replaces the generated
# Next line, "challenge" replaces (None removes) the Advanced line.
LADDER_NOTE_OVERRIDES = {
    # Lesson 0's body says "Then go to Phase 1" — the ladder must agree.
    "lesson-0": {"next": ('Next: <b>Phase 1 &middot; Start here</b> — How data moves, '
                         'copies itself, and survives a crash. See '
                         '<a href="/lessons/p1-start.html">Start Here</a>.')},
    # Phase 2 Start teaches the Phase 2 map, not the Whole System
    # Beginner stage it shares with Phase 1 Start.
    "p2-start": {"can": "Explain what Phase 2 teaches, in what order, and what you will have at the end.",
                 "next": ('Next: <b>Zero-Cost Lab</b> — Set up your machine and '
                          'run your first container. Do this first. See '
                          '<a href="/lessons/p2-zero-cost.html">Zero-Cost Lab</a>.'),
                 "challenge": None},
}


def _ladder_bar_one(topic, covered, override=None):
    """One per-topic 3-stage ladder bar (Gemini ladders).

    A real path: Step 1 -> Step 2 -> Step 3, with "You are here" on the
    stage this lesson leaves you at. Unbuilt stages say "Coming next".
    Each step and its arrow sit in one .step-unit span, so an arrow can
    never wrap alone onto a new line at phone width."""
    stages, challenge = next((s, c) for (t, s, c) in TOPIC_LADDERS if t == topic)
    chips = []
    top = max(covered)
    for i, (name, what, lessons, _can) in enumerate(stages):
        label = f'Step {i + 1} &middot; {name}'
        here = ' <span class="here">&#8592; You are here</span>' if i == top else ''
        if i in covered:
            chips.append(f'<span class="step done">&#10003; {label}{here}</span>')
        elif lessons:
            chips.append(f'<span class="step">{label}</span>')
        else:
            chips.append(f'<span class="step">{label} &middot; Coming next</span>')
    units = []
    for i, chip in enumerate(chips):
        if i < len(chips) - 1:
            units.append(f'<span class="step-unit">{chip}<span class="ladder-arrow">&rarr;</span></span>')
        else:
            units.append(f'<span class="step-unit">{chip}</span>')
    can_text = (override or {}).get("can") or stages[top][3]
    notes = [f'After this lesson you can: <b>{html.escape(can_text)}</b>']
    uncovered = [i for i in range(3) if i not in covered and i > max(covered)]
    if override is not None and "next" in override:
        if override["next"]:
            notes.append(override["next"])
    elif uncovered:
        ni = uncovered[0]
        nname, nwhat, nlessons, _ncan = stages[ni]
        if nlessons:
            nxt = ("Next: <b>Step " + str(ni + 1) + " &middot; " + html.escape(nname) + "</b> — " +
                   html.escape(nwhat) + " See " +
                   ", ".join(f'<a href="/lessons/{s}.html">{html.escape(SHORT[s])}</a>'
                             for s in nlessons) + ".")
        else:
            nxt = ("Next: <b>Step " + str(ni + 1) + " &middot; " + html.escape(nname) + "</b> — " +
                   html.escape(nwhat) + " <b>Coming next.</b>")
        notes.append(nxt)
    elif set(covered) == {0, 1, 2}:
        notes.append("You have finished this topic&rsquo;s ladder.")
    else:
        notes.append("This is the last step of the " + html.escape(topic) + " ladder.")
    adv_built = bool(stages[2][2])
    if override is not None and "challenge" in override:
        if override["challenge"]:
            adv_lessons = ", ".join(
                f'<a href="/lessons/{s}.html">{html.escape(SHORT[s])}</a>'
                for s in stages[2][2])
            notes.append(f'Advanced challenge: <b>{html.escape(override["challenge"])}</b> — try it in {adv_lessons}.')
    elif adv_built:
        adv_lessons = ", ".join(
            f'<a href="/lessons/{s}.html">{html.escape(SHORT[s])}</a>'
            for s in stages[2][2])
        notes.append(f'Advanced challenge: <b>{html.escape(challenge)}</b> — try it in {adv_lessons}.')
    else:
        notes.append(f'Advanced challenge: <b>{html.escape(challenge)}</b> <b>Coming next.</b>')
    return ('<div class="ladder"><div class="ladder-title">Your level in '
            f'{html.escape(topic)}</div><div class="ladder-steps">'
            + "".join(units) + "</div>" +
            "".join(f'<div class="ladder-note">{n}</div>' for n in notes) +
            "</div>")


def ladder_bar(slug):
    """Per-topic 3-stage ladder bar(s) for a lesson page.

    Most lessons teach one topic; a lesson that teaches two (the
    Zero-Cost Lab) gets a second bar, so every pill the lesson
    carries is backed by a visible ladder."""
    if slug == "p2-break-fix":
        return ('<div class="ladder"><div class="ladder-title">Practice labs — Docker, Git and ports</div>'
                '<div class="ladder-note">These labs are extra practice, not one topic&rsquo;s ladder. '
                'Six small breaks to fix: a wrong image name, a container that dies, a missing test file, '
                'a merge conflict, a closed port, a wrong Dockerfile. They practise Docker, Git and ports '
                '— the same skills the Docker, Linux and on-call ladders teach.</div></div>')
    if slug not in LESSON_STAGE:
        return ('<div class="ladder"><div class="ladder-title">Reference tool</div>'
                '<div class="ladder-note">This page supports every topic — '
                'use it whenever you are stuck. It has no ladder of its own.</div></div>')
    topic, covered = LESSON_STAGE[slug]
    bars = [_ladder_bar_one(topic, covered, LADDER_NOTE_OVERRIDES.get(slug))]
    if slug in LESSON_STAGE_EXTRA:
        topic2, covered2 = LESSON_STAGE_EXTRA[slug]
        bars.append(_ladder_bar_one(topic2, covered2))
    return "".join(bars)


def levels_section_html():
    """'Your level in each topic' section for the landing page.

    One short line per stage: the plain-words description plus a link
    to the lesson that teaches it. The "You can:" repeats and the
    "Advanced challenge:" lines are gone from here — they live on the
    lesson pages, where the learner is about to do them. Unbuilt
    stages still say "Coming next" honestly."""
    out = []
    for topic, stages, challenge in TOPIC_LADDERS:
        rows = []
        for name, what, lessons, can in stages:
            if lessons:
                links = ", ".join(
                    f'<a href="/lessons/{s}.html">{html.escape(SHORT[s])}</a>'
                    for s in lessons)
                rows.append(f'<div class="lv"><b>{name}:</b> {html.escape(what)} '
                            f'({links})</div>')
            else:
                rows.append(f'<div class="lv"><b>{name}:</b> {html.escape(what)} '
                            f'<span class="soon">Coming next.</span></div>')
        out.append(f'<div class="level-topic"><h3>{html.escape(topic)}</h3>'
                   + "".join(rows) + "</div>")
    return "\n".join(out)


def inline_code(escaped):
    """Render `code` spans inside an already HTML-escaped string."""
    parts = escaped.split("`")
    out = []
    for i, p in enumerate(parts):
        out.append(f"<code>{p}</code>" if i % 2 == 1 else p)
    return "".join(out)


# Sidebar groups in course order (W3Schools-style: every lesson, one list).
SIDEBAR_GROUPS = [
    ("Start here", ["lesson-0"]),
    ("Phase 1 · The Data Tier", ["p1-start", "p1-kafka", "p1-postgresql",
                                 "p1-redis", "p1-object-store",
                                 "p1-load-balancer", "p1-end-to-end"]),
    ("Phase 2 · The Rest of DevOps", ["p2-start", "p2-zero-cost",
                                      "p2-kubernetes", "p2-break-fix",
                                      "p2-cheat-sheets", "p2-interview",
                                      "p2-portfolio", "p2-resume",
                                      "p2-best-sites"]),
    ("Free skills", ["linux-basics", "git-basics"]),
    ("Reference", ["error-decoder"]),
]


# --- SEO / social meta (was the build-improvements.js post-
# processor; now built in so a regen keeps the tags) ---------------
LANDING_DESC = ('Learn DevOps by doing: practise Kafka, PostgreSQL '
                'failover, Redis, Docker and Kubernetes in a safe '
                'browser terminal, then run the same commands on your '
                'laptop. Zero cloud bill.')


def _meta_clip(desc, n=155):
    # Same clip as the old post-processor: cut at 155 chars, drop the
    # cut-off word, add an ellipsis.
    if len(desc) <= n:
        return desc
    return re.sub(r"\s+\S*$", "", desc[:n]) + "\u2026"


def _meta_strip(text):
    # Strip tags and entities to plain text.
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&rsquo;", "'").replace("&#8217;", "'")
    text = text.replace("&amp;", "&")
    text = re.sub(r"&[a-z]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _meta_attr(text):
    return (text.replace("&", "&amp;").replace('"', "&quot;")
                .replace("<", "&lt;"))


def _meta_first_para(html_text):
    """First <p> after the page's <h1>, as plain text (the lesson
    description). The lesson body starts with the big-picture block,
    so its first paragraph is the one the old post-processor used."""
    m = re.search(r"<p[^>]*>(.*?)</p>", html_text, re.S)
    return _meta_strip(m.group(1)) if m else ""


def meta_tags(title, desc, url):
    """SEO/social meta block for one page."""
    desc = _meta_clip(desc)
    title = _meta_strip(title)
    return (
        f'<meta name="description" content="{_meta_attr(desc)}">\n'
        f'<meta name="theme-color" content="#14161b">\n'
        f'<link rel="canonical" href="{url}">\n'
        f'<link rel="icon" href="/favicon.ico">\n'
        f'<meta property="og:type" content="website">\n'
        f'<meta property="og:site_name" content="DevOps Kit by PromptStudio">\n'
        f'<meta property="og:title" content="{_meta_attr(title)}">\n'
        f'<meta property="og:description" content="{_meta_attr(desc)}">\n'
        f'<meta property="og:url" content="{url}">\n'
        f'<meta name="twitter:card" content="summary">\n'
        f'<link rel="preconnect" href="https://www.gstatic.com" crossorigin>\n'
    )


def sidebar_html(current_slug):
    parts = ['<nav class="lesson-sidebar" id="lesson-sidebar" '
             'aria-label="All lessons">'
             '<div class="sb-head"><b>DevOps Kit</b>'
             '<span>All 18 lessons</span></div>']
    for gtitle, slugs in SIDEBAR_GROUPS:
        parts.append(f'<div class="sb-group"><span class="sb-group-title">'
                     f'{html.escape(gtitle)}</span>')
        for s in slugs:
            cur = (' class="sb-link current" aria-current="page"'
                   if s == current_slug else ' class="sb-link"')
            parts.append(f'<a{cur} href="/lessons/{s}.html">'
                         f'{html.escape(SHORT[s])}</a>')
        parts.append('</div>')
    parts.append('</nav>')
    return "".join(parts)


def build():
    os.makedirs(os.path.join(OUT, "assets"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "lessons"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "sims"), exist_ok=True)
    with open(os.path.join(OUT, "assets", "style.css"), "w") as f:
        f.write(CSS + AUTH_CSS + CSS_APPEND)
    with open(os.path.join(OUT, "assets", "sim.js"), "w") as f:
        f.write(JS)
    # Every file in assets-src/ ships to assets/ (JS and genz.css alike).
    for name in sorted(os.listdir(os.path.join(OUT, "assets-src"))):
        with open(os.path.join(OUT, "assets-src", name)) as f:
            src = f.read()
        with open(os.path.join(OUT, "assets", name), "w") as f:
            f.write(src)
    # Language files for the picker (i18n.js loads them on demand).
    os.makedirs(os.path.join(OUT, "i18n"), exist_ok=True)
    for name in sorted(os.listdir(os.path.join(OUT, "i18n-src"))):
        with open(os.path.join(OUT, "i18n-src", name)) as f:
            src = f.read()
        with open(os.path.join(OUT, "i18n", name), "w") as f:
            f.write(src)
    # Static 404 page (not generated).
    with open(os.path.join(OUT, "static", "404.html")) as f:
        notfound = f.read()
    with open(os.path.join(OUT, "404.html"), "w") as f:
        f.write(notfound)

    # --- lessons
    lesson_items = []
    for idx, (slug, title, phase, mdfile, sim) in enumerate(LESSONS):
        src = os.path.join(KIT, mdfile)
        with open(src) as f:
            md = f.read()
        md = apply_moto_fixes(md, mdfile)
        body = md_to_html(md)
        # strip the first H1 (title is in the page header)
        body = re.sub(r"^<h1>.*?</h1>\n?", "", body, count=1)
        # big-picture first (layout change 2026-11-22): the
        # "## What this is and why it matters" block goes above the
        # sim callout, so a learner reads the idea before the
        # terminal. If a lesson has no such section, fall back to
        # the old order (sim callout, then the full body).
        bigpic = ""
        m = re.search(r"<h2>What this is and why it matters</h2>", body)
        if m:
            nxt = body.find("<h2>", m.end())
            end = nxt if nxt != -1 else len(body)
            bigpic = body[m.start():end]
            body = body[:m.start()] + body[end:]
        # Pager: free lessons (Lesson 0, Error Decoder) link only to
        # each other, never into a paid lesson. Paid lessons link
        # through the full course order.
        prev_link = next_link = ""
        if phase == "free":
            # Free chain: Lesson 0 -> Linux -> Git -> Error Decoder.
            fidx = FREE_PAGER_CHAIN.index(slug)
            if fidx > 0:
                p = FREE_PAGER_CHAIN[fidx - 1]
                prev_link = (f'<a class="prev" href="/lessons/{p}.html">'
                             f'<span>← Previous lesson</span>'
                             f'<span class="pname">{FREE_PAGER_NAMES[p]}</span></a>')
            else:
                prev_link = ('<a class="prev" href="/">'
                             '<span>← Home</span>'
                             '<span class="pname">DevOps Kit</span></a>')
            if fidx < len(FREE_PAGER_CHAIN) - 1:
                n = FREE_PAGER_CHAIN[fidx + 1]
                next_link = (f'<a class="next" href="/lessons/{n}.html">'
                             f'<span>Next lesson →</span>'
                             f'<span class="pname">{FREE_PAGER_NAMES[n]}</span></a>')
        else:
            if idx > 0:
                p = LESSONS[idx - 1]
                prev_link = (f'<a class="prev" href="/lessons/{p[0]}.html">'
                             f'<span>← Previous lesson</span>'
                             f'<span class="pname">{SHORT[p[0]]}</span></a>')
            else:
                prev_link = ('<a class="prev" href="/">'
                             '<span>← Home</span>'
                             '<span class="pname">DevOps Kit</span></a>')
            if idx < len(LESSONS) - 1:
                n = LESSONS[idx + 1]
                next_link = (f'<a class="next" href="/lessons/{n[0]}.html">'
                             f'<span>Next lesson →</span>'
                             f'<span class="pname">{SHORT[n[0]]}</span></a>')
        if phase == "free":
            phase_name = "Free"
            crumb = ("Free · Before you start" if slug == "lesson-0"
                     else "Free · Error decoder")
            badge = '<span class="phasebadge">Free</span>'
        else:
            phase_name = ("The Data Tier" if phase == "phase1"
                          else "The Rest of DevOps")
            crumb = (f'Lesson {idx + 1} of {len(LESSONS)}')
            badge = (f'<span class="phasebadge">Phase '
                     f'{"1" if phase == "phase1" else "2"} · '
                     f'{phase_name}</span>')
        # Per-lesson label: the Docker line only where the real lab
        # genuinely runs in Docker; the six no-Docker lessons get
        # their own true line from SIM_LABEL_PLAIN. It lives in the
        # single Try it Yourself box — the old simbox said the same
        # thing twice, and wrongly claimed a terminal "on this page".
        label = SIM_LABEL_PLAIN.get(sim, SIM_LABEL) if sim else ""
        phase_bit = ""
        if sim:
            phase_bit = ("Free. " if phase == "free" else
                         f"Included with {'Phase 1' if phase == 'phase1' else 'Phase 2'}. ")
        # Try it Yourself (W3Schools-style): the ONE sim button on the
        # lesson, right before the first example/command. It carries the
        # phase (Free / Included with Phase 1 or 2) and the per-lesson
        # practice-version label, so nothing is said twice.
        tryit = ""
        if sim:
            tryit = (f'<div class="tryit"><a class="btn amber" '
                     f'href="/sims/{sim}.html">Try it Yourself '
                     f'&raquo;</a><span>Open the practice terminal and '
                     f'run it yourself — nothing installs. {phase_bit}'
                     f'{label}</span></div>')
            pos = body.find('<div class="codeblock">')
            if pos != -1:
                body = body[:pos] + tryit + body[pos:]
            else:
                body = tryit + body
                print(f"  note: {slug} has no codeblock — tryit at top")
        # Quick-check exercise at the end of the lesson, before the pager.
        ex = EXERCISES.get(slug)
        if ex:
            q = inline_code(html.escape(ex[0]))
            a = inline_code(html.escape(ex[1]))
            ex_link = (f'<p><a href="/sims/{sim}.html">Open the '
                       f'practice terminal to test this &rarr;</a></p>'
                       if sim else '')
            body += (f'<div class="exercise"><h2>Quick check — try it '
                     f'yourself</h2><p><b>Question:</b> {q}</p>{ex_link}'
                     f'<details class="exercise-answer"><summary>Show '
                     f'answer</summary><p>{a}</p></details></div>')
        else:
            print(f"  WARNING: {slug} has no exercise")
        meta = meta_tags(title + " — DevOps Kit",
                         _meta_first_para(bigpic + body),
                         f"https://promptstudioai.in/lessons/{slug}.html")
        page = (LESSON_HEAD.format(title=html.escape(title),
                                   crumb=html.escape(crumb),
                                   slug=slug, phase=phase,
                                   home=HOME_ICON, meta_tags=meta) +
                sidebar_html(slug) +
                f'<div class="lesson-main">'
                + ("" if phase == "free" else lock_screen(phase)) +
                f'<div class="lesson-content" id="lesson-content">'
                f'<span id="main" tabindex="-1"></span>'
                f'<h1>{html.escape(title)}</h1>'
                f'{badge}'
                f'{bigpic}{ladder_bar(slug)}{body}'
                f'<button class="btn mark-done" id="btn-mark-done" type="button" hidden>Mark this lesson as done</button>'
                f'<nav class="pager">{prev_link}{next_link}</nav>'
                f'</div>'
                f'</div>'
                f'</main>'
                + AUTH_MODAL + AUTH_SCRIPTS +
                f'<script defer src="/assets/lesson.js"></script>'
                f'</body></html>')
        with open(os.path.join(OUT, "lessons", slug + ".html"), "w") as f:
            f.write(page)
        lesson_items.append((slug, title, phase, sim))
        print(f"  lesson: {slug}.html")

    # --- free skill lessons (Linux Command Line, Git Basics) ---
    # No kit.md source: bodies live in SKILL_LESSONS. The live pages
    # were cloned from Lesson 0, so two quirks are reproduced verbatim:
    # the sidebar marks Lesson 0 as current, and the body is followed
    # by an extra </div> before the mark-done button.
    for slug, sk in SKILL_LESSONS.items():
        title = sk["title"]
        crumb = "Free skill · " + title.split(" — ")[0]
        badge = '<span class="phasebadge">Free skill</span>'
        pn, pt = sk["prev"]
        nn, nt = sk["next"]
        prev_link = (f'<a class="prev" href="/lessons/{pn}.html">'
                     f'<span>← Previous lesson</span>'
                     f'<span class="pname">{pt}</span></a>')
        next_link = (f'<a class="next" href="/lessons/{nn}.html">'
                     f'<span>Next lesson →</span>'
                     f'<span class="pname">{nt}</span></a>')
        meta = meta_tags(title + " — DevOps Kit",
                         _meta_first_para(sk["body"]),
                         f"https://promptstudioai.in/lessons/{slug}.html")
        page = (LESSON_HEAD.format(title=html.escape(title),
                                   crumb=html.escape(crumb),
                                   slug=slug, phase="free",
                                   home=HOME_ICON, meta_tags=meta) +
                sidebar_html("lesson-0") +
                f'<div class="lesson-main">'
                f'<div class="lesson-content" id="lesson-content">'
                f'<span id="main" tabindex="-1"></span>'
                f'<h1>{html.escape(title)}</h1>'
                f'{badge}'
                f'{sk["body"]}'
                f'</div>'
                f'<button class="btn mark-done" id="btn-mark-done" type="button" hidden>Mark this lesson as done</button>'
                f'<nav class="pager">{prev_link}{next_link}</nav>'
                f'</div>'
                f'</div>'
                f'</main>'
                + AUTH_MODAL + AUTH_SCRIPTS +
                f'<script defer src="/assets/lesson.js"></script>'
                f'</body></html>')
        with open(os.path.join(OUT, "lessons", slug + ".html"), "w") as f:
            f.write(page)
        lesson_items.append((slug, title, "free", slug))
        print(f"  lesson: {slug}.html (skill)")

    # --- simulations
    for sidx, (slug, sim) in enumerate(SIMS.items()):
        sim = enrich_sim(slug, sim)
        # find the lesson for this sim
        lesson = next((l for l in LESSONS if l[4] == slug), None)
        if lesson is None and slug in SKILL_LESSONS:
            # Free skill sims have no LESSONS row; the short title and
            # free phase give the same exit link and lock screen.
            lesson = (slug, SKILL_LESSONS[slug]["short"], "free", None, slug)
        if slug in SKILL_SIMS:
            # The hand-built skill sims ship SIM_DATA as
            # slug/title/intro/proof/welcome/world/steps, and their
            # worlds carry no up_out (no compose step to report).
            # Rebuild in that order so the regen is byte-identical.
            sim = {"slug": slug, "title": sim["title"],
                   "intro": sim["intro"], "proof": sim["proof"],
                   "welcome": sim["welcome"], "world": sim["world"],
                   "steps": sim["steps"]}
            sim["world"].pop("up_out", None)
        data_js = "window.SIM_DATA = " + json_str(sim) + ";"
        map_html = ""
        if sim.get("map"):
            boxes = ""
            for bid, label, sub in sim["map"]:
                boxes += (f'<div class="flowbox mapbox" id="fb-{bid}" '
                          f'data-box="{bid}">'
                          f'<strong>{label}</strong><small>{sub}</small></div>')
                boxes += '<span class="maparrow">→</span>'
            boxes = boxes[:-len('<span class="maparrow">→</span>')]
            map_html = f'<div class="flowmap" id="flowmap">{boxes}</div>'
        containers = ", ".join(sim["world"]["containers"].keys())
        after_html = ""
        if "after" in sim:
            after_html = (f'<p><b>After you finish:</b> '
                          f'{html.escape(sim["after"])}</p>')
        proof_html = ""
        if "proof" in sim:
            proof_html = (f'<p><b>Your proof:</b> '
                          f'{html.escape(sim["proof"])}</p>')
        back = (f'<a href="/lessons/{lesson[0]}.html">← Back to the '
                f'{html.escape(lesson[1])} lesson</a>' if lesson else
                '<a href="/">← Home</a>')
        exit_link = (f'<a class="exit" href="/lessons/{lesson[0]}.html">'
                     f'&larr; Lesson</a>' if lesson else
                     '<a class="exit" href="/">&larr; Lessons</a>')
        lesson_link = (f'<a href="/lessons/{lesson[0]}.html">'
                       f'{html.escape(lesson[1])}</a>' if lesson else
                       '<a href="/">DevOps Kit</a>')
        sim_phase = lesson[2] if lesson else "phase1"
        page_title = sim["title"] + (" — Free Simulation"
                                     if slug in SKILL_SIMS else "")
        meta = meta_tags(page_title + " — DevOps Kit", sim["intro"],
                         f"https://promptstudioai.in/sims/{slug}.html")
        if slug in SKILL_SIMS:
            about_inner = (
                '<p>This is the practice version of the lesson. Everything '
                'runs in your browser tab — no install, no server, works on '
                'your phone.</p>'
                f'<p><b>What it is:</b> {html.escape(sim["intro"], quote=False)}</p>'
                '<p><b>What it does NOT do:</b> it does not touch your '
                'computer or run any real service. It teaches the commands; '
                'to build the habit, repeat them on your own machine.</p>'
                f'<p><b>Your proof:</b> {html.escape(sim["proof"], quote=False)}</p>'
                f'<p><a href="/lessons/{slug}.html">← Back to the lesson</a></p>')
        else:
            about_inner = (
                f'<p>Practice version of the {lesson_link} lab. It mimics '
                f'the lab&rsquo;s real outputs in your browser, so you can '
                f'practise the commands on your phone. Nothing real runs '
                f'or installs here.</p>'
                f'<p><b>The real lab:</b> {html.escape(sim["intro"])}</p>'
                f'<p><b>What it does NOT do:</b> it does not run a live '
                f'service, it does not hold real data, and it does not '
                f'touch your machine beyond this tab.</p>'
                f'{after_html}'
                f'{proof_html}'
                f'<p><b>After you finish:</b> run the real lab with Docker '
                f'on your computer — the same commands, on your own '
                f'machine. That is where the learning sticks.</p>'
                f'<p>{back}</p>')
        page = (SIM_HEAD.format(title=html.escape(page_title), slug=slug, phase=sim_phase, meta_tags=meta) +
                f'<div class="sim-shell" role="main">'
                + lock_screen(sim_phase, "This simulation") +
                f'<div class="resume-note" id="sim-resume-note" hidden></div>'
                f'<div class="sim-topbar" role="navigation" aria-label="Simulation">'
                + HOME_ICON
                + exit_link +
                f'<span class="sim-title" role="heading" aria-level="1">{html.escape(sim["title"])}</span>'
                f'<span class="sim-prog-track"><span class="sim-prog-fill" '
                f'id="sim-prog-fill"></span></span>'
                f'<span class="auth-slot" id="auth-slot"></span></div>'
                f'<details class="sim-about"><summary>About this simulation'
                f'</summary><div class="about-body">'
                f'{about_inner}'
                f'</div></details>'
                f'{map_html}'
                f'<div class="stepcard" id="step-card">'
                f'<div class="step-head">'
                f'<span class="stepcount" id="step-count"></span>'
                f'<button class="hint-toggle" id="btn-hint" type="button" '
                f'aria-expanded="true">Hide hint</button></div>'
                f'<div id="step-text"></div>'
                f'<span class="step-done-badge" id="step-done-badge"></span>'
                f'<div class="stepactions">'
                f'<button id="btn-skip" type="button">Skip this step</button>'
                f'<button id="btn-skip-all" type="button" class="ghost">'
                f'Skip all steps — free play</button>'
                f'</div></div>'
                f'<div class="freebanner" id="free-banner" '
                f'style="display:none"><b>◆ Free play</b>'
                f'<span>Sandbox is live. It knows the lab commands — type '
                f'<code>help</code> to see them. Try things, break things, '
                f'test edge cases. Type <code>clear</code> to clean the screen.</span></div>'
                f'<div class="terminal" id="term" role="region" aria-label="Practice terminal"><span id="main" tabindex="-1"></span>'
                f'<div class="term-chrome"><span class="status-dot"></span>'
                f'<span class="container-name">bash — '
                f'{html.escape(containers)}</span>'
                f'<div class="quickkeys">'
                f'<button id="btn-tab" type="button">Tab</button>'
                f'<button id="btn-up" type="button">↑</button>'
                f'<button id="btn-ctrlc" type="button">Ctrl+C</button>'
                f'<button id="btn-clear" type="button" class="ghost">'
                f'Clear</button></div></div>'
                f'<div class="term-out" id="term-out" role="log" aria-live="polite" aria-relevant="additions"></div>'
                f'<div class="term-input-row">'
                f'<span class="tprompt" id="term-prompt">'
                f'learner@devops:~$</span>'
                f'<input id="term-input" type="text" autocomplete="off" '
                f'autocapitalize="off" autocorrect="off" spellcheck="false" '
                f'placeholder="type a command, press Enter">'
                f'</div></div>'
                f'</div>'
                + AUTH_MODAL + AUTH_SCRIPTS_SIM +
                f'<script>{data_js}</script>'
                f'<script defer src="/assets/sim.js"></script>'
                f'<script defer src="/assets/sim-chrome.js"></script>'
                f'</body></html>')
        with open(os.path.join(OUT, "sims", slug + ".html"), "w") as f:
            f.write(page)
        print(f"  sim: {slug}.html ({len(sim['steps'])} steps)")

    # --- landing
    # The three free sims (same set as FREE_SIMS in devops-app.js).
    # A free sim keeps its "Try free" label even when its lesson sits
    # inside a paid phase — Kafka is a Phase 1 lesson, its sim is free.
    FREE_SIM_SLUGS = ("lesson-0", "kafka", "error-decoder",
                        "linux-basics", "git-basics")

    def curriculum_rows(ph):
        rows = []
        for gidx, (s, t, p, sim) in enumerate(lesson_items):
            if p != ph:
                continue
            if s in SKILL_LESSONS:
                # Skill labs get their own rows below (number "+", title
                # "Free skill: ..."), not numbered course rows.
                continue
            tag = {"phase1": "P1", "phase2": "P2", "free": "Free"}.get(p, "P2")
            summary = LESSON_SUMMARIES.get(s, "")
            sub = (f'<div class="sub">{html.escape(summary)}</div>'
                   if summary else "")
            if sim:
                if sim in FREE_SIM_SLUGS:
                    sub += (f'<div class="sub"><a href="/sims/{sim}.html">'
                            f'&#9654; Try the simulation free</a></div>')
                    pill = ' <span class="pill sim">Try free</span>'
                else:
                    phn = "Phase 1" if p == "phase1" else "Phase 2"
                    sub += (f'<div class="sub"><a href="/sims/{sim}.html">'
                            f'&#9654; Simulation — included with {phn}</a></div>')
                    pill = ' <span class="pill sim">Sim included</span>'
            else:
                sub += '<div class="sub">Guide only</div>'
                pill = ''
            rows.append(
                f'      <div class="lesson-row" data-lesson="{s}" data-phase="{p}">'
                f'<span class="n">{gidx + 1:02d}</span>'
                f'<div class="lr-main"><a href="/lessons/{s}.html">'
                f'{html.escape(t)}</a>{pill}{sub}</div>'
                f'<span class="rowtags"><span class="ptag">{tag}</span>'
                f'<span class="stag">{html.escape(LESSON_PILL.get(s, ""))}</span></span></div>')
        if ph == "free":
            # Free skill labs: not in the numbered course, so the
            # number is "+" and the title carries the "Free skill:"
            # prefix (hand-built rows from the PR #120 site).
            for s in SKILL_LESSONS:
                sk = SKILL_LESSONS[s]
                sub = (f'<div class="sub">{html.escape(sk["sub"])}</div>'
                       f'<div class="sub"><a href="/sims/{s}.html">'
                       f'&#9654; Try the simulation free</a></div>')
                rows.append(
                    f'      <div class="lesson-row" data-lesson="{s}" data-phase="free">'
                    f'<span class="n">+</span>'
                    f'<div class="lr-main"><a href="/lessons/{s}.html">'
                    f'{html.escape(sk["row_title"])}</a>'
                    f' <span class="pill sim">Try free</span>{sub}</div>'
                    f'<span class="rowtags"><span class="ptag">Free</span>'
                    f'<span class="stag">{html.escape(LESSON_PILL[s])}</span></span></div>')
        return "\n".join(rows)
    sim_phase_by_slug = {}
    for _s, _t, _p, _sim in lesson_items:
        if _sim:
            sim_phase_by_slug[_sim] = _p
    # Free sims first (Lesson 0, Kafka, Error Decoder), then Phase 1,
    # then Phase 2 — each card carries its tier, so the price is honest
    # at a glance. The free set matches FREE_SIMS in devops-app.js.
    _sim_order = (list(FREE_SIM_SLUGS)
                  + [s for s in SIMS
                     if s not in FREE_SIM_SLUGS
                     and sim_phase_by_slug.get(s) == "phase1"]
                  + [s for s in SIMS if sim_phase_by_slug.get(s) == "phase2"])

    def _sim_card(slug):
        s = SIMS[slug]
        if slug in FREE_SIM_SLUGS:
            tier, tcls = "Free", " free"
        elif sim_phase_by_slug.get(slug) == "phase1":
            tier, tcls = "Phase 1 \u00b7 \u20b9399", ""
        else:
            tier, tcls = "Phase 2 \u00b7 \u20b9799", ""
        return (f'      <div class="simcard" data-sim="{slug}" data-phase="{sim_phase_by_slug.get(slug, "phase1")}">'
                f'<div class="simpills"><span class="steppill">{len(s["steps"])} STEPS</span>'
                f'<span class="tierpill{tcls}">{tier}</span></div>'
                f'<h3>{html.escape(SIM_SHORT[slug])}</h3>'
                f'<p>{html.escape(SIM_TASKS[slug])}</p>'
                f'<div class="simprog">'
                + '<i></i>' * len(s["steps"]) +
                f'<span>0/{len(s["steps"])}</span></div>'
                f'<a class="btn amber" href="/sims/{slug}.html">'
                f'Launch Terminal &rarr;</a></div>')

    sim_cards = "\n".join(_sim_card(slug) for slug in _sim_order)
    landing_meta = meta_tags(
        "DevOps Kit — Learn by Doing, On Your Own Machine | PromptStudio",
        LANDING_DESC, "https://promptstudioai.in/")
    with open(os.path.join(OUT, "index.html"), "w") as f:
        f.write(LANDING.format(
            home=HOME_ICON,
            meta_tags=landing_meta,
            curriculum_free=curriculum_rows("free"),
            curriculum_p1=curriculum_rows("phase1"),
            curriculum_p2=curriculum_rows("phase2"),
            levels_section=levels_section_html(),
            sim_cards=sim_cards))
    print("  landing: index.html")
    # Sitemap: every public page, lastmod = today (same rule as the
    # old build-improvements.js post-processor it replaces).
    pages = ["index.html"] + sorted(
        "lessons/" + s + ".html"
        for s in [l[0] for l in LESSONS] + list(SKILL_LESSONS)) + sorted(
        "sims/" + s + ".html" for s in SIMS)
    today = datetime.date.today().isoformat()
    urls = []
    for p in pages:
        loc = "https://promptstudioai.in/" + ("" if p == "index.html" else p)
        pr = ("1.0" if p == "index.html" else
              "0.8" if p.startswith("lessons/") else "0.6")
        urls.append(f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
                    f'<priority>{pr}</priority></url>')
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(urls) + "\n</urlset>\n")
    print("  sitemap: sitemap.xml")


def json_str(obj):
    import json
    return json.dumps(obj, ensure_ascii=False)


if __name__ == "__main__":
    build()
    print("build done")
