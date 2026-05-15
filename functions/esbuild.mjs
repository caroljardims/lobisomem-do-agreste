import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [join(dir, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: join(dir, "lib/index.js"),
  logLevel: "info",
  sourcemap: true,
  /** Pacote local não existe no Cloud Build — precisa ir inline no bundle. */
  packages: "bundle",
  external: [
    "firebase-admin",
    "firebase-admin/app",
    "firebase-admin/firestore",
    "firebase-functions",
    "firebase-functions/v1",
    "firebase-functions/v2",
    "firebase-functions/v2/https",
    "firebase-functions/v2/scheduler",
    "firebase-functions/v2/tasks",
    "firebase-functions/logger",
  ],
});
