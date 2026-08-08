# Secret Audit Report

Found instances of a Firebase API key and `.env` entries in repository history.

Occurrences (commits containing the API key / .env):

```
30fdb344e4843276cc1f6bdf2721721393467a46
725f1cb57328fc52acdc844aed83ef9063d82cbf
ca655c4fcf0e1dba6ca22693211756ae430dfdc1
72c9b992c04c015ba0cd7aa3a3d88109e99b2ba9
f4a26a73729053b7522ded45423e152a81b800f7
3a5c1f9c8f6dbc4f6af460fffa83e28f8889b9a4
10c6a8a997fba385bb8012414d0403b0da9366a0
8beaa627b3cabdfafbc3141a7f2d80332d6f1165
9546fb15a93259b750c7e6b030b6cd4ca6e3ae4c
84fd970401b59f8ac223a7f521875d68a75f8dd2
8eb2ce7c858de7703c520acc5da4038802fc89f7
eab494461c95b73d49f5dce44ac09b36f6c0d9cf
7bfcfe5c18e702c4af7753407e8daef0f42a30c1
f0478900ed99ff302991ce8de841e4f79898dd33
```

Remediation guidance (safe, non-destructive):

- **Rotate the exposed Firebase keys immediately** in the Firebase Console. This is the highest priority.
- After rotation, you can decide whether to rewrite git history to permanently remove the keys.
  - To safely remove secrets from history, prefer `git filter-repo` (faster and recommended) or BFG. This is destructive and requires force-push and coordination with collaborators.
  - Example `git filter-repo` command (run locally, follow docs):

```bash
# Install git-filter-repo according to your platform
git clone --mirror <repo-url>
cd repo.git
git filter-repo --invert-paths --paths .env
git push --force
```

- If you do not want to rewrite history, at minimum rotate keys and keep `.env` untracked (we already removed it and added `.env.example`).

What I changed in the repository to reduce risk:

- Removed `.env` from tracking and added `.env.example`.
- Added runtime warnings in `src/firebase.js` when env vars are missing.

Human actions required:

- Rotate Firebase keys in Firebase Console.
- If desired, run `git filter-repo` or BFG and force-push to erase the leaked values from git history.
