import { useRef, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import Button from '../../components/ui/Button';
import ResultCard from '../Result/ResultCard';
import { useAuth } from '../../context/AuthContext';
import { generateReferenceCoding, createRequestId } from '../../services/referenceCoding';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_REFERENCES = 8;
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'application/json', 'text/html', 'text/css', 'text/javascript', 'application/javascript']);

const readHead = (file, length = 8) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('We could not inspect that file.'));
  reader.onload = () => resolve(new Uint8Array(reader.result));
  reader.readAsArrayBuffer(file.slice(0, length));
});

const detectExecutable = async (file) => {
  const bytes = await readHead(file, 8);
  return (bytes[0] === 0x4d && bytes[1] === 0x5a) || (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46);
};

const prepareImage = (file) => new Promise((resolve, reject) => {
  if (!file.type?.startsWith('image/')) return reject(new Error('Please choose an image reference.'));
  if (file.size > MAX_IMAGE_BYTES) return reject(new Error('Each screenshot must be smaller than 3 MB.'));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('We could not read that screenshot.'));
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve({ mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), name: file.name });
    };
    image.onerror = () => reject(new Error('We could not decode that screenshot.'));
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
});

const readReferenceFile = async (file) => {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than the 5 MB reference-file limit.`);
  const executable = await detectExecutable(file);
  if (executable) return { name: file.name, size: file.size, kind: 'executable', detectedType: 'application/executable', note: 'Executable detected from file signature; it will not be executed.' };
  if (TEXT_TYPES.has(file.type) || /\.(txt|md|json|html|css|js|jsx|ts|tsx)$/i.test(file.name)) {
    const text = await file.slice(0, MAX_TEXT_BYTES).text();
    return { name: file.name, size: file.size, kind: 'text', detectedType: file.type || 'text/plain', content: text, truncated: file.size > MAX_TEXT_BYTES };
  }
  return { name: file.name, size: file.size, kind: 'document', detectedType: file.type || 'application/octet-stream', note: 'File metadata supplied as reference; add screenshots or text for deeper analysis.' };
};

const buildReferenceBoard = (images) => {
  if (images.length <= 1) return images[0] || null;
  return new Promise((resolve) => {
    const decoded = [];
    let remaining = images.length;
    images.forEach((item) => {
      const image = new Image();
      image.onload = () => {
        decoded.push(image);
        remaining -= 1;
        if (remaining) return;
        const ordered = images.map((source) => decoded.find((img) => img.__name === source.name) || decoded[0]);
        const cellW = 900; const cellH = 620;
        const board = document.createElement('canvas');
        board.width = cellW * 2; board.height = cellH * Math.ceil(ordered.length / 2);
        const ctx = board.getContext('2d');
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, board.width, board.height);
        ordered.forEach((img, index) => {
          const x = (index % 2) * cellW; const y = Math.floor(index / 2) * cellH;
          const scale = Math.min((cellW - 32) / img.naturalWidth, (cellH - 76) / img.naturalHeight);
          const w = Math.max(1, Math.round(img.naturalWidth * scale)); const h = Math.max(1, Math.round(img.naturalHeight * scale));
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 16, y + 16, cellW - 32, cellH - 32);
          ctx.drawImage(img, x + (cellW - w) / 2, y + 52 + (cellH - 76 - h) / 2, w, h);
          ctx.fillStyle = '#0f172a'; ctx.font = '700 18px system-ui, sans-serif'; ctx.fillText(`Reference ${index + 1}`, x + 24, y + 38);
        });
        const dataUrl = board.toDataURL('image/jpeg', 0.78);
        resolve({ mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), name: `promptstudio-reference-board-${images.length}.jpg` });
      };
      image.onerror = () => { remaining -= 1; if (!remaining) resolve(images[0]); };
      image.__name = item.name;
      image.src = `data:${item.mimeType};base64,${item.data}`;
    });
  });
};

const examples = [
  ['Recreate a UI', 'Match the reference layout and visual language, then make it responsive.'],
  ['Improve UX', 'Keep the existing product purpose but simplify navigation and user flows.'],
  ['Add a feature', 'Use the existing UI as context and define the safest implementation path.'],
];

export default function ReferenceCoding() {
  const inputRef = useRef(null);
  const { user, loginWithGoogle } = useAuth();
  const [idea, setIdea] = useState('');
  const [images, setImages] = useState([]);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setError(''); setMessage(''); setIsPreparing(true);
    try {
      const nextImages = [...images];
      const nextReferences = [...referenceFiles];
      for (const file of files) {
        if (nextImages.length + nextReferences.length >= MAX_REFERENCES) throw new Error(`You can add up to ${MAX_REFERENCES} references at a time.`);
        if (file.type.startsWith('image/')) {
          if (nextImages.length >= MAX_IMAGES) throw new Error(`You can add up to ${MAX_IMAGES} screenshots.`);
          nextImages.push(await prepareImage(file));
        } else {
          nextReferences.push(await readReferenceFile(file));
        }
      }
      setImages(nextImages); setReferenceFiles(nextReferences);
      const executableCount = nextReferences.filter((item) => item.kind === 'executable').length;
      setMessage(executableCount ? 'Application file detected safely. It will be inspected as a static reference and never executed.' : `${files.length} reference${files.length === 1 ? '' : 's'} added.`);
    } catch (err) {
      setError(err.message || 'Unable to use that reference.');
    } finally { setIsPreparing(false); }
  };

  const removeImage = (index) => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const removeFile = (index) => setReferenceFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const useExample = (text) => setIdea(text);

  const generate = async () => {
    if (!idea.trim() && !images.length && !referenceFiles.length) return setError('Tell us what you want to build or improve, then add a reference if you have one.');
    setError(''); setMessage(''); setIsGenerating(true); setResult(null);
    try {
      let authenticatedUser = user;
      if (!authenticatedUser) authenticatedUser = await loginWithGoogle();
      if (!authenticatedUser) return;
      const token = await authenticatedUser.getIdToken();
      const referenceImage = await buildReferenceBoard(images);
      const response = await generateReferenceCoding({ idea: idea.trim(), idToken: token, requestId: createRequestId(), images: referenceImage ? [referenceImage] : [], referenceFiles });
      setResult(response);
      setMessage('✓ Coding intelligence ready.');
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      setError(err.message || 'Unable to generate the coding prompt.');
    } finally { setIsGenerating(false); }
  };

  const totalReferences = images.length + referenceFiles.length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-950">
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white">
          <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-100/70 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-10 h-80 w-80 rounded-full bg-violet-100/70 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-20">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Reference intelligence · Coding</div>
              <h1 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-6xl">Show AI what already exists.<br /><span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Then tell it what to change.</span></h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-xl sm:leading-8">Give PromptStudio screenshots, project text, documentation, or an existing application reference. We separate what is visible from what is assumed and turn your intention into a coding-ready prompt.</p>
              <div className="mt-7 flex flex-wrap gap-2 text-xs font-bold text-slate-500"><span className="rounded-full border border-slate-200 bg-white px-3 py-2">🖼️ Up to 4 screenshots</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">📄 Text & docs</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">🛡️ EXE/MZ/ELF detection</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">⚡ Coding-ready output</span></div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_30px_90px_-55px_rgba(15,23,42,0.35)] sm:p-7">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">01 · Your change</p><h2 className="mt-2 text-2xl font-black tracking-tight">What do you want to build?</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">{totalReferences}/8 references</span></div>
              <textarea id="coding-idea" value={idea} onChange={(event) => setIdea(event.target.value)} rows={6} disabled={isGenerating || isPreparing} placeholder="Example: This is our existing dashboard. Improve the UX, keep the business logic intact, make mobile navigation easier, and add a search tab without changing the current visual identity." className="mt-4 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50" />
              <div className="mt-3 flex flex-wrap gap-2">{examples.map(([title, text]) => <button key={title} type="button" onClick={() => useExample(text)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">{title} ↗</button>)}</div>

              <div className="mt-7 rounded-[1.5rem] border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-violet-50/50 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">02 · Show what exists</p><h3 className="mt-1 text-lg font-black">Reference workspace</h3><p className="mt-1 text-xs leading-5 text-slate-600">Add multiple screenshots, source snippets, docs, or an application file. Everything is inspected before analysis.</p></div><input ref={inputRef} type="file" multiple accept="image/*,.txt,.md,.json,.html,.css,.js,.jsx,.ts,.tsx,.pdf,.doc,.docx,.exe,.msi,.app,.bin" onChange={handleFiles} className="hidden" /><Button type="button" variant="secondary" disabled={isPreparing || isGenerating} onClick={() => inputRef.current?.click()}>{isPreparing ? 'Inspecting…' : '＋ Add references'}</Button></div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Images ≤ 3 MB each</span><span>Files ≤ 5 MB</span><span>4 screenshots max</span><span>8 total references</span></div>

                {images.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image, index) => <div key={`${image.name}-${index}`} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><img src={`data:${image.mimeType};base64,${image.data}`} alt={`Reference ${index + 1}`} className="aspect-[4/3] w-full object-cover" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-7"><p className="truncate text-[10px] font-bold text-white">Reference {index + 1}</p></div><button type="button" onClick={() => removeImage(index)} className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm hover:text-red-600">×</button></div>)}</div>}

                {referenceFiles.length > 0 && <div className="mt-4 space-y-2">{referenceFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${file.kind === 'executable' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{file.kind === 'executable' ? 'APP' : file.kind === 'text' ? 'TXT' : 'DOC'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{file.name}</p><p className="text-[11px] text-slate-500">{file.kind === 'executable' ? 'Executable signature detected · static reference only' : `${(file.size / 1024).toFixed(0)} KB${file.truncated ? ' · text truncated safely' : ''}`}</p></div><button type="button" onClick={() => removeFile(index)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-600">Remove</button></div>)}</div>}

                {!totalReferences && <div className="mt-5 rounded-2xl border border-white/80 bg-white/70 p-5 text-center"><div className="text-3xl">🖼️ ＋ 📄 ＋ 💻</div><p className="mt-2 text-sm font-bold text-slate-700">Drop the evidence. Describe the change. Let AI connect the two.</p><p className="mt-1 text-xs text-slate-500">Best results: 1–4 screenshots + a clear intention.</p></div>}
              </div>

              {(message || error) && <div className={`mt-4 rounded-2xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} role="status">{error || message}</div>}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="primary" size="lg" type="button" onClick={generate} disabled={isPreparing || isGenerating}>{isGenerating ? (user ? 'Analyzing references…' : 'Signing in…') : 'Generate Coding Prompt →'}</Button><p className="text-xs text-slate-500">Reference + intention → implementation prompt</p></div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-300">03 · Intelligence</p><h2 className="mt-3 text-2xl font-black">What PromptStudio gives your coding AI</h2><div className="mt-6 space-y-4">{[['👁️', 'Visual facts', 'Layout, hierarchy, spacing, typography, states and interaction clues.'], ['🧠', 'Intent', 'What you actually want changed — without inventing hidden requirements.'], ['🧩', 'Implementation', 'Components, responsive behavior, constraints and acceptance criteria.']].map(([icon, title, body]) => <div key={title} className="flex gap-3"><span className="text-lg">{icon}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{body}</p></div></div>)}</div></div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Works for</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600"><span className="rounded-xl bg-slate-50 p-3">Cursor</span><span className="rounded-xl bg-slate-50 p-3">Claude Code</span><span className="rounded-xl bg-slate-50 p-3">Lovable</span><span className="rounded-xl bg-slate-50 p-3">Replit</span><span className="rounded-xl bg-slate-50 p-3">ChatGPT</span><span className="rounded-xl bg-slate-50 p-3">Gemini</span></div></div>
              <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6"><p className="text-sm font-black text-amber-900">🛡️ Existing application files</p><p className="mt-2 text-xs leading-5 text-amber-800">Renamed EXE files are detected from their binary signature, even when the extension says TXT. PromptStudio never executes uploaded applications. For best results, include screenshots and a description.</p></div>
            </aside>
          </div>

          <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Working examples</p><h2 className="mt-2 text-2xl font-black tracking-tight">From reference to implementation thinking.</h2></div><p className="max-w-xl text-sm leading-6 text-slate-500">Start with the kind of outcome you need. Your actual screenshots and requirements remain the source of truth.</p></div><div className="mt-6 grid gap-4 md:grid-cols-3">{examples.map(([title, text], index) => <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between"><span className="text-xs font-black text-indigo-600">0{index + 1}</span><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-400">REFERENCE</span></div><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p><button type="button" onClick={() => useExample(text)} className="mt-4 text-xs font-black text-indigo-700">Use this intention →</button></article>)}</div></section>

          {result && <div className="mt-8"><ResultCard prompt={result.prompt} perspectives={result.perspectives} intelligence={result.intelligence} category="coding" userPlan="free" /></div>}
        </section>
      </main>
      <Footer />
    </div>
  );
}
