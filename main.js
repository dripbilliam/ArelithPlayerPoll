// main.js
const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

// ---------- ROOT (portable) ----------
const ROOT_DIR = app.isPackaged ? path.dirname(process.execPath) : __dirname;

// Ensure a directory exists
function mkdirp(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
mkdirp(ROOT_DIR);

// ---------- FILE LOCATIONS (portable) ----------
const SETTINGS_PATH = path.join(ROOT_DIR, "settings.json");              // portable settings

// ---------- SETTINGS ----------
function loadSettings() { try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")); } catch { return {}; } }
function saveSettings(s) {
  try {
    const tmp = SETTINGS_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
    fs.renameSync(tmp, SETTINGS_PATH);
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}
let settings = loadSettings();
if (typeof settings.userSession !== "string") settings.userSession = "";

// ---------- CONSTANTS ----------
const URL = "https://astrolabe.nwnarelith.com/api/portal";
const UA  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const POLL_MS = 30_000;

// Raw fixed cookies (user-session injected separately)
const COOKIE_PREFIX =
  "phpbb3_1qw03_u=8491; phpbb3_1qw03_k=u03of03lxhx4h8b5; phpbb3_1qw03_sid=df5fbb3a074b8a3b9b682a7ec09780e5; cf_clearance=4Wu_gK3PFW6nIs0MMIDmv3fREwjJwUx63qJuvlhLezE-1761446248-1.2.1.1-690EM.03J5gS80x0ZBtYzpxEZersUEig.MyenbkvDvqaY9XnTiLUHoO65Feen3nSGxjFbcqVYgnS44SdXxAlkJw11DIiAVlVpXSHFipdi4aIbRarB9Sv.LbK9xBOYkJ5e3QOjR8QmV0BbgEvE2WFDVRd_p4xIA3cm0acjqpkDmZRloZKz1fLs7gCOZQUHIY37PFxMfFIjVIJitJPpIbDcVPKQ3RB4_cD05ctq9r5uEM;";

let win;
let devMode = false; // Hidden by default



// ---------- FETCH ----------
async function doFetch() {
  const cookie = `${COOKIE_PREFIX} user-session=${settings.userSession || ""}`;
  const res = await fetch(URL, {
    method: "GET",
    headers: {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,en-CA;q=0.8",
      "cookie": cookie,
      "referer": "https://astrolabe.nwnarelith.com/portal",
      "user-agent": UA
    },
    cache: "no-store",
    redirect: "manual"
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Non-JSON response"); }
  return data;
}

async function pollNow() {
  try {
    if (!settings.userSession) {
      if (win && !win.isDestroyed()) {
        win.webContents.send("players-update", { ok: false, error: "Missing user-session. Enter it at the top and press Save." });
      }
      return;
    }
    const data = await doFetch();
    const names = Array.isArray(data.players)
      ? data.players.map(p => (p?.visibleName ?? "")).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
  const payload = { ok: true, names, hidden: data.hidden ?? 0, servers: data.servers ?? [], ts: Date.now() };

  if (win && !win.isDestroyed()) win.webContents.send("players-update", payload);
    console.log(`[poll] ok visible=${names.length} hidden=${payload.hidden}`);
  } catch (err) {
    const payload = { ok: false, error: String(err) };
    if (win && !win.isDestroyed()) win.webContents.send("players-update", payload);
    console.error("[poll] error:", err);
  }
}

// ---------- IPC ----------
ipcMain.handle("auth:get", async () => ({ userSession: settings.userSession || "" }));
ipcMain.handle("auth:set", async (_evt, token) => {
  settings.userSession = String(token || "").trim();
  saveSettings(settings);
  pollNow();    
  return { ok: true };
});
ipcMain.handle("poll:now", async () => { await pollNow(); return { ok: true }; });
ipcMain.handle("dev:is-enabled", () => devMode);

// Test data embedded directly (simulates exact API response)
const testDataBase = {
  "servers": [
    {"id": 1, "name": "Surface", "address": "game.nwnarelith.com", "port": 5123, "playerCount": 38, "state": 8, "startup": 1761414677},
    {"id": 2, "name": "Cordor and Planes", "address": "game.nwnarelith.com", "port": 5122, "playerCount": 50, "state": 8, "startup": 1761414671},
    {"id": 6, "name": "Underdark", "address": "game.nwnarelith.com", "port": 5124, "playerCount": 13, "state": 8, "startup": 1761414674},
    {"id": 8, "name": "Distant Shores", "address": "game.nwnarelith.com", "port": 5121, "playerCount": 64, "state": 8, "startup": 1761414727},
    {"id": 9, "name": "Guldorand", "address": "game.nwnarelith.com", "port": 5125, "playerCount": 25, "state": 8, "startup": 1761414669},
    {"id": 5, "name": "Arelith - PGCC", "address": "arena.arelith.com", "port": 5123, "playerCount": 3, "state": 8, "startup": 1761429674}
  ],
  "players": [
    {"visibleName": " Arête  Mallpockney", "portraitResRef": "/images/portraits/po_boy2_.jpg", "options": 0},
    {"visibleName": "Abigail", "portraitResRef": "/images/portraits/po_hu_f_99_.jpg", "options": 0},
    {"visibleName": "Ada", "portraitResRef": "/images/portraits/po_clswizard_.jpg", "options": 0},
    {"visibleName": "Alastor Briars", "portraitResRef": "https://raw.githubusercontent.com/RegnantPhoenix/playerportraitpack/master/sources/male/po_m_hu251_m.png", "options": 0},
    {"visibleName": "Alen Aestine", "portraitResRef": "/images/portraits/po_clsfight_.jpg", "options": 0},
    {"visibleName": "Araj", "portraitResRef": "/images/portraits/po_clsfighter_.jpg", "options": 16},
    {"visibleName": "Borlin Runewright", "portraitResRef": "/images/portraits/po_clsdwfend_.jpg", "options": 0},
    {"visibleName": "Cosmo Invisi", "portraitResRef": "/images/portraits/po_boy2_.jpg", "options": 0},
    {"visibleName": "Darian Blackhorn", "portraitResRef": "/images/portraits/po_clsbarb_.jpg", "options": 0},
    {"visibleName": "Elias", "portraitResRef": "/images/portraits/po_hu_m_99_.jpg", "options": 0},
    {"visibleName": "Byron Blackstone", "portraitResRef": "/images/portraits/po_hu_m_21_.jpg", "options": 0},
    {"visibleName": "Celsys Wobblespell", "portraitResRef": "/images/portraits/po_clswizard_.jpg", "options": 0},
    {"visibleName": "Flicker", "portraitResRef": "https://raw.githubusercontent.com/RegnantPhoenix/playerportraitpack/master/sources/female/po_f_gn7_m.png", "options": 0},
    {"visibleName": "Ghan", "portraitResRef": "/images/portraits/po_hu_m_99_.jpg", "options": 0},
    {"visibleName": "Iris Cooper", "portraitResRef": "/images/portraits/po_hu_f_99_.jpg", "options": 0},
    {"visibleName": "Kael Varros", "portraitResRef": "https://raw.githubusercontent.com/RegnantPhoenix/playerportraitpack/master/sources/male/po_m_ag2_m.png", "options": 0},
    {"visibleName": "Lemuel", "portraitResRef": "/images/portraits/po_clspalemast_.jpg", "options": 0},
    {"visibleName": "Mogg", "portraitResRef": "/images/portraits/po_gobwiza_.jpg", "options": 0},
    {"visibleName": "Nixara", "portraitResRef": "https://raw.githubusercontent.com/RegnantPhoenix/playerportraitpack/master/sources/female/po_f_tf7_m.png", "options": 0},
    {"visibleName": "Priest", "portraitResRef": "/images/portraits/po_hu_m_99_.jpg", "options": 0}
  ],
  "hidden": 13
};

function generateRandomTestData() {
  // Randomly select 60-80% of the base players
  const playerPool = [...testDataBase.players];
  const numPlayers = Math.floor(playerPool.length * (0.6 + Math.random() * 0.2));
  
  // Shuffle and take random subset
  const shuffled = playerPool.sort(() => Math.random() - 0.5);
  const selectedPlayers = shuffled.slice(0, numPlayers);
  
  // Randomly adjust server player counts
  const servers = testDataBase.servers.map(s => ({
    ...s,
    playerCount: Math.max(0, s.playerCount + Math.floor(Math.random() * 10) - 5)
  }));
  
  return {
    servers,
    players: selectedPlayers,
    hidden: Math.floor(Math.random() * 20) + 5
  };
}

// Handle simulated updates in dev mode
ipcMain.handle("dev:simulate-update", () => {
  if (!devMode) return { ok: false, error: "Dev mode not enabled" };
  
  console.log("[devMode] Simulating player update...");
  const data = generateRandomTestData();
  const names = data.players.map(p => p.visibleName.replace(/\s+/g, " ").trim());
  const payload = { ok: true, names, hidden: data.hidden, servers: data.servers, ts: Date.now() };

  if (win && !win.isDestroyed()) {
    win.webContents.send("players-update", payload);
    console.log(`[devMode] Sent test data: ${names.length} players, ${data.servers.length} servers`);
  } else {
    console.log("[devMode] Window not ready");
  }
  
  return { ok: true };
});

// ---------- WINDOW ----------
async function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1100,
    minHeight: 740,
    title: "Arelith Players",
    alwaysOnTop: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("render-process-gone", (_e, d) => console.error("Renderer crashed:", d));
  win.webContents.on("did-fail-load", (_e, ec, desc) => console.error("did-fail-load:", ec, desc));

  await win.loadFile(path.join(__dirname, "index.html"));

  // Start polling
  pollNow();
  setInterval(pollNow, POLL_MS);


  // Add keybind for dev mode only
  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.key === "D" &&
      input.shift && input.control && input.alt
    ) {
      devMode = true;
      win.webContents.openDevTools({ mode: "detach" });
      console.log("[devMode] Unlocked: DevTools and test functions enabled");
      
      // Create dev menu
      const menu = Menu.buildFromTemplate([
        {
          label: 'Dev',
          submenu: [
            {
              label: 'Simulate Update',
              accelerator: 'CmdOrCtrl+Shift+U',
              click: () => {
                console.log("[devMode] Menu: Simulating player update...");
                const data = generateRandomTestData();
                const names = data.players.map(p => p.visibleName.replace(/\s+/g, " ").trim());
                const payload = { ok: true, names, hidden: data.hidden, servers: data.servers, ts: Date.now() };
                if (win && !win.isDestroyed()) {
                  win.webContents.send("players-update", payload);
                  console.log(`[devMode] Menu sent test data: ${names.length} players, ${data.servers.length} servers`);
                } else {
                  console.log("[devMode] Window not ready");
                }
              }
            },
            { type: 'separator' },
            {
              label: 'Toggle DevTools',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => win.webContents.toggleDevTools()
            }
          ]
        }
      ]);
      Menu.setApplicationMenu(menu);
      
      event.preventDefault();
    } else if (
      devMode &&
      input.type === "keyDown" &&
      input.key === "F9" &&
      input.shift && input.control
    ) {
      console.log("[devMode] Simulating player update...");
      win.webContents.emit("dev:simulate-update");  // Changed from ipcMain to win.webContents
      event.preventDefault();
    }
  });
  
  // Also listen for app-level keyboard events
  app.on("web-contents-created", (e, contents) => {
    contents.on("before-input-event", (event, input) => {
      console.log("[app-input]", input.type, input.key);
    });
  });
}

app.whenReady().then(createWindow).catch(err => {
  console.error("Startup Error:", err);
  dialog.showErrorBox("Startup Error", String(err));
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
