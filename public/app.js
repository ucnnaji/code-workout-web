const state = {
  participantId: "",
  language: "",
  sessionId: localStorage.getItem("cw_session_id") || "",
  modalities: [],
  currentModality: "",
  assignment: null,
  lastExecutionText: "",
  feedbackRequests: 0,
  editor: null,
  monacoReady: false,
  dirty: false,
  autosaveTimer: null,
  savingDraft: false,
  review: null,
  loadingAssignment: false
};

const $ = id => document.getElementById(id);
const screens = ["participantScreen","languageScreen","modalityScreen","workspaceScreen","reviewScreen"].map($);
function showScreen(id) {
  screens.forEach(s => s.classList.toggle("hidden", s.id !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message, timeout = 3600) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), timeout);
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || "Unexpected server response." }; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function formatLabel(value) {
  return String(value || "").split("-").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
}
function setBusy(button, busy, label) {
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}
async function confirmAction(title, message) {
  const dialog = $("confirmDialog");
  $("dialogTitle").textContent = title;
  $("dialogMessage").textContent = message;
  dialog.showModal();
  return new Promise(resolve => {
    const handler = () => {
      dialog.removeEventListener("close", handler);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", handler);
  });
}

function getCode() {
  return state.editor ? state.editor.getValue() : $("fallbackEditor").value;
}
function setCode(value) {
  if (state.editor) state.editor.setValue(value || "");
  else $("fallbackEditor").value = value || "";
}
function markDirty() {
  if (!state.assignment || state.loadingAssignment) return;
  state.dirty = true;
  $("autosaveStatus").textContent = "Unsaved changes";
  $("autosaveStatus").className = "autosave saving";
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(saveDraft, 2600);
}
async function saveDraft() {
  if (!state.assignment || !state.dirty || state.savingDraft) return;
  state.savingDraft = true;
  $("autosaveStatus").textContent = "Saving…";
  $("autosaveStatus").className = "autosave saving";
  try {
    await api("/api/draft", {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        assignmentId: state.assignment.assignmentId,
        code: getCode(),
        explanation: $("explanationInput").value,
        clientTimestamp: new Date().toISOString()
      })
    });
    state.dirty = false;
    $("autosaveStatus").textContent = "Saved";
    $("autosaveStatus").className = "autosave";
  } catch (error) {
    $("autosaveStatus").textContent = "Auto-save failed";
    $("autosaveStatus").className = "autosave error";
    console.error(error);
  } finally {
    state.savingDraft = false;
  }
}

