// renderer.js
console.log("[renderer] loaded");

/* ------------------------------ Tabs ------------------------------ */
const tabs = document.querySelectorAll(".tab-btn");
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
}));

/* ------------------------------ DOM ------------------------------ */
const userSessionEl     = document.getElementById("userSession");
const saveTokenBtn      = document.getElementById("saveTokenBtn");
const pollNowBtn        = document.getElementById("pollNowBtn");

const playersList       = document.getElementById("playersList");
const serversList       = document.getElementById("serversList");
const visibleCountEl    = document.getElementById("visibleCount");
const hiddenCountEl     = document.getElementById("hiddenCount");
const lastUpdatedEl     = document.getElementById("lastUpdated");
const liveStatusEl      = document.getElementById("liveStatus");
const dingEl            = document.getElementById("ding");

const showFilteredOnlyEl= document.getElementById("showFilteredOnly");
const exactMatchEl      = document.getElementById("exactMatch");

// chips UI
const filterChipsEl     = document.getElementById("filterChips");
const filterInputEl     = document.getElementById("filterInput");
const addFilterBtn      = document.getElementById("addFilterBtn");


/* ------------------------------ Helpers ------------------------------ */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function pad2(n){ return String(n).padStart(2, "0"); }
function hourToLabel(h){ return `${pad2(h)}:00`; }

/* ------------------------------ Persistence for Live chips ------------------------------ */
function loadFilters() {
  try { return JSON.parse(localStorage.getItem("filters") || "[]"); } catch { return []; }
}
function saveFilters(list) { localStorage.setItem("filters", JSON.stringify(list)); }
function loadExact() { return localStorage.getItem("filters_exact") === "1"; }
function saveExact(v) { localStorage.setItem("filters_exact", v ? "1" : "0"); }

let filterList = loadFilters();
let exactMatch = loadExact();
if (exactMatchEl) exactMatchEl.checked = exactMatch;

/* ------------------------------ Filter chips UI ------------------------------ */
function renderFilterChips() {
  if (!filterChipsEl) return;
  if (!filterList.length) {
    filterChipsEl.innerHTML = `<div class="empty">No names filtered</div>`;
    return;
  }
  filterChipsEl.innerHTML = filterList.map(n =>
    `<span class="chip removable" data-name="${esc(n)}">
       ${esc(n)} <button title="Remove" data-remove="${esc(n)}">×</button>
     </span>`
  ).join("");
  filterChipsEl.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-remove");
      filterList = filterList.filter(x => x.toLowerCase() !== name.toLowerCase());
      saveFilters(filterList);
      renderFilterChips();
      if (lastLivePayload) renderLive(lastLivePayload);
    });
  });
}
function addFilter(name) {
  name = String(name || "").trim();
  if (!name) return;
  if (!filterList.some(x => x.toLowerCase() === name.toLowerCase())) {
    filterList.push(name);
    saveFilters(filterList);
    renderFilterChips();
    if (lastLivePayload) renderLive(lastLivePayload);
  }
  if (filterInputEl) filterInputEl.value = "";
}
addFilterBtn?.addEventListener("click", () => addFilter(filterInputEl?.value));
filterInputEl?.addEventListener("keydown", (e) => { if (e.key === "Enter") addFilter(filterInputEl.value); });

// exact match toggle
exactMatchEl?.addEventListener("change", () => {
  exactMatch = !!exactMatchEl.checked;
  saveExact(exactMatch);
  if (lastLivePayload) renderLive(lastLivePayload);
});

// initial chips paint
renderFilterChips();

/* ------------------------------ Live matching ------------------------------ */
function matchesName(name, filters, exact) {
  if (!filters.length) return false;
  const L = String(name).toLowerCase();
  if (exact) return filters.some(f => L === f);
  return filters.some(f => L.includes(f));
}
function computeFiltered(names, filters, exact){
  if (!filters.length) return names.slice();
  return names.filter(n => matchesName(n, filters, exact));
}

/* ------------------------------ Live rendering ------------------------------ */
let lastLivePayload = null;
let seenFirstLive = false;
let prevFilteredSet = new Set();

function renderLive(payload){
  if (!payload || !payload.ok) {
    playersList.innerHTML = `<div class="empty">${payload?.error || "No data"}</div>`;
    visibleCountEl.textContent = "0";
    hiddenCountEl.textContent  = "0";
    lastUpdatedEl.textContent  = "";
    return;
  }

  const names = Array.isArray(payload.names) ? payload.names : [];
  const filters = filterList.map(x => x.toLowerCase());
  const showOnlyFiltered = !!showFilteredOnlyEl?.checked;

  const matchedSet = new Set(computeFiltered(names, filters, exactMatch));
  const listToShow = (showOnlyFiltered && filters.length) ? Array.from(matchedSet) : names;

  visibleCountEl.textContent = String(names.length);
  hiddenCountEl.textContent  = String(payload.hidden ?? 0);
  lastUpdatedEl.textContent  = `Updated ${formatTime(payload.ts)}`;

  playersList.innerHTML = listToShow.length
    ? listToShow.map(n =>
        `<span class="chip${(filters.length && matchedSet.has(n)) ? " hit" : ""}">${esc(n)}</span>`
      ).join("")
    : `<div class="empty">No players</div>`;

  const servers = payload.servers || [];
  serversList.innerHTML = servers.map(s => {
    const addr = `${esc(s.address)}:${s.port}`;
    const tooMany = (s.playerCount ?? 0) > 45 ? "overcap" : "";
    return `<div class="chip ${tooMany}">${esc(s.name)} — ${addr} — players ${s.playerCount ?? 0}</div>`;
  }).join("") || `<div class="empty">No servers</div>`;
}

function handlePlayersUpdate(payload){
  if (payload && payload.ok) {
    const filters = filterList.map(x => x.toLowerCase());
    const names = payload.names || [];
    const filtered = computeFiltered(names, filters, exactMatch);
    const nowFilteredSet = new Set(filtered);

    if (filters.length && seenFirstLive) {
      let newcomer = false;
      for (const n of nowFilteredSet) if (!prevFilteredSet.has(n)) { newcomer = true; break; }
      if (newcomer) dingEl?.play?.().catch(()=>{});
    }
    prevFilteredSet = nowFilteredSet;
    seenFirstLive = true;
  }
  lastLivePayload = payload;
  renderLive(lastLivePayload);
}
window.api.onPlayersUpdate(handlePlayersUpdate);
showFilteredOnlyEl?.addEventListener("change", () => { if (lastLivePayload) renderLive(lastLivePayload); });

/* ------------------------------ Auth + Poll ------------------------------ */
(async function initAuth(){
  try {
    const a = await window.api.authGet();
    if (a?.userSession) userSessionEl.value = a.userSession;
  } catch (e) { console.error(e); }
})();
saveTokenBtn?.addEventListener("click", async () => {
  const token = userSessionEl.value.trim();
  await window.api.authSet(token);
  liveStatusEl.textContent = "Saved token. Polling…";
  setTimeout(() => liveStatusEl.textContent = "", 2000);
});
pollNowBtn?.addEventListener("click", async () => {
  liveStatusEl.textContent = "Polling…";
  await window.api.pollNow();
  setTimeout(() => liveStatusEl.textContent = "", 1500);
});

