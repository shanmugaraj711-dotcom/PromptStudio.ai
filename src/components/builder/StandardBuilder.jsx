import React from 'react';
import { Link } from 'react-router-dom';
import Select from '../ui/Select';
import TextArea from '../ui/TextArea';
import AIDiscoveryPanel from './AIDiscoveryPanel';
import { CATEGORIES } from '../../constants/categories';

export default function StandardBuilder({
  category,
  setCategory,
  aiModel,
  handleToolSelect,
  handleExample,
  idea,
  setIdea,
  error,
  isGenerating,
  isPreparingImage,
  workflowActive
}) {
  return (
    <>
      <div className="rounded-2xl border border-indigo-400/30 bg-indigo-400/10/40 p-4">
        <p className="text-sm font-black text-indigo-200">1. What are you creating?</p>
        <p className="mt-1 text-xs text-indigo-200">Pick a category to see the right AI tools and real examples for that kind of work.</p>
        <div className="mt-4">
          <Select
            id="category"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={CATEGORIES.filter((c) => c.id !== 'image' && c.id !== 'coding')}
            disabled={isGenerating || isPreparingImage || workflowActive}
          />
        </div>
      </div>

      <AIDiscoveryPanel
        category={category}
        aiModel={aiModel}
        onToolSelect={handleToolSelect}
        onExample={handleExample}
      />

      <div className="mt-5">
        <TextArea
          id="idea"
          label="Your idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="What do you want AI to create?"
          rows={6}
          error={error}
          disabled={isGenerating || isPreparingImage}
        />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-[11px] font-medium text-slate-400">
          <span>Most people don't type their idea — they upload it. Try</span>
          <Link to="/builder?mode=image" className="text-indigo-600 hover:text-indigo-200 hover:underline">Image → Prompt</Link>
          <span className="text-slate-300">or</span>
          <Link to="/reference-coding" className="text-indigo-600 hover:text-indigo-200 hover:underline">Reference Coding →</Link>
        </div>
      </div>
    </>
  );
}