function initEditor() {
  const fallback = $("fallbackEditor");
  const host = $("editorHost");
  const enableFallback = () => {
    host.classList.add("hidden");
    fallback.classList.remove("hidden");
    fallback.addEventListener("input", markDirty);
  };
  if (!window.require) return enableFallback();
  try {
    const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/";
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment={baseUrl:'${base}'};importScripts('${base}vs/base/worker/workerMain.js');`)}`
    };
    window.require.config({ paths: { vs: `${base}vs` } });
    window.require(["vs/editor/editor.main"], () => {
      state.editor = monaco.editor.create(host, {
        value: "",
        language: "python",
        theme: "vs",
        automaticLayout: true,
        fontSize: 15,
        lineHeight: 23,
        minimap: { enabled: false },
        lineNumbers: "on",
        roundedSelection: true,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        tabSize: 4,
        insertSpaces: true,
        autoIndent: "full",
        bracketPairColorization: { enabled: true },
        matchBrackets: "always",
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        parameterHints: { enabled: true },
        formatOnPaste: true,
        formatOnType: true,
        folding: true,
        glyphMargin: false
      });
      monaco.languages.registerCompletionItemProvider("python", {
        provideCompletionItems: () => ({ suggestions: [
          { label: "for range", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for ${1:i} in range(${2:start}, ${3:stop}):\n    ${4:pass}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: "if", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "if ${1:condition}:\n    ${2:pass}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: "function", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "def ${1:name}(${2:args}):\n    ${3:pass}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: "print", kind: monaco.languages.CompletionItemKind.Function, insertText: "print(${1:value})", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
        ] })
      });
      monaco.languages.registerCompletionItemProvider("java", {
        provideCompletionItems: () => ({ suggestions: [
          { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "public class Main {\n    public static void main(String[] args) {\n        ${1:// code}\n    }\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: "for loop", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for (int ${1:i} = ${2:0}; ${1:i} < ${3:n}; ${1:i}++) {\n    ${4:// code}\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
          { label: "sout", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "System.out.println(${1:value});", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
        ] })
      });
      state.editor.onDidChangeModelContent(markDirty);
      state.editor.onDidFocusEditorWidget(() => trackEvent("editor_focus"));
      state.editor.onDidBlurEditorWidget(() => trackEvent("editor_blur"));
      state.monacoReady = true;
      if (state.assignment) {
        state.loadingAssignment = true;
        monaco.editor.setModelLanguage(state.editor.getModel(), state.assignment.question.language === "java" ? "java" : "python");
        state.editor.setValue(state.assignment.draft?.code ?? state.assignment.question.starterCode ?? "");
        state.editor.updateOptions({ readOnly: state.assignment.modalityId === "code-explanation" });
        state.loadingAssignment = false;
      }
    }, enableFallback);
  } catch (error) {
    console.warn("Monaco failed to initialize", error);
    enableFallback();
  }
}

function applySessionPayload(data) {
  state.sessionId = data.session.id;
  state.participantId = data.session.participantId;
  state.language = data.session.language;
  state.modalities = data.modalities || [];
  localStorage.setItem("cw_session_id", state.sessionId);
  localStorage.setItem("cw_participant_id", state.participantId || "");
  $("sessionMeta").textContent = `Participant ${state.participantId} · ${formatLabel(state.language)}`;
  $("sessionMeta").classList.remove("hidden");
  renderModalities(data);
}
function renderModalities(data = null) {
  if (data?.modalities) state.modalities = data.modalities;
  const completed = state.modalities.filter(m => m.completed).length;
  const total = state.modalities.length || 3;
  $("progressText").textContent = `${completed} of ${total} modalities completed`;
  $("progressBar").style.width = `${Math.round((completed / total) * 100)}%`;
  const grid = $("modalityGrid");
  grid.replaceChildren();
  for (const m of state.modalities) {
    const button = document.createElement("button");
    button.className = `modality-card${m.completed ? " completed" : ""}`;
    button.disabled = m.completed || data?.session?.status === "completed";
    button.innerHTML = `<h3>${escapeHtml(m.label)}</h3><p>${escapeHtml(m.description || "")}</p><span class="status">${m.completed ? "✓ Completed" : "Available · 3 randomized questions"}</span>`;
    button.addEventListener("click", () => startModality(m.id));
    grid.appendChild(button);
  }
  const done = data?.session?.status === "completed" || (state.modalities.length && completed === total);
  $("studyCompletedBanner").classList.toggle("hidden", !done);
  showScreen("modalityScreen");
  trackEvent("modality_screen_viewed");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

async function startModality(modalityId) {
  state.currentModality = modalityId;
  const cardButtons = document.querySelectorAll(".modality-card");
  cardButtons.forEach(b => b.disabled = true);
  try {
    const data = await api("/api/modality/start", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, modalityId }) });
    if (data.reviewRequired) return renderReview(data.review);
    loadAssignment(data.assignment);
  } catch (error) {
    toast(error.message);
    cardButtons.forEach((b, i) => b.disabled = state.modalities[i]?.completed || false);
  }
}

