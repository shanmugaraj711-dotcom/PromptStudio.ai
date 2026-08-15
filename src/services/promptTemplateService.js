import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";

const templatesRef = (uid) => collection(db, "users", uid, "promptTemplates");

export const subscribeToPromptTemplates = (uid, onChange, onError) => {
  if (!uid) throw new Error("User not authenticated");
  const q = query(templatesRef(uid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
};

export const createPromptTemplate = async (uid, { name, template, variables }) => {
  if (!uid) throw new Error("User not authenticated");
  if (!name?.trim() || !template?.trim()) throw new Error("Template name and prompt are required");

  const ref = await addDoc(templatesRef(uid), {
    name: name.trim().slice(0, 120),
    template: template.trim(),
    variables: Array.isArray(variables) ? variables.slice(0, 30) : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const updatePromptTemplate = async (uid, templateId, values) => {
  if (!uid || !templateId) throw new Error("Missing user or template ID");
  await updateDoc(doc(db, "users", uid, "promptTemplates", templateId), {
    ...(values.name !== undefined ? { name: values.name.trim().slice(0, 120) } : {}),
    ...(values.template !== undefined ? { template: values.template.trim() } : {}),
    ...(values.variables !== undefined ? { variables: values.variables.slice(0, 30) } : {}),
    updatedAt: serverTimestamp(),
  });
};

export const deletePromptTemplate = async (uid, templateId) => {
  if (!uid || !templateId) throw new Error("Missing user or template ID");
  await deleteDoc(doc(db, "users", uid, "promptTemplates", templateId));
};
