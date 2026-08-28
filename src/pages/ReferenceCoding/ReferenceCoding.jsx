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
      const comma = dataUrl.indexOf(',');
      resolve({ mimeType: 'image/jpeg', data: dataUrl.slice(comma + 1), name: file.name });
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
        if (file.type.startsWith('image/')) {
          if (nextImages.length >= MAX_IMAGES) throw new Error(`You can add up to ${MAX_IMAGES} screenshots.`);
          nextImages.push(await prepareImage(file));
        } else {
          nextReferences.push(await readReferenceFile(file));
        }
      }
      setImages(nextImages); setReferenceFiles(nextReferences);
      const executableCount = nextReferences.filter((item) => item.kind === 'executable').length;
      setMessage(executableCount ? `Application file detected. It will be analyzed safely without being executed.` : `${files.length} reference${files.length === 1 ? '' : 's'} added.`);
    } catch (err) {
      setError(err.message || 'Unable to use that reference.');
    } finally { setIsPreparing(false); }
  };

  const removeImage = (index) => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const removeFile = (index) => setReferenceFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const generate = async () => {
    if (!idea.trim() && !images.length && !referenceFiles.length) return setError('Tell us what you want to build or improve, then add a reference if you have one.');
    setError(''); setMessage(''); setIsGenerating(true); setResult(null);
    try {
      let authenticatedUser = user;
      if (!authenticatedUser) authenticatedUser = await loginWithGoogle();
      if (!authenticatedUser) return;
      const token = await authenticatedUser.getIdToken();
      const response = await generateReferenceCoding({ idea: idea.trim(), idToken: token, requestId: createRequestId(), images, referenceFiles });
      setResult(response);
      setMessage('✓ Coding prompt ready.');
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      setError(err.message || 'Unable to generate the coding prompt.');
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Navbar />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:px-6 sm:pt-24">
          <div className="max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-indigo-600">PromptStudio.ai · Reference Coding</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Show AI what you already have.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">Upload screenshots, an existing project reference, or supporting files. Tell us what you want to build, recreate, improve or change — PromptStudio turns the reference and your intention into a coding-ready AI prompt.</p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_-45px_rgba(37,99,235,0.4)] sm:p-8">
              <label htmlFor="coding-idea" className="text-sm font-bold text-slate-900">What do you want to do?</label>
              <textarea id="coding-idea" value={idea} onChange={(event) => setIdea(event.target.value)} rows={6} disabled={isGenerating || isPreparing} placeholder="Example: This is our existing dashboard. Modernize the UX, keep the current business logic, improve mobile responsiveness, and make the interface easier for new users." className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none transition focus:border-indigo-400 focus:bg-white" />

              <div className="mt-5 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-bold text-slate-900">Reference files</p><p className="mt-1 text-xs leading-5 text-slate-600">Screenshots, project text, documentation, or an existing application file. We inspect file type and size before analysis.</p></div>
                  <input ref={inputRef} type="file" multiple accept="image/*,.txt,.md,.json,.html,.css,.js,.jsx,.ts,.tsx,.pdf,.exe,.msi" onChange={handleFiles} className="hidden" />
                  <Button type="button" variant="secondary" disabled={isPreparing || isGenerating} onClick={() => inputRef.current?.click()}>{isPreparing ? 'Checking files…' : 'Add references'}</Button>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">Screenshots: max 3 MB each · Other files: max 5 MB · Executables are detected by their real file signature and are never executed.</p>

                {(images.length > 0 || referenceFiles.length > 0) && <div className="mt-4 space-y-2">
                  {images.map((image, index) => <div key={`${image.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><img src={`data:${image.mimeType};base64,${image.data}`} alt="Reference" className="h-12 w-12 rounded-lg object-cover" /><p className="min-w-0 flex-1 truncate text-sm font-medium">{image.name}</p><button type="button" onClick={() => removeImage(index)} className="text-xs font-bold text-slate-500 hover:text-red-600">Remove</button></div>)}
                  {referenceFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black">{file.kind === 'executable' ? 'APP' : file.kind === 'text' ? 'TXT' : 'DOC'}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-slate-500">{file.kind === 'executable' ? 'Executable detected · safe static reference only' : `${(file.size / 1024).toFixed(0)} KB`}</p></div><button type="button" onClick={() => removeFile(index)} className="text-xs font-bold text-slate-500 hover:text-red-600">Remove</button></div>)}
                </div>}
              </div>

              {(message || error) && <div className={`mt-4 rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`} role="status">{error || message}</div>}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="primary" size="lg" type="button" onClick={generate} disabled={isPreparing || isGenerating}>{isGenerating ? (user ? 'Analyzing & building…' : 'Signing in & building…') : 'Generate Coding Prompt'}</Button><p className="text-xs text-slate-500">Reference + intention → implementation prompt</p></div>
            </section>

            <aside className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 sm:p-8">
              <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">How it works</p>
              <div className="mt-5 space-y-5">{[['01', 'Show us what exists', 'Add screenshots, text, documentation or an application reference.'], ['02', 'Tell us what you need', 'Explain the change in plain language — recreate, improve, modernize, add or fix.'], ['03', 'Get the AI-ready prompt', 'PromptStudio combines the reference with your intention and gives you a structured coding prompt.']].map(([number, title, body]) => <div key={number} className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-indigo-700 shadow-sm">{number}</span><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div></div>)}</div>
              <div className="mt-8 rounded-2xl border border-indigo-100 bg-white p-4"><p className="text-sm font-bold">🛡️ Safe reference handling</p><p className="mt-2 text-xs leading-5 text-slate-600">Renamed executables are detected from their underlying file signature. PromptStudio does not execute uploaded applications. For best results, add screenshots and a clear description of what you want changed.</p></div>
            </aside>
          </div>

          {result && <div className="mt-8"><ResultCard prompt={result.prompt} perspectives={result.perspectives} intelligence={result.intelligence} category="coding" userPlan="free" /></div>}
        </section>
      </main>
      <Footer />
    </div>
  );
}
