# DevOps Kit — site generator

One command builds the whole DevOps Kit site from the kit markdown:

```sh
python3 build_site.py
```

## What it generates

`build_site.py` writes into its own folder:

- `index.html` — the landing page (the DevOps Kit homepage)
- `lessons/*.html` — 20 lessons (18 course lessons + 2 free skill labs:
  Linux Command Line, Git Basics)
- `sims/*.html` — 20 practice-terminal simulations (one per lesson)
- `assets/` — `style.css`, `sim.js`, and the copied `assets-src/*` files
- `i18n/` — language files copied from `i18n-src/`
- `404.html`, `sitemap.xml`

## Inputs

- **Kit markdown** — the lesson bodies. Default location is the
  `devops-kit` folder next to this one (`../devops-kit`); override with
  the `DEVOPS_KIT_DIR` environment variable:
  `DEVOPS_KIT_DIR=/path/to/devops-kit python3 build_site.py`
- **Sources in this folder** — `engine/sim.js` (terminal engine),
  `assets-src/*` (site JS/CSS), `i18n-src/*.json`, `static/404.html`.

## The rule

**The generated output must reproduce the live site byte-for-byte.**
The PR #120 improvements (Gen Z look, i18n, Linux + Git labs, the
improved terminal engine, lazy Razorpay, the phone-keyboard fix) live
in this generator now — a rebuild must not wipe them. After any change
to the generator, regenerate and diff against the live site before
merging.

## Tests

```sh
node tests/test_sims.js            # drives every sim through the engine (896 checks)
node tests/test_engine_extensions.js  # engine commands: git, docker, kubectl… (168 checks)
```

Both must pass. Note: the shipped engine sets `window.__didYouMean`
at load (PR #120 typo hints), so the tests define a `window` global
before requiring it under Node. The shipped `assets/sim.js` is
untouched by that shim.

## Prices (do not change without the owner's word)

Phase 1 ₹399 · Phase 2 ₹799 · both ₹999.

## Kit content rule

The kit teaches only technical things. Never mention CTS, cheque,
NPCI, bank, CCH, HYD, CHN, FTS or MPLS in kit content.
