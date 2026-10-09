import { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { useAuth } from '../../context/AuthContext';
import { createQuotaState } from '../../constants/quota';
import { fetchRuntimeProductConfig } from '../../services/runtimeProductConfig';
import { generateReferenceCoding, createRequestId } from '../../services/referenceCoding';
import ResultCard from '../Result/ResultCard';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_REFERENCES = 8;
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'application/json', 'text/html', 'text/css', 'text/javascript', 'application/javascript']);

const OUTPUT_FORMATS = [
  { id: 'notsure', label: 'Not sure — let AI decide' },
  { id: 'react', label: 'React (JSX)' },
  { id: 'html', label: 'HTML + CSS' },
  { id: 'vue', label: 'Vue' },
  { id: 'fullstack', label: 'Full-stack (frontend + backend)' },
];

const TARGET_AIS = [
  { id: 'any', label: 'Any AI', color: 'bg-zinc-700', url: null },
  { id: 'cursor', label: 'Cursor', color: 'bg-indigo-600', url: 'https://cursor.com' },
  { id: 'claude-code', label: 'Claude Code', color: 'bg-orange-600', url: 'https://claude.ai' },
  { id: 'chatgpt', label: 'ChatGPT', color: 'bg-emerald-600', url: 'https://chat.openai.com' },
  { id: 'gemini', label: 'Gemini', color: 'bg-blue-600', url: 'https://gemini.google.com' },
  { id: 'copilot', label: 'GitHub Copilot', color: 'bg-slate-700', url: 'https://github.com/features/copilot' },
  { id: 'lovable', label: 'Lovable', color: 'bg-pink-600', url: 'https://lovable.dev' },
  { id: 'replit', label: 'Replit', color: 'bg-orange-700', url: 'https://replit.com' },
  { id: 'v0', label: 'v0', color: 'bg-zinc-800', url: 'https://v0.dev' },
  { id: 'windsurf', label: 'Windsurf', color: 'bg-cyan-600', url: 'https://windsurf.com' },
  { id: 'bolt', label: 'Bolt.new', color: 'bg-amber-600', url: 'https://bolt.new' },
  { id: 'cline', label: 'Cline', color: 'bg-teal-700', url: 'https://cline.bot' },
];

const GENERATION_STATUS_LINES = [
  'Reading your reference...',
  'Validating output format...',
  'Assembling your prompt...',
];

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

const quickPills = [
  { label: 'Recreate a UI', template: 'Recreate this layout with pixel-exact styling, retaining CSS tokens and grid behavior: ' },
  { label: 'Improve UX', template: 'Keep the existing product purpose but simplify navigation and user flows: ' },
  { label: 'Add a Feature', template: 'Use the existing UI as context and define the safest implementation path: ' },
];