function loadAssignment(assignment) {
  state.assignment = assignment;
  state.currentModality = assignment.modalityId;
  state.lastExecutionText = "";
  state.feedbackRequests = 0;
  state.dirty = false;
  state.loadingAssignment = true;
  $("questionProgressText").textContent = `Question ${assignment.questionNumber} of ${assignment.totalQuestions}`;
  $("questionProgressBar").style.width = `${(assignment.questionNumber / assignment.totalQuestions) * 100}%`;
  $("languagePill").textContent = formatLabel(assignment.question.language);
  $("modalityPill").textContent = formatLabel(assignment.modalityId);
  $("difficultyPill").textContent = formatLabel(assignment.question.difficulty);
  $("taskTitle").textContent = assignment.question.title;
  $("taskId").textContent = assignment.question.id;
  $("taskPrompt").textContent = assignment.question.prompt;
  $("traceInstructions").classList.toggle("hidden", assignment.modalityId !== "code-explanation");
  $("explanationLabel").textContent = assignment.modalityId === "code-explanation" ? "Predicted output / explanation" : "Explanation / notes (optional)";
  $("explanationInput").value = assignment.draft?.explanation || "";
  $("stdinInput").value = "";
  setCode(assignment.draft?.code ?? assignment.question.starterCode ?? "");
  if (state.editor) {
    monaco.editor.setModelLanguage(state.editor.getModel(), assignment.question.language === "java" ? "java" : "python");
    state.editor.updateOptions({ readOnly: assignment.modalityId === "code-explanation" });
  } else {
    $("fallbackEditor").readOnly = assignment.modalityId === "code-explanation";
  }
  $("programOutput").textContent = "Run your code to see compilation/runtime output here.";
  $("executionStatus").textContent = "Not run";
  $("aiFeedback").textContent = "Request feedback when you are ready. AI feedback is separate from actual program execution.";
  state.feedbackRequests = Number(assignment.feedbackCount || 0);
  $("feedbackCount").textContent = `${state.feedbackRequests} request${state.feedbackRequests === 1 ? "" : "s"}`;
  if (assignment.lastFeedback?.feedback) $("aiFeedback").textContent = assignment.lastFeedback.feedback;
  if (assignment.lastExecution) {
    state.lastExecutionText = combinedExecutionText(assignment.lastExecution);
    $("programOutput").textContent = state.lastExecutionText;
    $("executionStatus").textContent = assignment.lastExecution.status || "Previously run";
  }
  state.loadingAssignment = false;
  $("autosaveStatus").textContent = "Saved";
  $("autosaveStatus").className = "autosave";
  showScreen("workspaceScreen");
  requestAnimationFrame(() => state.editor?.layout());
}

function applyExecutionMarkers(text) {
  if (!state.editor || !window.monaco) return;
  const model = state.editor.getModel();
  monaco.editor.setModelMarkers(model, "execution", []);
  if (!text) return;
  const patterns = [/Main\.java:(\d+):/g, /line (\d+)/gi];
  const markers = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) && markers.length < 8) {
      const line = Math.max(1, Math.min(model.getLineCount(), Number(match[1])));
      markers.push({ severity: monaco.MarkerSeverity.Error, message: "Execution/compiler error reported for this line.", startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) });
    }
  }
  if (markers.length) monaco.editor.setModelMarkers(model, "execution", markers);
}
function basicFormatCode(language, code) {
  const lines = code.replace(/\t/g, "    ").split(/\r?\n/).map(line => line.replace(/\s+$/g, ""));
  if (language !== "java") return lines.join("\n");
  let indent = 0;
  return lines.map(raw => {
    const t = raw.trim();
    if (!t) return "";
    if (t.startsWith("}")) indent = Math.max(0, indent - 1);
    const out = "    ".repeat(indent) + t;
    if (t.endsWith("{") && !t.startsWith("//")) indent += 1;
    return out;
  }).join("\n");
}

function combinedExecutionText(data) {
  const sections = [];
  if (data.stdout) sections.push(`STDOUT\n${data.stdout}`);
  if (data.stderr) sections.push(`STDERR\n${data.stderr}`);
  if (data.compileOutput) sections.push(`COMPILER\n${data.compileOutput}`);
  return sections.join("\n\n") || "Program finished with no output.";
}

