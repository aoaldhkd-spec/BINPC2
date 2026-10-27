import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, lstatSync, readlinkSync } from "node:fs";
import path from "node:path";
// Evidence data/docs are excluded to avoid self-referential attestations; application,
// migrations, static assets, dependency/build/test/CI configuration remain covered.
export const CODE_PATHS = [
  "artifacts/api-server/src",
  "artifacts/api-server/migrations",
  "artifacts/api-server/build.mjs",
  "artifacts/api-server/package.json",
  "artifacts/api-server/tsconfig.json",
  "artifacts/boltnew-app/src",
  "artifacts/boltnew-app/public",
  "artifacts/boltnew-app/tests",
  "artifacts/boltnew-app/vite.config.ts",
  "artifacts/boltnew-app/index.html",
  "artifacts/boltnew-app/package.json",
  "artifacts/boltnew-app/tsconfig.json",
  "lib/api-zod",
  "scripts",
  ".github/workflows/event-hub-integration.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "render.yaml",
  "netlify.toml",
];
export function codeFingerprint(repoRoot, commit) {
  let records;
  if (commit) {
    if (!/^[a-f0-9]{40}$/.test(commit))
      throw Error("An exact commit is required");
    records = execFileSync(
      "git",
      ["ls-tree", "-r", "-z", commit, "--", ...CODE_PATHS],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    )
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const [meta, name] = row.split("\t"),
          [mode, , oid] = meta.split(" ");
        return { name, mode, oid };
      });
  } else {
    const names = [
      ...new Set(
        execFileSync(
          "git",
          [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            ...CODE_PATHS,
          ],
          { cwd: repoRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
        )
          .split("\0")
          .filter(Boolean),
      ),
    ];
    records = names.flatMap((name) => {
      let st;
      const full = path.join(repoRoot, name);
      try {
        st = lstatSync(full);
      } catch {
        return [];
      }
      if (!st.isFile() && !st.isSymbolicLink()) return [];
      const data = st.isSymbolicLink()
        ? Buffer.from(readlinkSync(full))
        : readFileSync(full);
      return [
        {
          name,
          mode: st.isSymbolicLink()
            ? "120000"
            : st.mode & 0o111
              ? "100755"
              : "100644",
          oid: createHash("sha1")
            .update(`blob ${data.length}\0`)
            .update(data)
            .digest("hex"),
        },
      ];
    });
  }
  const h = createHash("sha256");
  for (const r of records.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  ))
    h.update(`${r.name}\0${r.mode}\0${r.oid}\n`);
  return h.digest("hex");
}
