import { inflateRawSync } from "node:zlib";
const fail = (status, code, message) => { const error = new Error(message); error.status = status; error.code = code; throw error; };
const readU16 = (buffer, offset) => buffer.readUInt16LE(offset);
const readU32 = (buffer, offset) => buffer.readUInt32LE(offset);
const extractApkFromArtifactZip = (buffer) => {
  const eocdSignature = 0x06054b50, centralSignature = 0x02014b50, localSignature = 0x04034b50; let eocd = -1;
  for (let offset = Math.max(0, buffer.length - 0x10000 - 22); offset <= buffer.length - 22; offset += 1) if (readU32(buffer, offset) === eocdSignature) { eocd = offset; break; }
  if (eocd < 0) fail(502, "forge_artifact_invalid", "The Forge artifact is not a valid ZIP archive.");
  const entryCount = readU16(buffer, eocd + 10), centralSize = readU32(buffer, eocd + 12), centralOffset = readU32(buffer, eocd + 16);
  if (!entryCount || centralOffset + centralSize > buffer.length) fail(502, "forge_artifact_invalid", "The Forge artifact ZIP directory is invalid.");
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(buffer, cursor) !== centralSignature) fail(502, "forge_artifact_invalid", "The Forge artifact ZIP entry is invalid.");
    const method = readU16(buffer, cursor + 10), compressedSize = readU32(buffer, cursor + 20), uncompressedSize = readU32(buffer, cursor + 24), nameLength = readU16(buffer, cursor + 28), extraLength = readU16(buffer, cursor + 30), commentLength = readU16(buffer, cursor + 32), localOffset = readU32(buffer, cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"); cursor += 46 + nameLength + extraLength + commentLength;
    if (!/\.apk$/i.test(name)) continue;
    if (readU32(buffer, localOffset) !== localSignature) fail(502, "forge_artifact_invalid", "The Forge APK entry is invalid.");
    const localNameLength = readU16(buffer, localOffset + 26), localExtraLength = readU16(buffer, localOffset + 28), dataStart = localOffset + 30 + localNameLength + localExtraLength, dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) fail(502, "forge_artifact_invalid", "The Forge APK payload is truncated.");
    const compressed = buffer.subarray(dataStart, dataEnd), apk = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (!apk || apk.length !== uncompressedSize) fail(502, "forge_artifact_invalid", "The Forge APK compression format is unsupported or corrupt.");
    return apk;
  }
  fail(502, "forge_apk_missing", "The Forge artifact did not contain an APK.");
};
export const downloadForgeArtifactApk = async (artifactId) => {
  const token = String(process.env.FORGE_GITHUB_ARTIFACT_TOKEN || "").trim();
  if (!token) fail(503, "forge_artifact_token_not_configured", "Forge APK delivery is not configured yet. A dedicated GitHub Actions read-only token is required.");
  const response = await fetch(`https://api.github.com/repos/shanmugaraj711-dotcom/PromptStudio.ai/actions/artifacts/${encodeURIComponent(artifactId)}/zip`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }, redirect: "follow" });
  if (!response.ok) fail(response.status >= 500 ? 502 : response.status, "forge_artifact_download_failed", `Unable to download the Forge artifact (${response.status}).`);
  return extractApkFromArtifactZip(Buffer.from(await response.arrayBuffer()));
};