$("participantContinue").addEventListener("click", () => {
  const id = $("participantId").value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,64}$/.test(id)) return toast("Enter a valid Participant ID using letters, numbers, hyphens, or underscores.");
  state.participantId = id;
  showScreen("languageScreen");
});
$("participantId").addEventListener("keydown", e => { if (e.key === "Enter") $("participantContinue").click(); });
$("backParticipant").addEventListener("click", () => showScreen("participantScreen"));
document.querySelectorAll(".language-choice").forEach(button => button.addEventListener("click", async () => {
  const language = button.dataset.language;
  document.querySelectorAll(".language-choice").forEach(b => b.disabled = true);
  try {
    const data = await api("/api/session/start", { method: "POST", body: JSON.stringify({ participantId: state.participantId, language }) });
    applySessionPayload(data);
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    document.querySelectorAll(".language-choice").forEach(b => b.disabled = false);
  }
}));

$("runCode").addEventListener("click", async () => {
  if (!state.assignment) return;
  const code = getCode();
  if (!code.trim()) return toast("Enter code before running it.");
  const button = $("runCode");
  setBusy(button, true, "Running…");
  $("executionStatus").textContent = "Running";
  $("programOutput").textContent = "Executing in a sandbox…";
  trackEvent("run_clicked");
  try {
    await saveDraft();
    const data = await api("/api/execute", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, assignmentId: state.assignment.assignmentId, code, stdin: $("stdinInput").value }) });
    state.lastExecutionText = combinedExecutionText(data);
    $("programOutput").textContent = state.lastExecutionText;
    $("executionStatus").textContent = `${data.status}${data.runtimeMs != null ? ` · ${data.runtimeMs} ms` : ""}`;
    applyExecutionMarkers([data.stderr, data.compileOutput].filter(Boolean).join("\n"));
  } catch (error) {
    state.lastExecutionText = error.message;
    $("programOutput").textContent = error.message;
    $("executionStatus").textContent = "Execution unavailable";
    applyExecutionMarkers(error.message);
  } finally {
    setBusy(button, false);
  }
});

$("getFeedback").addEventListener("click", async () => {
  if (!state.assignment) return;
  const code = getCode();
  const explanation = $("explanationInput").value;
  if (state.assignment.modalityId === "code-explanation" && !explanation.trim()) return toast("Enter your explanation or predicted output first.");
  if (state.assignment.modalityId !== "code-explanation" && !code.trim()) return toast("Enter code before requesting feedback.");
  const button = $("getFeedback");
  setBusy(button, true, "Getting feedback…");
  trackEvent("feedback_clicked");
  try {
    await saveDraft();
    const data = await api("/api/feedback", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, assignmentId: state.assignment.assignmentId, code, explanation, executionOutput: state.lastExecutionText }) });
    state.feedbackRequests = data.requestNumber;
    $("aiFeedback").textContent = data.feedback;
    $("feedbackCount").textContent = `${data.requestNumber} request${data.requestNumber === 1 ? "" : "s"}`;
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    setBusy(button, false);
  }
});

$("saveFinal").addEventListener("click", async () => {
  if (!state.assignment) return;
  const code = getCode();
  const explanation = $("explanationInput").value;
  if (state.assignment.modalityId === "code-explanation" && !explanation.trim()) return toast("Enter your explanation or predicted output before saving.");
  if (state.assignment.modalityId !== "code-explanation" && !code.trim()) return toast("Enter code before saving.");
  const ok = await confirmAction("Save final response?", state.assignment.questionNumber < 3 ? "After saving, this question is locked and the next randomized question will open." : "After saving Question 3, you will review all three responses before completing this modality.");
  if (!ok) return;
  const button = $("saveFinal");
  setBusy(button, true, "Saving…");
  trackEvent("save_clicked");
  try {
    const data = await api("/api/submissions/finalize", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, assignmentId: state.assignment.assignmentId, code, explanation }) });
    state.dirty = false;
    if (data.reviewRequired) renderReview(data.review);
    else if (data.assignment) loadAssignment(data.assignment);
  } catch (error) {
    toast(error.message, 6000);
  } finally {
    setBusy(button, false);
  }
});

