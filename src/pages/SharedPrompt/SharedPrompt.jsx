import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import TextArea from '../../components/ui/TextArea';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { fetchSharedPrompt } from '../../services/sharePromptService';

function SharedPrompt() {
  const { id } = useParams();
  const [prompt, setPrompt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchSharedPrompt(id)
      .then((payload) => {
        if (!active) return;
        setPrompt(payload.prompt || '');
        setExpiresAt(payload.expiresAt || '');
      })
      .catch((err) => active && setError(err.message || 'This share link is invalid or expired.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const copy = async () => {
    if (!prompt) return;
    const success = await copyToClipboard(prompt);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-gray-50 px-6 py-20"><div className="mx-auto max-w-3xl rounded-3xl bg-white p-10 text-center shadow-sm">Opening shared prompt…</div></main>;
  }

  if (error) {
    return <main className="min-h-screen bg-gray-50 px-6 py-20"><div className="mx-auto max-w-3xl rounded-3xl bg-white p-10 text-center shadow-sm"><p className="text-sm font-bold uppercase tracking-wider text-blue-600">PromptStudio</p><h1 className="mt-3 text-2xl font-bold text-gray-900">Share link unavailable</h1><p className="mt-3 text-gray-600">{error}</p><a className="mt-6 inline-block" href="/"><Button variant="primary">Go to PromptStudio</Button></a></div></main>;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-md sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">PromptStudio</p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">Shared prompt</h1>
              <p className="mt-1 text-sm text-gray-500">Read-only temporary share</p>
            </div>
            <Button variant="secondary" size="sm" onClick={copy}>{copied ? 'Copied!' : 'Copy Prompt'}</Button>
          </div>

          <div className="mt-6"><TextArea id="sharedPrompt" value={prompt} readOnly rows={16} /></div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <span>Expires in 10 minutes from creation.</span>
            {expiresAt && <span>Expires: {new Date(expiresAt).toLocaleTimeString()}</span>}
          </div>

          <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-semibold text-gray-900">Want to create your own?</p>
            <p className="mt-1 text-sm text-gray-600">Use PromptStudio Intelligence to turn rough ideas and reference images into stronger prompts.</p>
            <a className="mt-4 inline-block" href="/"><Button variant="primary" size="sm">Try PromptStudio</Button></a>
          </div>
        </div>
      </div>
    </main>
  );
}

export default SharedPrompt;
