import { writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { homedir, platform } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NM_HOST_NAME = "com.bytenew.vortex";
const EXTENSION_ID = process.argv[2];

if (!EXTENSION_ID) {
  console.error("Usage: install-nm-host <chrome-extension-id>");
  process.exit(1);
}

// __dirname 在编译后指向 dist/scripts/，需要回退两级到 packages/server/
const nativeHostPath = resolve(join(__dirname, "..", "..", "native-host.sh"));

const manifest = {
  name: NM_HOST_NAME,
  description: "Vortex browser automation middleware",
  path: nativeHostPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
};

let nmHostDir: string;
if (platform() === "darwin") {
  nmHostDir = join(homedir(), "Library/Application Support/Google/Chrome/NativeMessagingHosts");
} else {
  nmHostDir = join(homedir(), ".config/google-chrome/NativeMessagingHosts");
}

mkdirSync(nmHostDir, { recursive: true });
const manifestPath = join(nmHostDir, `${NM_HOST_NAME}.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`NM host manifest written to: ${manifestPath}`);
console.log(`NM host script: ${nativeHostPath}`);
