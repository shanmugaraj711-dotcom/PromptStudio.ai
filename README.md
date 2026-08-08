# PromptStudio AI

Get Better Results from Any AI.

PromptStudio AI transforms simple ideas into professional, structured prompts optimized
for ChatGPT, Claude, Gemini and Grok.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- React Router DOM
- JavaScript (no TypeScript)
- No backend / database / auth — fully client-side MVP

## Getting Started

```bash
npm install
npm run dev
```

Then open the local URL printed in your terminal (usually http://localhost:5173).

## Environment & Firebase

This project uses Firebase for authentication and Firestore for prompt history. The
repository intentionally does not include secrets. To run locally:

1. Create a Firebase project and enable Email/Password and Google sign-in in the
  Firebase Console.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
3. Do NOT commit the `.env` file. The project already includes `.gitignore` to
  ignore `.env`.

If your Firebase keys were accidentally committed, rotate them in the Firebase
Console immediately and remove the leaked file from the repository history.


## Build

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
  assets/            static assets
  components/
    common/          shared presentational pieces (SectionHeading, Badge)
    layout/           Navbar, Footer
    ui/               low-level reusable UI primitives (Button, Card, Select, TextArea)
  pages/
    Landing/          landing page sections (Hero, HowItWorks, Features, WorksWith, Pricing)
    Builder/          interactive prompt builder + before/after example
    Result/           generated prompt result card
  constants/          static option lists (AI models, categories, pricing plans)
  hooks/               usePromptBuilder hook (state + generation logic)
  services/           promptGenerator.js — core prompt generation logic
  utils/              copyToClipboard helper
  styles/             global Tailwind entry css
```
