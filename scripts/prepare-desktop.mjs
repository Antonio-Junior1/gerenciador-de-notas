import { cp, lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

async function copyPackage(srcDir, destDir) {
  const resolved = await realpath(srcDir);
  await mkdir(path.dirname(destDir), { recursive: true });
  await cp(resolved, destDir, { recursive: true, dereference: true, force: true });
}

async function collectScopePackages(baseDir) {
  const results = [];
  const entries = await readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(baseDir, entry.name);
    if (entry.name.startsWith("@")) {
      const scopedEntries = await readdir(entryPath, { withFileTypes: true });
      for (const scoped of scopedEntries) {
        results.push({
          name: `${entry.name}/${scoped.name}`,
          fullPath: path.join(entryPath, scoped.name),
        });
      }
    } else {
      results.push({ name: entry.name, fullPath: entryPath });
    }
  }
  return results;
}

async function flattenStandaloneModules(standaloneModules) {
  const pnpmDir = path.join(standaloneModules, ".pnpm");
  let hasPnpm = false;
  try {
    const stat = await lstat(pnpmDir);
    hasPnpm = stat.isDirectory();
  } catch {
    hasPnpm = false;
  }

  if (!hasPnpm) return;

  const hoisted = new Map();
  const topLevel = await collectScopePackages(standaloneModules);
  for (const pkg of topLevel) {
    try {
      const resolved = await realpath(pkg.fullPath);
      hoisted.set(pkg.name, resolved);
    } catch {
      // ignore dangling link
    }
  }

  const pnpmEntries = await readdir(pnpmDir, { withFileTypes: true });
  for (const entry of pnpmEntries) {
    if (!entry.isDirectory()) continue;
    const innerModules = path.join(pnpmDir, entry.name, "node_modules");
    let innerPackages = [];
    try {
      innerPackages = await collectScopePackages(innerModules);
    } catch {
      continue;
    }
    for (const pkg of innerPackages) {
      if (hoisted.has(pkg.name)) continue;
      try {
        const resolved = await realpath(pkg.fullPath);
        hoisted.set(pkg.name, resolved);
      } catch {
        // ignore dangling link
      }
    }
  }

  const stagingDir = `${standaloneModules}.__flat__`;
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  for (const [name, srcPath] of hoisted.entries()) {
    await copyPackage(srcPath, path.join(stagingDir, name));
  }

  await rm(standaloneModules, { recursive: true, force: true });
  await cp(stagingDir, standaloneModules, { recursive: true, force: true });
  await rm(stagingDir, { recursive: true, force: true });
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
await rm(path.join(standalone, ".local-data"), { recursive: true, force: true });
await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true, force: true });
await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true, force: true });

await flattenStandaloneModules(path.join(standalone, "node_modules"));

console.log("Desktop bundle preparado em .next/standalone (dependências achatadas sem symlinks)");