export default function ReferenceCoding() {
  const inputRef = useRef(null);
  const { user, userProfile, plan, promptsToday, lastPromptDate, loginWithGoogle, updateQuotaState } = useAuth();
  const [productConfig, setProductConfig] = useState(null);
  const [idea, setIdea] = useState('');
  const [images, setImages] = useState([]);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatusIndex, setGenerationStatusIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [outputFormat, setOutputFormat] = useState('notsure');
  const [targetAI, setTargetAI] = useState('any');

  useEffect(() => {
    let active = true;
    fetchRuntimeProductConfig(user).then((config) => { if (active) setProductConfig(config); }).catch((err) => console.error('Unable to load runtime product config', err));
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!isGenerating) {
      setGenerationStatusIndex(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setGenerationStatusIndex((index) => (index + 1) % GENERATION_STATUS_LINES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const quota = createQuotaState(
    {
      plan,
      promptsToday,
      lastPromptDate,
      imageAnalysesToday: userProfile?.imageAnalysesToday,
      lastImageAnalysisDate: userProfile?.lastImageAnalysisDate,
      imageAnalysesThisMonth: userProfile?.imageAnalysesThisMonth,
      lastImageAnalysisMonth: userProfile?.lastImageAnalysisMonth,
    },
    new Date(),
    productConfig
  );
  const credits = Math.max(Number(userProfile?.credits || 0), 0);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
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

  const removeImage = (index) => setImages((current) => current.filter((_, i) => i !== index));
  const removeFile = (index) => setReferenceFiles((current) => current.filter((_, i) => i !== index));

  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const generate = async () => {
    if (!idea.trim() && !images.length && !referenceFiles.length) return setError('Tell us what you want to build or improve, then add a reference if you have one.');
    setError(''); setMessage(''); setIsGenerating(true); setResult(null);
    try {
      let authenticatedUser = user;
      if (!authenticatedUser) authenticatedUser = await loginWithGoogle();
      if (!authenticatedUser) return;
      const token = await authenticatedUser.getIdToken();
      const referenceImage = await buildReferenceBoard(images);
      const response = await generateReferenceCoding({
        idea: idea.trim(),
        idToken: token,
        requestId: createRequestId(),
        images: referenceImage ? [referenceImage] : [],
        referenceFiles,
        outputFormat,
        targetAI,
      });
      setResult(response);
      if (response.quota) updateQuotaState(response.quota, response.creditsRemaining);
      setMessage(response.formatWarning || '✓ Coding intelligence ready.');
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      setError(err.message || 'Unable to generate the coding prompt.');
      if (err.quota) updateQuotaState(err.quota, err.creditsRemaining);
    } finally { setIsGenerating(false); }
  };

  const totalReferences = images.length + referenceFiles.length;

  return (
    <div className="min-h-screen bg-[#070A11] text-zinc-100 antialiased overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-teal-500/15 via-indigo-600/15 to-transparent blur-[140px] pointer-events-none" />

      <Navbar />

      {user && (
        <div className="mx-auto flex max-w-6xl justify-end px-5 pt-3 sm:px-6">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/90 border border-teal-500/30 text-xs font-mono font-medium text-teal-300">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            {quota?.remaining ?? 0} prompts left · {credits} credits
          </div>
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-20">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-950/60 border border-teal-500/30 text-teal-300 text-[11px] font-mono font-semibold uppercase tracking-widest mb-4">
            Reference Intelligence Engine
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
            Show AI what already exists. <br />
            <span className="bg-gradient-to-r from-teal-300 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
              Then tell it what to change.
            </span>
          </h1>
          <p className="mt-4 text-zinc-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Upload screenshots or reference files of your existing product, describe what you want changed, and get a coding-ready implementation prompt.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-[#0E1322]/90 border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white mb-2">What do you want to build?</h2>
              <textarea
                rows={4}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                disabled={isGenerating || isPreparing}
                placeholder="Example: This is our existing dashboard. Improve the UX, keep the business logic intact, make mobile navigation easier, and add a search tab without changing the current visual identity."
                className="w-full text-xs sm:text-sm bg-zinc-950/70 border border-white/10 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 text-zinc-100 placeholder:text-zinc-500 transition resize-none"
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {quickPills.map((pill) => (
                  <button key={pill.label} type="button" onClick={() => setIdea(pill.template)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 transition">
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm sm:text-base font-bold text-white">Reference workspace</h2>
                <span className="text-[11px] text-zinc-500 font-mono">{totalReferences}/{MAX_REFERENCES} references</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  {images.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <span className="truncate text-zinc-200">🖼️ {image.name}</span>
                      <button type="button" onClick={() => removeImage(index)} className="text-zinc-500 hover:text-red-400">×</button>
                    </div>
                  ))}
                  {referenceFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/10 text-xs">
                      <span className="truncate text-zinc-200">{file.kind === 'executable' ? '🛡️' : '📄'} {file.name}</span>
                      <button type="button" onClick={() => removeFile(index)} className="text-zinc-500 hover:text-red-400">×</button>
                    </div>
                  ))}
                  {totalReferences === 0 && (
                    <div className="h-[95px] flex items-center justify-center border border-dashed border-white/10 rounded-xl text-zinc-500 text-xs">
                      No files staged
                    </div>
                  )}
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition ${isDragging ? 'border-teal-400 bg-teal-950/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  <input ref={inputRef} type="file" multiple accept="image/*,.txt,.md,.json,.html,.css,.js,.jsx,.ts,.tsx,.pdf,.doc,.docx,.exe,.msi,.app,.bin" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} className="hidden" />
                  <span className="text-xs font-bold text-zinc-200">{isPreparing ? 'Inspecting…' : 'Drop screenshots or code'}</span>
                  <span className="text-xs text-zinc-400 mt-0.5">Images ≤ 3MB · Files ≤ 5MB</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div>
              <label htmlFor="output-format" className="text-sm sm:text-base font-bold text-white mb-2 block">
                What should the final code look like?
              </label>
              <select
                id="output-format"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="w-full text-xs sm:text-sm bg-zinc-950/70 border border-white/10 rounded-xl p-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              >
                {OUTPUT_FORMATS.map((fmt) => (
                  <option key={fmt.id} value={fmt.id}>{fmt.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-zinc-500">Not sure what to pick? Leave it on "let AI decide" — we'll tell it to choose the best format and explain why.</p>
            </div>

            <div>
              <span className="text-sm sm:text-base font-bold text-white mb-2 block">Which AI will you paste this into?</span>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {TARGET_AIS.map((ai) => (
                  <button
                    key={ai.id}
                    type="button"
                    onClick={() => setTargetAI(ai.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-bold text-white transition ${ai.color} ${targetAI === ai.id ? 'ring-2 ring-teal-300 scale-[1.03]' : 'opacity-70 hover:opacity-100'}`}
                  >
                    {ai.label}
                  </button>
                ))}
              </div>
            </div>

            {(message || error) && (
              <div className={`rounded-xl border p-3 text-sm ${error ? 'border-red-500/30 bg-red-950/30 text-red-300' : 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'}`} role="status">
                {error || message}
                {error?.includes('Reference Coding requires') && (
                  <a href="/account#plans" className="ml-3 inline-flex items-center rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-400">Get credits →</a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={isPreparing || isGenerating}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-teal-500 via-teal-600 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-teal-500/20 transition disabled:opacity-70"
            >
              {isGenerating ? (user ? GENERATION_STATUS_LINES[generationStatusIndex] : 'Signing in…') : 'Generate Coding Prompt →'}
            </button>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-[#0B0F19] rounded-2xl p-5 border border-white/10 shadow-2xl">
              <h3 className="text-sm font-bold text-white mb-3">What PromptStudio gives your coding AI</h3>
              <div className="space-y-3.5 text-xs">
                {[
                  ['Visual facts', 'Layout, hierarchy, spacing, typography, states and interaction clues.'],
                  ['Intent', 'What you actually want changed — without inventing hidden requirements.'],
                  ['Implementation', 'Components, responsive behavior, constraints and acceptance criteria.'],
                ].map(([title, body]) => (
                  <div key={title} className="p-2.5 bg-white/[0.03] rounded-xl border border-white/5">
                    <span className="font-semibold text-zinc-100 block">{title}</span>
                    <span className="text-zinc-400 text-[11px] leading-relaxed">{body}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-8">
            <ResultCard prompt={result.prompt} perspectives={result.perspectives} intelligence={result.intelligence} category="coding" userPlan="free" targetAI={targetAI} />

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-teal-500/20 bg-teal-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-white">Need more credits?</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">Reference Coding uses <span className="font-bold text-teal-300">5 credits</span> per generation. Your current balance is <span className="font-bold text-teal-300">{credits} credits</span>.</p>
              </div>
              <a href="/account#plans" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-teal-500">Get credits →</a>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
