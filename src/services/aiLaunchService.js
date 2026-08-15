import { copyToClipboard } from '../utils/copyToClipboard';

export const AI_LAUNCH_TARGETS = Object.freeze([
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' },
]);

// Deliberately copies only. We do not open third-party tabs or trigger pop-ups.
// This keeps the user inside PromptStudio and avoids browser popup-blocker UX.
export async function launchPromptInAI(prompt, targetId) {
  if (!prompt || !targetId) {
    return { success: false, reason: 'missing_prompt_or_target' };
  }

  const target = AI_LAUNCH_TARGETS.find((item) => item.id === targetId);
  if (!target) {
    return { success: false, reason: 'unknown_target' };
  }

  const copied = await copyToClipboard(prompt);
  if (!copied) {
    return { success: false, reason: 'clipboard_failed' };
  }

  return { success: true, target: target.id };
}
