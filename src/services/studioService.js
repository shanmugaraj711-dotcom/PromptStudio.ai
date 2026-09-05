const request = async (body, idToken) => {
  const response = await fetch("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Studio could not complete that request.");
    error.code = payload.code;
    throw error;
  }
  return payload;
};

export const generateStudioProject = ({ prompt, idToken, referenceFiles = [] }) =>
  request({ action: "generate", prompt, referenceFiles }, idToken);

export const editStudioProject = ({ files, instruction, idToken }) =>
  request({ action: "edit", files, instruction }, idToken);
