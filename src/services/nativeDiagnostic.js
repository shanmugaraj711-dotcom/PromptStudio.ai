const ensureDiagnostic = () => {
  let panel = document.getElementById("promptstudio-native-diagnostic");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "promptstudio-native-diagnostic";
  Object.assign(panel.style, {
    position: "fixed",
    inset: "12px",
    zIndex: "2147483647",
    padding: "18px",
    overflow: "auto",
    background: "#070b12",
    color: "#fff",
    border: "2px solid #ffb020",
    borderRadius: "14px",
    boxShadow: "0 12px 40px rgba(0,0,0,.55)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "15px",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap"
  });
  panel.innerHTML = "<strong>PromptStudio native auth diagnostic</strong>";
  document.body.appendChild(panel);
  return panel;
};

export const showNativeDiagnostic = (message) => {
  try {
    const panel = ensureDiagnostic();
    const line = document.createElement("div");
    line.textContent = message;
    line.style.marginTop = "10px";
    panel.appendChild(line);
  } catch (error) {
    console.error("Native diagnostic display failed:", error);
  }
};

window.__promptStudioNativeGoogleDiagnostic = showNativeDiagnostic;
showNativeDiagnostic("checkpoint 1: diagnostic bridge loaded");
