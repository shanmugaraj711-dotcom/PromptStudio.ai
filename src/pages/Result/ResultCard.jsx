import { useEffect, useMemo, useRef, useState } from 'react';
import TextArea from '../../components/ui/TextArea';
import Button from '../../components/ui/Button';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { evaluateFeatureAccess } from '../../config/features';
import { AI_LAUNCH_TARGETS, launchPromptInAI } from '../../services/aiLaunchService';
import { createShareablePrompt } from '../../services/sharePromptService';
import { usePromptTemplates, extractPromptVariables } from '../../hooks/usePromptTemplates';
import { useAuth } from '../../context/AuthContext';
import WorkflowProgress from './WorkflowProgress';

function ResultCard({ prompt, perspectives = [], intelligence = null, userPlan = 'free', workflow = null, category = 'writing' }) {
  const { user } = useAuth();
  const { createTemplate } = usePromptTemplates();
  const generatedPromptRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [launchStatus, setLaunchStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [templateStatus, setTemplateStatus] = useState('');
  const [selectedId, setSelectedId] = useState('main');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('Reusable Prompt');
  const [templateDraft, setTemplateDraft] = useState('');

  const perspectiveAccess = evaluateFeatureAccess('multiPerspectiveGeneration', userPlan);
  const intentAccess = evaluateFeatureAccess('intentIntelligence', userPlan);
  const launchAccess = evaluateFeatureAccess('oneClickLaunchButtons', userPlan);
  const shareAccess = evaluateFeatureAccess('shareablePromptLinks', userPlan);
  const templateAccess = evaluateFeatureAccess('dynamicVariableFillers', userPlan);
  const workflowAccess = evaluateFeatureAccess('promptWorkflows', userPlan);
  const isImage = category === 'image';

  useEffect(() => {
    setSelectedId('main');
    setLaunchStatus('');
    setShareStatus('');
    setTemplateStatus('');
    setShowTemplateForm(false);
  }, [prompt, perspectives]);

  useEffect(() => {
    if (selectedId === 'main') return undefined;
    const timer = window.setTimeout(() => {
      generatedPromptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

  const selectedPrompt = useMemo(() => {
    if (selectedId === 'main') return prompt;
    return perspectives.find((item) => item.id === selectedId)?.prompt || prompt;
  }, [prompt, perspectives, selectedId]);

  const detectedVariables = useMemo(() => extractPromptVariables(templateDraft), [templateDraft]);

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

  const openTemplateForm = () => {
    if (!templateAccess.allowed) return;
    setTemplateDraft(selectedPrompt || '');
    setTemplateName('Reusable Prompt');
    setTemplateStatus('');
    setShowTemplateForm(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateDraft.trim() || !templateName.trim()) {
      setTemplateStatus('Add a template name and prompt first.');
      return;
    }
    try {
      await createTemplate({
        name: templateName,
        template: templateDraft,
        variables: extractPromptVariables(templateDraft),
      });
      setTemplateStatus('✓ Reusable prompt saved to your library.');
      setTimeout(() => {
        setTemplateStatus('');
        setShowTemplateForm(false);
      }, 1800);
    } catch (error) {
      setTemplateStatus(error.message || 'Unable to save reusable prompt.');
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border p-5 shadow-[0_28px_80px_-40px_rgba(37,99,235,0.4)] sm:rounded-[2rem] sm:p-8 lg:p-10 ${isImage ? 'border-violet-200 bg-gradient-to-b from-white via-violet-50/30 to-sky-50/50' : 'border-blue-100 bg-white'}`}>
      {(launchStatus || shareStatus || templateStatus) && (launchAccess.allowed || shareAccess.allowed || templateAccess.allowed) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-lg" role="status" aria-live="polite">
          {launchStatus || shareStatus || templateStatus}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider ${isImage ? 'text-violet-600' : 'text-blue-600'}`}>{isImage ? 'PromptStudio Visual Intelligence' : 'PromptStudio Intelligence'}</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">{isImage ? 'Your image prompt is ready' : 'Your optimized prompt'}</h3>
          {isImage && <p className="mt-1 text-sm text-gray-500">A polished visual recipe for composition, lighting, detail and finish.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {templateAccess.active && <Button variant="secondary" size="sm" disabled={!templateAccess.allowed} onClick={openTemplateForm}>{templateAccess.allowed ? 'Save as Template' : 'Save Template · PRO'}</Button>}
          {shareAccess.active && <Button variant="secondary" size="sm" disabled={!shareAccess.allowed} onClick={handleShare}>{shareAccess.allowed ? 'Share Link' : 'Share Link · PRO'}</Button>}
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            {copyStatus === 'Copied to clipboard' ? 'Copied!' : 'Copy Prompt'}
          </Button>
        </div>
      </div>

      {isImage && (
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
          {[
            ['✦', 'Composition', 'Framing & focal point'],
            ['◐', 'Lighting', 'Mood & depth'],
            ['◇', 'Detail', 'Texture & realism'],
            ['✧', 'Finish', 'Color & camera feel'],
          ].map(([icon, title, detail]) => (
            <div key={title} className="min-w-[170px] snap-start rounded-2xl border border-white bg-white/80 p-4 shadow-sm ring-1 ring-violet-100/70 sm:min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">{icon}</div>
              <p className="mt-3 text-sm font-bold text-gray-900">{title}</p>
              <p className="mt-1 text-xs text-gray-500">{detail}</p>
            </div>
          ))}
        </div>
      )}

      {workflow && workflowAccess.allowed && <WorkflowProgress workflow={workflow} perspectives={perspectives} selectedId={selectedId} />}

      {templateAccess.allowed && showTemplateForm && (
        <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 sm:w-64" />
            <p className="self-center text-xs text-gray-600">Use <code className="rounded bg-white px-1.5 py-0.5 font-semibold">{'{{variable}}'}</code> anywhere you want a reusable field.</p>
          </div>
          <textarea value={templateDraft} onChange={(e) => setTemplateDraft(e.target.value)} rows={7} className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-4 text-sm leading-6 outline-none focus:border-indigo-400" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-600">{detectedVariables.length ? `Detected variables: ${detectedVariables.map((item) => `{{${item}}}`).join(' · ')}` : 'No variables detected yet — you can still save this as a reusable prompt.'}</div>
            <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setShowTemplateForm(false)}>Cancel</Button><Button variant="primary" size="sm" onClick={handleSaveTemplate}>Save Template</Button></div>
          </div>
        </div>
      )}

      {intentAccess.allowed && intelligence?.intent && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Understood goal</p><p className="mt-1 text-sm font-medium text-gray-800">{intelligence.intent}</p>{intelligence.missing?.length > 0 && <p className="mt-2 text-xs text-gray-500">Optional details that could improve it: {intelligence.missing.join(' · ')}</p>}</div>
      )}

      {perspectiveAccess.allowed && perspectives.length > 0 && (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-bold text-gray-900">4. Choose an approach</p><p className="mt-1 text-xs text-gray-500">Switch the recipe — the generated prompt below updates instantly.</p></div>
            <span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700 sm:inline">{selectedId === 'main' ? 'BEST FIT' : 'ALTERNATIVE'}</span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory" role="tablist" aria-label="Prompt perspectives">
            <button type="button" role="tab" aria-selected={selectedId === 'main'} onClick={() => setSelectedId('main')} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedId === 'main' ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400'}`}>Best fit</button>
            {perspectives.map((item) => <button key={item.id} type="button" role="tab" aria-selected={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedId === item.id ? 'border-blue-400 bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400'}`}>{item.label}</button>)}
          </div>
        </div>
      )}

      {copyStatus && <p className="mt-3 text-sm text-gray-600" role="status">{copyStatus}</p>}
      <div ref={generatedPromptRef} className="builder-result-anchor mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><p className="text-sm font-bold text-gray-900">Generated prompt</p><span className="text-xs font-medium text-gray-400">{selectedId === 'main' ? 'Best fit' : 'Selected approach'}</span></div>
        <div className="p-3 sm:p-4"><TextArea id="generatedPrompt" value={selectedPrompt} readOnly rows={12} /></div>
      </div>

      {launchAccess.active && (
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">One-click AI launch</p><p className="mt-1 text-xs text-gray-600">{launchAccess.allowed ? 'Your selected prompt is copied automatically, then your AI opens in a new tab.' : 'Pro unlocks direct launch to your favorite AI — no copy-paste setup.'}</p></div>{!launchAccess.allowed && <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700">PRO</span>}</div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{AI_LAUNCH_TARGETS.map((target) => <Button key={target.id} variant={launchAccess.allowed ? 'primary' : 'secondary'} size="sm" disabled={!launchAccess.allowed} onClick={() => handleLaunch(target.id)}>{launchAccess.allowed ? `Open in ${target.label}` : target.label}</Button>)}</div>{launchStatus && <p className="mt-3 text-xs font-medium text-gray-700" role="status">{launchStatus}</p>}</div>
      )}

      {intentAccess.allowed && intelligence?.recommendations?.length > 0 && <div className="mt-5 rounded-2xl border border-gray-100 p-4"><p className="text-sm font-semibold text-gray-800">PromptStudio suggestions</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{intelligence.recommendations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
    </div>
  );
}

export default ResultCard;
