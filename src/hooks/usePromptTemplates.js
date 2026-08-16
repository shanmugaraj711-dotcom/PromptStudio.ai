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
  const { user, plan } = useAuth();
  const userId = user?.uid || null;
  const [templates, setTemplates] = useState([]);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return undefined;

    // Reusable templates are Pro-only. Free users must not query the protected
    // Firestore collection, which would otherwise produce a permission error.
    if (plan !== "pro") {
      setTemplates([]);
      setLoadedUserId(userId);
      setError("");
      return undefined;
    }

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
  }, [userId, plan]);

  const createTemplate = useCallback(async (values) => {
    if (!userId) throw new Error("User not authenticated");
    if (plan !== "pro") throw new Error("Reusable templates are available on Pro.");
    return createPromptTemplate(userId, values);
  }, [userId, plan]);

  const updateTemplate = useCallback(async (id, values) => {
    if (!userId || !id) return;
    if (plan !== "pro") throw new Error("Reusable templates are available on Pro.");
    return updatePromptTemplate(userId, id, values);
  }, [userId, plan]);

  const removeTemplate = useCallback(async (id) => {
    if (!userId || !id) return;
    if (plan !== "pro") throw new Error("Reusable templates are available on Pro.");
    return deletePromptTemplate(userId, id);
  }, [userId, plan]);

  return {
    templates: loadedUserId === userId ? templates : [],
    loading: Boolean(userId) && loadedUserId !== userId,
    error: loadedUserId === userId ? error : "",
    createTemplate,
    updateTemplate,
    removeTemplate,
  };
};
