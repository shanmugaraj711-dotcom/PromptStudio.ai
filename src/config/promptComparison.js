export const normalizePerspectives = (perspectives = []) => perspectives
  .filter(Boolean)
  .map((item, index) => ({
    ...item,
    title: item.title || item.name || ['Best Fit', 'Creative', 'Minimalist'][index] || `Approach ${index + 1}`,
    optimizedPrompt: item.optimizedPrompt || item.prompt || '',
  }))
  .filter((item) => item.optimizedPrompt.trim())
  .slice(0, 3);
