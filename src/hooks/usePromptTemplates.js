import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createPromptTemplate,
  deletePromptTemplate,
  subscribeToPromptTemplates,
  updatePromptTemplate,
} from "../services/promptTemplateService";

export const extractPromptVariables = (template = "") => {
  const matches = template.match(/\{\{\s*([A-Za-z0-9_ -]{1,60})\s*\}\}/g) || [];
  return [...new Set(matches.map((item) => item.replace(/^\{\{\s*|\s*\}\}$/g, "").trim()).filter(Boolean))];
};

export const fillPromptVariables = (template = "", values = {}) =>
  template.replace(/\{\{\s*([A-Za-z0-9_ -]{1,60})\s*\}\}/g, (_, key) => values[key.trim()] ?? `{{${key.trim()}}}`);

export const usePromptTemplates = () => {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const [templates, setTemplates] = useState([]);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return undefined;
    const unsubscribe = subscribeToPromptTemplates(userId, (items) => {
      setTemplates(items);
      setLoadedUserId(userId);
      setError("");
    }, (err) => {
      console.error("Unable to load prompt templates:", err);
      setError("Unable to load your reusable prompts. Please try again shortly.");
      setLoadedUserId(userId);
    });
    return unsubscribe;
  }, [userId]);

  const createTemplate = useCallback(async (values) => {
    if (!userId) throw new Error("User not authenticated");
    return createPromptTemplate(userId, values);
  }, [userId]);

  const updateTemplate = useCallback(async (id, values) => {
    if (!userId || !id) return;
    return updatePromptTemplate(userId, id, values);
  }, [userId]);

  const removeTemplate = useCallback(async (id) => {
    if (!userId || !id) return;
    return deletePromptTemplate(userId, id);
  }, [userId]);

  return {
    templates: loadedUserId === userId ? templates : [],
    loading: Boolean(userId) && loadedUserId !== userId,
    error: loadedUserId === userId ? error : "",
    createTemplate,
    updateTemplate,
    removeTemplate,
  };
};
