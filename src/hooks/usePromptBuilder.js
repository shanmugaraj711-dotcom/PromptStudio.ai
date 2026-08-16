import { useCallback, useRef, useState } from "react";
import { generatePrompt } from "../services/promptGenerator";
import { useAuth } from "../context/AuthContext";

const createRequestId = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const prepareImage = (file) => new Promise((resolve, reject) => {
  if (!file || !file.type?.startsWith("image/")) return reject(new Error("Please choose a valid image file."));
  if (file.size > MAX_IMAGE_BYTES) return reject(new Error("Please choose an image smaller than 3 MB."));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("We could not read that image."));
  reader.onload = () => {
    const source = String(reader.result || "");
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
      const commaIndex = dataUrl.indexOf(",");
      resolve({ mimeType: "image/jpeg", data: commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl, name: file.name });
    };
    image.onerror = () => reject(new Error("We could not decode that image."));
    image.src = source;
  };
  reader.readAsDataURL(file);
});

export function usePromptBuilder() {
  const { user, loginWithGoogle, updateQuotaState } = useAuth();
  const [idea, setIdea] = useState("");
  const [aiModel, setAiModel] = useState("chatgpt");
  const [category, setCategory] = useState("writing");
  const [image, setImage] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [perspectives, setPerspectives] = useState([]);
  const [intelligence, setIntelligence] = useState(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const requestInFlightRef = useRef(false);

  const selectImage = useCallback(async (file) => {
    setError(""); setIsPreparingImage(true);
    try { setImage(await prepareImage(file)); }
    catch (err) { setImage(null); setError(err.message || "Unable to use that image."); }
    finally { setIsPreparingImage(false); }
  }, []);
  const clearImage = useCallback(() => setImage(null), []);

  const generate = useCallback(async () => {
    if (requestInFlightRef.current) return;
    if (!idea.trim() && !image) return setError("Describe what you want AI to create or attach a reference image.");

    setError("");
    requestInFlightRef.current = true;
    setIsGenerating(true);

    try {
      // Keep the current builder state untouched while Google authentication is open.
      // Use the returned Firebase user immediately so generation does not depend on
      // the asynchronous onAuthStateChanged cycle finishing first.
      let authenticatedUser = user;
      if (!authenticatedUser) {
        try {
          authenticatedUser = await loginWithGoogle();
        } catch (err) {
          if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
            return;
          }
          throw err;
        }
      }

      if (!authenticatedUser) return;

      const idToken = await authenticatedUser.getIdToken();
      const result = await generatePrompt({ idea: idea.trim(), aiModel, category, idToken, requestId: createRequestId(), image });
      setGeneratedPrompt(result.prompt);
      setHistoryId(result.historyId || "");
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
  }, [idea, aiModel, category, image, user, loginWithGoogle, updateQuotaState]);

  const reset = useCallback(() => {
    setIdea(""); setImage(null); setGeneratedPrompt(""); setHistoryId(""); setPerspectives([]); setIntelligence(null); setError("");
  }, []);

  return { idea, setIdea, aiModel, setAiModel, category, setCategory, image, selectImage, clearImage, generatedPrompt, historyId, perspectives, intelligence, error, isGenerating, isPreparingImage, generate, reset };
}
