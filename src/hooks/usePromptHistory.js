import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToPromptHistory, deletePrompt, setPromptFavorite } from "../services/promptHistoryService";

export const usePromptHistory = () => {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const [history, setHistory] = useState([]);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return undefined;
    const unsubscribe = subscribeToPromptHistory(userId, (prompts) => {
      setHistory(prompts);
      setLoadedUserId(userId);
      setError("");
    }, (err) => {
      console.error("Unable to load prompt history:", err);
      setError("Unable to load prompt history. Please try again shortly.");
      setLoadedUserId(userId);
    });
    return unsubscribe;
  }, [userId]);

  const removePrompt = useCallback(async (id) => {
    if (!userId || !id) return;
    await deletePrompt(userId, id);
  }, [userId]);

  const toggleFavorite = useCallback(async (id, favorite) => {
    if (!userId || !id) return;
    await setPromptFavorite(userId, id, favorite);
  }, [userId]);

  const hasCurrentHistory = loadedUserId === userId;
  return {
    history: hasCurrentHistory ? history : [],
    loading: Boolean(userId) && !hasCurrentHistory,
    error: hasCurrentHistory ? error : "",
    removePrompt,
    toggleFavorite,
  };
};
