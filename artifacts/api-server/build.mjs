import {codeFingerprint} from "../../scripts/lib/code-fingerprint.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { cp, rm } from "node:fs/promises";
import { existsSync,readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts"),path.resolve(artifactDir,"src/event-hub-lookup-cli.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // connect-pg-simple reads this sibling SQL file when creating its session table.
  // esbuild bundles its JS but does not copy filesystem assets automatically.
  await cp(
    path.join(path.dirname(globalThis.require.resolve('connect-pg-simple')), 'table.sql'),
    path.join(distDir, 'table.sql'),
  );

  await cp(
    path.join(artifactDir,"migrations/20261027_event_hub.sql"),
    path.join(distDir,"event-hub-schema.sql"),
  );

  const repoRoot=path.resolve(artifactDir,"../..");
  let sourceVersion="UNKNOWN";
  try{
    const sha=execFileSync("git",["rev-parse","HEAD"],{cwd:repoRoot,encoding:"utf8"}).trim();
    const dirty=execFileSync("git",["status","--porcelain","--untracked-files=normal"],{cwd:repoRoot,encoding:"utf8"}).trim();
    sourceVersion=sha;
    if(dirty){const hash=createHash("sha256");hash.update(execFileSync("git",["diff","HEAD","--binary"],{cwd:repoRoot}));for(const f of execFileSync("git",["ls-files","--others","--exclude-standard","artifacts/api-server/src","artifacts/boltnew-app/src","lib/api-zod/src","scripts"],{cwd:repoRoot,encoding:"utf8"}).trim().split("\n").filter(Boolean)){hash.update(f);hash.update(readFileSync(path.join(repoRoot,f)));}sourceVersion+=`-dirty-${hash.digest("hex").slice(0,12)}`;}
  }catch{/* No verified version => historical results only. */}
  await writeFile(path.join(distDir,"build-identity.json"),JSON.stringify({sourceVersion,codeFingerprint:(()=>{try{return codeFingerprint(repoRoot);}catch{return undefined;}})(),builtAt:new Date().toISOString()}));
  await cp(path.join(artifactDir,"../../docs/EVENT_HUB_V6_VERIFICATION_HISTORY.json"),path.join(distDir,"verification-history.json"));

  const frontendDist = path.resolve(artifactDir, "../boltnew-app/dist/public");
  const publicDir = path.resolve(distDir, "public");
  if (existsSync(path.join(frontendDist, "index.html"))) {
    await cp(frontendDist, publicDir, { recursive: true, force: true });
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
