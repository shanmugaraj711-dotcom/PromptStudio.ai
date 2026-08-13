import { useState } from 'react';
import TextArea from '../../components/ui/TextArea';
import Button from '../../components/ui/Button';
import { copyToClipboard } from '../../utils/copyToClipboard';

function ResultCard({ prompt, originalIdea, aiModel, category, onImprove }) {
  const [copyStatus, setCopyStatus] = useState('');

  const handleCopy = async () => {
    const success = await copyToClipboard(prompt);
    if (success) {
      setCopyStatus('Copied to clipboard');
      setTimeout(() => setCopyStatus(''), 2000);
    } else {
      setCopyStatus('Copy failed. Select the prompt and copy it manually.');
    }
  };

  return (
    <div className="rounded-3xl border border-blue-100 bg-white p-8 shadow-md sm:p-10">
      {originalIdea && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Original Idea</h4>
          <p className="text-gray-800 text-sm">{originalIdea}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Final Optimized Prompt</h3>
          <p className="text-sm text-gray-500 mt-1">
            Ready to use! Just copy and paste into your AI.
          </p>
        </div>
        <div className="flex gap-2">
          {onImprove && (
            <Button variant="secondary" size="sm" onClick={onImprove}>
              Regenerate / Improve
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleCopy}>
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {copyStatus === 'Copied to clipboard' ? 'Copied ✓' : 'COPY PROMPT'}
          </Button>
        </div>
      </div>

      {copyStatus && copyStatus !== 'Copied to clipboard' && (
        <p className="mb-4 text-sm text-gray-600" role="status">
          {copyStatus}
        </p>
      )}

      <div className="mt-2 relative">
        <TextArea id="generatedPrompt" value={prompt} readOnly rows={12} />
      </div>

      {(aiModel || category) && (
        <div className="mt-6 flex flex-wrap gap-4 pt-6 border-t border-gray-100">
          <div className="w-full">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Why this prompt is better:</h4>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Structured with clear instructions and context.</li>
              <li>Optimized specifically for the intended task.</li>
            </ul>
          </div>
          <div className="flex gap-4 w-full mt-2">
            {aiModel && (
              <div className="text-sm">
                <span className="font-semibold text-gray-700">Recommended AI: </span>
                <span className="text-gray-600 capitalize">{aiModel}</span>
              </div>
            )}
            {category && (
              <div className="text-sm">
                <span className="font-semibold text-gray-700">Category: </span>
                <span className="text-gray-600 capitalize">{category}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultCard;
