import { defineConfig, type Plugin } from "vite";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const ASSETS_ROOT = resolve(CLIENT_ROOT, "../../assets");
const MOUNT = "/game-assets";

const ALLOWED = [
  /^manifest\.json$/,
  /^palette\.(json|png)$/,
  /^catalog\.public\.json$/,
  /^atlases\/[\w.-]+\.(png|json|xml)$/,
  /^backgrounds\/[\w.-]+\.png$/,
  /^audio\/[\w.-]+\.wav$/,
];

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".wav": "audio/wav",
};

/** Files referenced by assets/manifest.json. The private catalog.json is
 *  deliberately *not* referenced, so it can never reach dist/. */
function referencedFiles(): Set<string> {
  const manifest = JSON.parse(readFileSync(join(ASSETS_ROOT, "manifest.json"), "utf8"));
  const files = new Set<string>(["manifest.json"]);
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      if (/\.(png|json|wav|xml)$/.test(node) && !node.includes("..")) files.add(node.replace(/^\//, ""));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") Object.values(node).forEach(visit);
  };
  visit(manifest);
  files.add("catalog.public.json");
  return files;
}

function trasteroAssets(): Plugin {
  let files = new Set<string>();

  return {
    name: "trastero-assets",
    configResolved() {
      files = referencedFiles();
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith(`${MOUNT}/`)) return next();
        const rel = decodeURIComponent(url.slice(MOUNT.length + 1));
        if (!ALLOWED.some((pattern) => pattern.test(rel))) {
          res.statusCode = 404;
          res.end("asset not allowed");
          return;
        }
        const file = join(ASSETS_ROOT, rel);
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("asset not found");
          return;
        }
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = join(CLIENT_ROOT, "dist", MOUNT.slice(1));
      for (const rel of files) {
        const target = join(out, rel);
        mkdirSync(join(target, ".."), { recursive: true });
        cpSync(join(ASSETS_ROOT, rel), target);
      }
    },
  };
}

export default defineConfig({
  plugins: [trasteroAssets()],
  server: {
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://localhost:2567",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
