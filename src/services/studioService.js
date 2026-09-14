const request = async (url, body, idToken, method = "POST") => {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    const error = new Error(payload.message || "Studio could not complete that request.");
    error.code = payload.code;
    throw error;
  }
  return payload;
};

export const createStudioJob = ({ prompt, idToken }) =>
  request("/api/studio-jobs", { action: "create", prompt }, idToken);

export const getStudioJob = ({ jobId, idToken }) =>
  request(`/api/studio-jobs?jobId=${encodeURIComponent(jobId)}`, null, idToken, "GET");

export const processStudioJob = ({ jobId, idToken }) =>
  request("/api/studio-jobs", { action: "process", jobId }, idToken);

export const editStudioProject = ({ files, instruction, idToken }) =>
  request("/api/studio", { action: "edit", files, instruction }, idToken);
