const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.NOTAS_PORT || 3210);
let serverProcess;
let serverExitError = null;

function getLocalDataDir() {
  return process.env.NOTAS_DATA_DIR || path.join(app.getPath("userData"), "data");
}

function getServerRoot() {
  if (process.env.NOTAS_DESKTOP_URL) return null;
  return app.isPackaged
    ? path.join(process.resourcesPath, "srv")
    : path.join(__dirname, "..", ".next", "standalone");
}

function startServer() {
  const serverRoot = getServerRoot();
  if (!serverRoot) return;
  const localDataDir = getLocalDataDir();
  const serverScript = path.join(serverRoot, "server.js");
  serverExitError = null;
  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NOTAS_DATA_DIR: localDataDir,
      NODE_ENV: "production",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  serverProcess.on("error", (error) => {
    serverExitError = error;
    console.error("Falha ao iniciar servidor local:", error);
  });
  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      serverExitError = new Error(`Servidor local encerrou com código ${code}.`);
    }
  });
}

function checkUrlReady(targetUrl) {
  return new Promise((resolve) => {
    const req = http.get(targetUrl, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(targetUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverExitError) throw serverExitError;
    if (await checkUrlReady(targetUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Tempo esgotado aguardando o servidor local em ${targetUrl}.`);
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
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(target)) shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    await waitForServer(`${target}/api/notes`);
    await window.loadURL(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Gerenciador de Notas", `Não foi possível iniciar o servidor local.\n\n${message}`);
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  ipcMain.handle("open-data-dir", async () => {
    const dir = getLocalDataDir();
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
  ipcMain.handle("pick-spreadsheet-save", async () => {
    const result = await dialog.showSaveDialog({
      title: "Conectar planilha Excel (.xlsx)",
      defaultPath: path.join(app.getPath("documents"), "gerenciador-de-notas.xlsx"),
      filters: [{ name: "Planilha Excel", extensions: ["xlsx"] }],
    });
    return result.canceled ? null : result.filePath;
  });
  ipcMain.handle("open-file-path", async (_event, targetPath) => {
    if (typeof targetPath !== "string" || !targetPath.trim()) return "";
    return shell.openPath(targetPath);
  });
  startServer();
  await createWindow();
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
