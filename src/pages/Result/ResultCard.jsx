import { useEffect, useMemo, useState } from 'react';
import TextArea from '../../components/ui/TextArea';
import Button from '../../components/ui/Button';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { evaluateFeatureAccess } from '../../config/features';
import { AI_LAUNCH_TARGETS, launchPromptInAI } from '../../services/aiLaunchService';
import { createShareablePrompt } from '../../services/sharePromptService';
import { useAuth } from '../../context/AuthContext';

function ResultCard({ prompt, perspectives = [], intelligence = null, userPlan = 'free' }) {
  const { user } = useAuth();
  const [copyStatus, setCopyStatus] = useState('');
  const [launchStatus, setLaunchStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [selectedId, setSelectedId] = useState('main');

  const perspectiveAccess = evaluateFeatureAccess('multiPerspectiveGeneration', userPlan);
  const intentAccess = evaluateFeatureAccess('intentIntelligence', userPlan);
  const launchAccess = evaluateFeatureAccess('oneClickLaunchButtons', userPlan);
  const shareAccess = evaluateFeatureAccess('shareablePromptLinks', userPlan);

  useEffect(() => {
    setSelectedId('main');
    setLaunchStatus('');
    setShareStatus('');
  }, [prompt, perspectives]);

  const selectedPrompt = useMemo(() => {
    if (selectedId === 'main') return prompt;
    return perspectives.find((item) => item.id === selectedId)?.prompt || prompt;
  }, [prompt, perspectives, selectedId]);

  const handleCopy = async () => {
    const success = await copyToClipboard(selectedPrompt);
    if (success) {
      setCopyStatus('Copied to clipboard');
      setTimeout(() => setCopyStatus(''), 2000);
    } else {
      setCopyStatus('Copy failed. Select the prompt and copy it manually.');
    }
  };

  const handleLaunch = async (targetId) => {
    if (!launchAccess.allowed) return;
    const target = AI_LAUNCH_TARGETS.find((item) => item.id === targetId);
    const targetLabel = target?.label || 'AI';
    setLaunchStatus(`Opening ${targetLabel}…`);
    const result = await launchPromptInAI(selectedPrompt, targetId);
    if (result.success) {
      setLaunchStatus(`✓ Prompt copied — ${targetLabel} opened. Paste your prompt there.`);
      setTimeout(() => setLaunchStatus(''), 4500);
      return;
    }
    if (result.reason === 'clipboard_failed') {
      setLaunchStatus('Could not copy the prompt. Please use Copy Prompt instead.');
      return;
    }
    if (result.reason === 'popup_blocked') {
      setLaunchStatus(`✓ Prompt copied — ${targetLabel} is ready.`);
      setTimeout(() => setLaunchStatus(''), 3500);
      return;
    }
    setLaunchStatus(`Could not prepare the prompt for ${targetLabel}. Please try again.`);
  };

  const handleShare = async () => {
    if (!shareAccess.allowed || !user) return;
    setShareStatus('Creating 10-minute link…');
    try {
      const token = await user.getIdToken();
      const result = await createShareablePrompt(selectedPrompt, token);
      const shareUrl = `${window.location.origin}/p/${result.shareId}`;
      const copied = await copyToClipboard(shareUrl);
      setShareStatus(copied ? '✓ Share link copied — expires in 10 minutes.' : `Share link created — expires in 10 minutes: ${shareUrl}`);
      setTimeout(() => setShareStatus(''), 7000);
    } catch (error) {
      setShareStatus(error.code === 'pro_required' ? 'Share links are available on Pro.' : (error.message || 'Unable to create a share link.'));
    }
  };

  return (
    <div className="relative rounded-3xl border border-blue-100 bg-white p-8 shadow-md sm:p-10">
      {(launchStatus || shareStatus) && (launchAccess.allowed || shareAccess.allowed) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-lg" role="status" aria-live="polite">
          {launchStatus || shareStatus}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">PromptStudio Intelligence</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">Your optimized prompt</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {shareAccess.active && <Button variant="secondary" size="sm" disabled={!shareAccess.allowed} onClick={handleShare}>{shareAccess.allowed ? 'Share Link' : 'Share Link · PRO'}</Button>}
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {copyStatus === 'Copied to clipboard' ? 'Copied!' : 'Copy Prompt'}
          </Button>
        </div>
      </div>

      {intentAccess.allowed && intelligence?.intent && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Understood goal</p><p className="mt-1 text-sm font-medium text-gray-800">{intelligence.intent}</p>{intelligence.missing?.length > 0 && <p className="mt-2 text-xs text-gray-500">Optional details that could improve it: {intelligence.missing.join(' · ')}</p>}</div>
      )}

      {perspectiveAccess.allowed && perspectives.length > 0 && (
        <div className="mt-6"><p className="mb-2 text-sm font-semibold text-gray-800">Choose an approach</p><div className="flex flex-wrap gap-2" role="tablist" aria-label="Prompt perspectives"><button type="button" role="tab" aria-selected={selectedId === 'main'} onClick={() => setSelectedId('main')} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:border-blue-400">Best fit</button>{perspectives.map((item) => <button key={item.id} type="button" role="tab" aria-selected={selectedId === item.id} onClick={() => setSelectedId(item.id)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:border-blue-400">{item.label}</button>)}</div></div>
      )}

      {launchAccess.active && (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">One-click AI launch</p><p className="mt-1 text-xs text-gray-600">{launchAccess.allowed ? 'Your selected prompt is copied automatically, then your AI opens in a new tab.' : 'Pro unlocks direct launch to your favorite AI — no copy-paste setup.'}</p></div>{!launchAccess.allowed && <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700">PRO</span>}</div><div className="mt-3 flex flex-wrap gap-2">{AI_LAUNCH_TARGETS.map((target) => <Button key={target.id} variant={launchAccess.allowed ? 'primary' : 'secondary'} size="sm" disabled={!launchAccess.allowed} onClick={() => handleLaunch(target.id)}>Open in {target.label}</Button>)}</div>{launchStatus && <p className="mt-3 text-xs font-medium text-gray-700" role="status">{launchStatus}</p>}</div>
      )}

      {copyStatus && <p className="mt-3 text-sm text-gray-600" role="status">{copyStatus}</p>}
      <div className="mt-6"><TextArea id="generatedPrompt" value={selectedPrompt} readOnly rows={14} /></div>
      {intentAccess.allowed && intelligence?.recommendations?.length > 0 && <div className="mt-5 rounded-2xl border border-gray-100 p-4"><p className="text-sm font-semibold text-gray-800">PromptStudio suggestions</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{intelligence.recommendations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
    </div>
  );
}

export default ResultCard;
