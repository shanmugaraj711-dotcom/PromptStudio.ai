import { copyToClipboard } from '../utils/copyToClipboard';

export const AI_LAUNCH_TARGETS = Object.freeze([
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'grok', label: 'Grok', url: 'https://grok.com/' },
]);

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

  const popup = window.open(target.url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    return { success: false, reason: 'popup_blocked' };
  }

  return { success: true, target: target.id };
}
