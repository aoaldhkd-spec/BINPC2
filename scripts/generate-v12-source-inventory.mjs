import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { codeFingerprint } from "./lib/code-fingerprint.mjs";

// A source map is not proof of a click, successful save, or a device test.
const roots = ["artifacts/boltnew-app/src", "artifacts/api-server/src", "lib/api-zod/src"];
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...roots], { encoding: "utf8" }).split("\0").filter(Boolean))]
  .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/(?:\.test\.|\.spec\.|__tests__)/.test(f)).sort();
const entries = [];
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (node, kind, target, handler = "") => entries.push({ id: `UIAPI-${String(entries.length + 1).padStart(4, "0")}`, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, target, handler, executionStatus: "SOURCE_INVENTORY_ONLY", evidence: null });
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const handlers = attrs.filter((a) => /^on[A-Z]/.test(a.name.getText(source)));
      const interactive = /^(button|input|textarea|select|form|a|details|dialog|Route|Link|HubButton|Dialog.*|.*Modal|.*Drawer|.*Tabs?)$/.test(tag);
      if (interactive || handlers.length) {
        const label = attrs.find((a) => /^(aria-label|path|href|to|name|title)$/.test(a.name.getText(source)));
        add(node, tag === "Route" ? "route" : "ui-control", `${tag}${label ? ` ${label.getText(source).slice(0, 160)}` : ""}`, handlers.map((a) => a.getText(source).slice(0, 220)).join("; "));
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (file.includes("api-server") && /^(?:router|app)\.(get|post|put|patch|delete|use)$/.test(callee)) add(node, "api-route", `${callee} ${node.arguments[0]?.getText(source).slice(0, 160) ?? ""}`);
      if (/^(setInterval|setTimeout|cron\.schedule)$/.test(callee)) add(node, "background-or-timer", callee, node.arguments.at(-1)?.getText(source).slice(0, 100));
    }
    if (ts.isCaseClause(node) && /event-(hub|campaign|laboratory)/.test(file)) add(node, "business-action", node.expression.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const out = "docs/v12-validation-20261029";
mkdirSync(out, { recursive: true });
const count = {};
for (const e of entries) count[e.kind] = (count[e.kind] ?? 0) + 1;
writeFileSync(`${out}/source-inventory.json`, JSON.stringify({ codeFingerprint: codeFingerprint(process.cwd()), scope: roots, sourceFiles: files.length, count, caveat: "AST inventory only. Dynamic controls and complete runtime state/role coverage require separate execution. No entry is marked PASS by discovery.", entries }, null, 2) + "\n");
writeFileSync(`${out}/SOURCE_INVENTORY.md`, `# 실제 소스의 화면·서버 작업 목록\n\n${files.length}개 제품 소스에서 ${entries.length}개 연결 지점을 추출했습니다. **목록 작성은 실제 클릭·저장·전수검사 통과가 아닙니다.** 역할/상태별 실행 증거는 REQUIREMENTS.md와 validation.json을 따로 확인합니다. 동적으로 생성되는 메뉴와 모든 상태 조합은 이 정적 목록만으로 완전성을 보장하지 않습니다.\n\n생성: \`node scripts/generate-v12-source-inventory.mjs\`\n\n| 종류 | 수 |\n|---|---:|\n${Object.entries(count).map(([k,v]) => `| ${k} | ${v} |`).join("\n")}\n\n전체 파일·줄·이벤트 핸들러: [source-inventory.json](source-inventory.json). 전체 항목의 실행 상태는 SOURCE_INVENTORY_ONLY로 두며 실제 검사 결과와 혼동하지 않습니다.\n`);
console.log(JSON.stringify({ sourceFiles: files.length, count, output: out }));
