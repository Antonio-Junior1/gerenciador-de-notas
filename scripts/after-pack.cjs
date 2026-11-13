const { cp, rm } = require("node:fs/promises");
const path = require("node:path");

/**
 * Copies the flattened Next.js standalone server into `resources/srv` before
 * electron-builder packs the Windows installer, keeping paths short under Windows MAX_PATH
 * and preserving `node_modules` without extraResources glob filtering.
 */
module.exports = async function afterPack(context) {
  const root = process.cwd();
  const standaloneDir = path.join(root, ".next", "standalone");
  const targetSrvDir = path.join(context.appOutDir, "resources", "srv");

  await rm(targetSrvDir, { recursive: true, force: true });
  await cp(standaloneDir, targetSrvDir, { recursive: true, force: true });
  await rm(path.join(targetSrvDir, ".local-data"), { recursive: true, force: true });

  for (const linuxPkg of [
    "@img+sharp-linux-x64@0.35.3",
    "@img+sharp-libvips-linux-x64@1.3.2",
  ]) {
    await rm(path.join(targetSrvDir, "node_modules", ".pnpm", linuxPkg), {
      recursive: true,
      force: true,
    });
  }
};
