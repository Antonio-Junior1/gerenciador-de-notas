const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = Number(process.env.NOTAS_PORT || 3210);
const LOCAL_DATA_DIR = path.join(app.getPath("userData"), "data");
let serverProcess;

function getServerRoot() {
  if (process.env.NOTAS_DESKTOP_URL) return null;
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", ".next", "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
}

function startServer() {
  const serverRoot = getServerRoot();
  if (!serverRoot) return;
  const serverScript = path.join(serverRoot, "server.js");
  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NOTAS_DATA_DIR: LOCAL_DATA_DIR,
      NODE_ENV: "production",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  serverProcess.on("error", (error) => console.error("Falha ao iniciar servidor local:", error));
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#f5f7f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const target = process.env.NOTAS_DESKTOP_URL || `http://127.0.0.1:${PORT}`;
  await window.loadURL(target);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(target)) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  startServer();
  if (process.env.NOTAS_DESKTOP_URL) {
    setTimeout(createWindow, 300);
  } else {
    setTimeout(createWindow, 700);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
