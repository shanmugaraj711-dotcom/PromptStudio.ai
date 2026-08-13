import { useCallback, useRef, useState } from "react";
import { generatePrompt } from "../services/promptGenerator";
import { useAuth } from "../context/AuthContext";

const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export function usePromptBuilder() {
  const { user, updateQuotaState } = useAuth();

  const [idea, setIdea] = useState("");
  const [aiModel, setAiModel] = useState("chatgpt");
  const [category, setCategory] = useState("writing");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [inferredAiModel, setInferredAiModel] = useState("");
  const [inferredCategory, setInferredCategory] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const requestInFlightRef = useRef(false);

  const generate = useCallback(async () => {
    if (requestInFlightRef.current) {
      return;
    }

    if (!idea.trim()) {
      setError("Please describe what you want AI to create.");
      return;
    }

    if (!user) {
      setError("You must be logged in to generate and save prompts.");
      return;
    }

    setError("");
    requestInFlightRef.current = true;
    setIsGenerating(true);

    try {
      const idToken = await user.getIdToken();
      const result = await generatePrompt({
        idea: idea.trim(),
        aiModel,
        category,
        idToken,
        requestId: createRequestId(),
      });

      setGeneratedPrompt(result.prompt || result.content);
      setIsQuestion(result.isQuestion || false);
      setInferredAiModel(result.aiModel || "");
      setInferredCategory(result.category || "");
      updateQuotaState(result.quota);
    } catch (err) {
      console.error("Failed to generate prompt:", err);
      if (err.quota) {
        updateQuotaState(err.quota);
      }
      setError(err.message || "Unable to generate a prompt. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [idea, aiModel, category, user, updateQuotaState]);

  const reset = useCallback(() => {
    setIdea("");
    setGeneratedPrompt("");
    setIsQuestion(false);
    setInferredAiModel("");
    setInferredCategory("");
    setError("");
  }, []);

  return {
    idea,
    setIdea,
    aiModel,
    setAiModel,
    category,
    setCategory,
    generatedPrompt,
    isQuestion,
    inferredAiModel,
    inferredCategory,
    error,
    isGenerating,
    generate,
    reset,
  };
}
