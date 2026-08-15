import { useCallback, useRef, useState } from "react";
import { generatePrompt } from "../services/promptGenerator";
import { useAuth } from "../context/AuthContext";

const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const prepareImage = (file) => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith("image/")) {
    reject(new Error("Please choose a valid image file."));
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    reject(new Error("Please choose an image smaller than 3 MB."));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("We could not read that image."));
  reader.onload = () => {
    const source = String(reader.result || "");
    const image = new Image();
    image.onload = () => {
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
      const commaIndex = dataUrl.indexOf(",");
      resolve({
        mimeType: "image/jpeg",
        data: commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl,
        name: file.name,
      });
    };
    image.onerror = () => reject(new Error("We could not decode that image."));
    image.src = source;
  };
  reader.readAsDataURL(file);
});

export function usePromptBuilder() {
  const { user, updateQuotaState } = useAuth();
  const [idea, setIdea] = useState("");
  const [aiModel, setAiModel] = useState("chatgpt");
  const [category, setCategory] = useState("writing");
  const [image, setImage] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [perspectives, setPerspectives] = useState([]);
  const [intelligence, setIntelligence] = useState(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const requestInFlightRef = useRef(false);

  const selectImage = useCallback(async (file) => {
    setError("");
    setIsPreparingImage(true);
    try {
      setImage(await prepareImage(file));
    } catch (err) {
      setImage(null);
      setError(err.message || "Unable to use that image.");
    } finally {
      setIsPreparingImage(false);
    }
  }, []);

  const clearImage = useCallback(() => setImage(null), []);

  const generate = useCallback(async () => {
    if (requestInFlightRef.current) return;
    if (!idea.trim() && !image) {
      setError("Describe what you want AI to create or attach a reference image.");
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
        image,
      });
      setGeneratedPrompt(result.prompt);
      setPerspectives(result.perspectives || []);
      setIntelligence(result.intelligence || null);
      updateQuotaState(result.quota);
    } catch (err) {
      console.error("Failed to generate prompt:", err);
      if (err.quota) updateQuotaState(err.quota);
      setError(err.message || "Unable to generate a prompt. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsGenerating(false);
    }
  }, [idea, aiModel, category, image, user, updateQuotaState]);

  const reset = useCallback(() => {
    setIdea("");
    setImage(null);
    setGeneratedPrompt("");
    setPerspectives([]);
    setIntelligence(null);
    setError("");
  }, []);

  return {
    idea,
    setIdea,
    aiModel,
    setAiModel,
    category,
    setCategory,
    image,
    selectImage,
    clearImage,
    generatedPrompt,
    perspectives,
    intelligence,
    error,
    isGenerating,
    isPreparingImage,
    generate,
    reset,
  };
}