$("formatCode").addEventListener("click", async () => {
  if (state.assignment?.modalityId === "code-explanation") return toast("Code tracing snippets are read-only.");
  const language = state.assignment?.question?.language || state.language;
  const before = getCode();
  if (state.editor) {
    try {
      const action = state.editor.getAction("editor.action.formatDocument");
      if (action) await action.run();
    } catch {}
  }
  const afterMonaco = getCode();
  if (afterMonaco === before) setCode(basicFormatCode(language, before));
  markDirty();
  toast("Formatting applied.");
});

$("backToModalities").addEventListener("click", async () => {
  if (state.dirty) {
    const ok = await confirmAction("Leave this question?", "Your draft will be auto-saved before returning to the modality list.");
    if (!ok) return;
    await saveDraft();
  }
  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);
    applySessionPayload(data);
  } catch (error) { toast(error.message); }
});

function renderReview(review) {
  state.review = review;
  state.currentModality = review.modalityId;
  $("reviewTitle").textContent = `Review ${formatLabel(review.modalityId)} responses`;
  const list = $("reviewList");
  list.replaceChildren();
  for (const item of review.items) {
    const details = document.createElement("details");
    details.className = "review-item";
    details.open = item.questionOrder === 1;
    details.innerHTML = `<summary>Question ${item.questionOrder}: ${escapeHtml(item.title)} <span class="muted">(${escapeHtml(item.questionId)})</span></summary>
      <div class="review-body">
        <h4>Question</h4><p>${escapeHtml(item.prompt)}</p>
        <h4>Saved code</h4><pre>${escapeHtml(item.finalCode || "(no code response)")}</pre>
        <h4>Saved explanation</h4><p>${escapeHtml(item.finalExplanation || "(none)")}</p>
        <h4>Last recorded program output</h4><pre>${escapeHtml(item.finalOutput || "(not run)")}</pre>
      </div>`;
    list.appendChild(details);
  }
  showScreen("reviewScreen");
}

$("completeModality").addEventListener("click", async () => {
  if (!state.review) return;
  const ok = await confirmAction("Complete this modality?", "This will lock the modality. You will not be able to repeat it.");
  if (!ok) return;
  const button = $("completeModality");
  setBusy(button, true, "Completing…");
  try {
    const data = await api("/api/modality/complete", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, modalityId: state.review.modalityId }) });
    state.review = null;
    applySessionPayload(data);
    toast(data.session.status === "completed" ? "All modalities are complete." : "Modality completed and locked.");
  } catch (error) {
    toast(error.message, 6000);
  } finally { setBusy(button, false); }
});

$("newParticipant").addEventListener("click", async () => {
  const ok = await confirmAction("Start a new participant?", "This only clears this browser's local session. Existing research data remains saved in Supabase.");
  if (!ok) return;
  localStorage.removeItem("cw_session_id");
  localStorage.removeItem("cw_participant_id");
  state.participantId = ""; state.language = ""; state.sessionId = ""; state.modalities = []; state.assignment = null; state.review = null; state.dirty = false;
  $("participantId").value = "";
  $("sessionMeta").classList.add("hidden");
  showScreen("participantScreen");
});

$("explanationInput").addEventListener("input", markDirty);
$("stdinInput").addEventListener("input", () => { /* stdin is execution-only and is not part of the final draft */ });

function trackEvent(eventType, eventData = {}) {
  if (!state.sessionId) return;
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId, assignmentId: state.assignment?.assignmentId || null, eventType, eventData, clientTimestamp: new Date().toISOString() }),
    keepalive: true
  }).catch(() => {});
}

document.addEventListener("visibilitychange", () => trackEvent(document.hidden ? "page_hidden" : "page_visible"));
window.addEventListener("beforeunload", event => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

async function restoreSession() {
  if (!state.sessionId) return;
  try {
    const data = await api(`/api/session/${encodeURIComponent(state.sessionId)}`);
    applySessionPayload(data);
  } catch {
    localStorage.removeItem("cw_session_id");
    state.sessionId = "";
  }
}

initEditor();
restoreSession();
