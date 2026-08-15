import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";

export const subscribeToPromptHistory = (uid, onChange, onError) => {
  if (!uid) throw new Error("User not authenticated");
  const promptsRef = collection(db, "users", uid, "prompts");
  const q = query(promptsRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
};

export const deletePrompt = async (uid, promptId) => {
  if (!uid || !promptId) throw new Error("Missing user or prompt ID");
  await deleteDoc(doc(db, "users", uid, "prompts", promptId));
};

export const setPromptFavorite = async (uid, promptId, favorite) => {
  if (!uid || !promptId) throw new Error("Missing user or prompt ID");
  await updateDoc(doc(db, "users", uid, "prompts", promptId), {
    favorite: Boolean(favorite),
  });
};
