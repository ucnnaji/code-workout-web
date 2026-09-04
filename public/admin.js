let adminToken = "";
const $ = id => document.getElementById(id);

async function adminFetch(path) {
  const response = await fetch(path, { headers: { "X-Admin-Token": adminToken } });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const data = contentType.includes("json") ? await response.json() : { error: await response.text() };
    throw new Error(data.error || "Request failed.");
  }
  return response;
}
function metric(label, value) {
  const d = document.createElement("div"); d.className = "metric";
  d.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
  return d;
}
function fmtSeconds(seconds) {
  const n = Number(seconds || 0); if (!n) return "0s";
  const m = Math.floor(n / 60), s = Math.round(n % 60); return m ? `${m}m ${s}s` : `${s}s`;
}
function renderBars(container, data) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([,v]) => Number(v)));
  container.replaceChildren();
  if (!entries.length) { container.textContent = "No data yet."; return; }
  for (const [label, value] of entries) {
    const row = document.createElement("div"); row.className = "bar-row";
    const name = document.createElement("span"); name.textContent = label.replaceAll("-", " ");
    const bg = document.createElement("div"); bg.className = "bar-bg";
    const bar = document.createElement("div"); bar.className = "bar"; bar.style.width = `${Math.round(Number(value)/max*100)}%`; bg.appendChild(bar);
    const count = document.createElement("strong"); count.textContent = value;
    row.append(name,bg,count); container.appendChild(row);
  }
}
async function loadDashboard() {
  const response = await adminFetch("/api/admin/dashboard");
  const data = await response.json();
  const m = data.metrics;
  const grid = $("metricGrid"); grid.replaceChildren(
    metric("Participants", m.participants), metric("Completed sessions", `${m.completedSessions}/${m.sessions}`), metric("Completed modalities", m.completedModalities), metric("AI feedback requests", m.aiFeedbackRequests),
    metric("Avg. time / question", fmtSeconds(m.averageSecondsPerQuestion)), metric("Avg. time / modality", fmtSeconds(m.averageSecondsPerModality))
  );
  renderBars($("languageBars"), data.languageUsage);
  renderBars($("modalityBars"), data.modalityCompletion);
  const body = $("sessionRows"); body.replaceChildren();
  for (const s of data.recentSessions) {
    const tr = document.createElement("tr");
    [s.participantId, s.language, s.status, `${s.completedModalities}/4`, s.aiFeedbackRequests, fmtSeconds(s.averageSecondsPerQuestion), s.startedAt ? new Date(s.startedAt).toLocaleString() : "", s.completedAt ? new Date(s.completedAt).toLocaleString() : "", s.sessionId].forEach(v => { const td=document.createElement("td"); td.textContent=v||""; tr.appendChild(td); });
    body.appendChild(tr);
  }
}
$("adminLogin").addEventListener("click", async () => {
  adminToken = $("adminToken").value;
  $("loginError").classList.add("hidden");
  try { await loadDashboard(); $("loginCard").classList.add("hidden"); $("dashboard").classList.remove("hidden"); }
  catch (error) { $("loginError").textContent = error.message; $("loginError").classList.remove("hidden"); }
});
$("refreshDashboard").addEventListener("click", () => loadDashboard().catch(e => alert(e.message)));
async function downloadExport(path) {
  const response = await adminFetch(path);
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=([^;]+)/i);
  const filename = match ? match[1].replace(/["']/g, "") : "code-workout-export";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
$("exportCsv").addEventListener("click", () => downloadExport("/api/admin/export.csv").catch(e => alert(e.message)));
$("exportXlsx").addEventListener("click", () => downloadExport("/api/admin/export.xlsx").catch(e => alert(e.message)));
