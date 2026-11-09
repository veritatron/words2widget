// Syntax and rule checks for all Scriptable scripts.
// Usage: node scripts/check.mjs [repo-root]

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INSTALLER_SCRIPT = join("scriptable", "Widget Installer.js");
const INSTALLER_PAGE = "INSTALLER.md";
const INSTALLER_PAGE_CODE_BLOCK = /^````[^\n]*\n([\s\S]*?)^````$/m;

const FORBIDDEN_IN_ALL_SCRIPTS = [
  "fetch",
  "document",
  "window",
  "require",
  "localStorage",
  "sessionStorage",
  "navigator",
  "XMLHttpRequest",
  "import",
  "export",
];

// The installer must never execute received code or download anything.
const FORBIDDEN_IN_INSTALLER = ["eval", "Function", "importModule", "Request"];

// --- Masking comments, strings and regex literals ---

const REGEX_PRECEDING_KEYWORDS = new Set([
  "await", "case", "delete", "do", "else", "in", "instanceof", "new", "of", "return", "throw", "typeof", "void", "yield",
]);
const DIVISION_PRECEDING_TOKENS = new Set([")", "]", "}"]);
const LITERAL_TOKEN = "literal";

const isWordCharacter = (character) => character !== undefined && /[\w$]/.test(character);

/**
 * Replaces comments, strings and regex literals with spaces, so rules only see real code.
 * Code inside template literal `${...}` is kept. Offsets and line numbers stay the same.
 * Expects syntactically valid JavaScript.
 */
class CodeMasker {
  constructor(source) {
    this.source = source;
    this.output = source.split("");
    this.position = 0;
    this.braceDepth = 0;
    this.templateBraceDepths = [];
    this.lastToken = "";
  }

  mask() {
    while (this.hasMore()) this.maskNextToken();
    return this.output.join("");
  }

  maskNextToken() {
    const character = this.current();
    const next = this.source[this.position + 1];

    if (character === "/" && next === "/") this.maskLineComment();
    else if (character === "/" && next === "*") this.maskBlockComment();
    else if (character === '"' || character === "'") this.maskString(character);
    else if (character === "`") this.maskTemplateStart();
    else if (character === "/" && this.regexCanStart()) this.maskRegex();
    else if (character === "}" && this.closesTemplateExpression()) this.maskTemplateResume();
    else this.keepCodeCharacter(character);
  }

  hasMore() {
    return this.position < this.source.length;
  }

  current() {
    return this.source[this.position];
  }

  blank(count = 1) {
    for (let i = 0; i < count && this.hasMore(); i++) {
      if (this.current() !== "\n") this.output[this.position] = " ";
      this.position++;
    }
  }

  maskLineComment() {
    while (this.hasMore() && this.current() !== "\n") this.blank();
  }

  maskBlockComment() {
    const end = this.source.indexOf("*/", this.position + 2);
    const stop = end === -1 ? this.source.length : end + 2;
    this.blank(stop - this.position);
  }

  maskString(quote) {
    this.blank();
    while (this.hasMore() && this.current() !== quote) {
      this.blank(this.current() === "\\" ? 2 : 1);
    }
    this.blank();
    this.lastToken = LITERAL_TOKEN;
  }

  maskTemplateStart() {
    this.blank();
    this.maskTemplateText();
  }

  maskTemplateResume() {
    this.templateBraceDepths.pop();
    this.blank();
    this.maskTemplateText();
  }

  maskTemplateText() {
    while (this.hasMore()) {
      const character = this.current();
      if (character === "`") {
        this.blank();
        this.lastToken = LITERAL_TOKEN;
        return;
      }
      if (character === "$" && this.source[this.position + 1] === "{") {
        this.blank(2);
        this.templateBraceDepths.push(this.braceDepth);
        this.lastToken = "{";
        return;
      }
      this.blank(character === "\\" ? 2 : 1);
    }
  }

  closesTemplateExpression() {
    return this.templateBraceDepths.at(-1) === this.braceDepth;
  }

  regexCanStart() {
    if (this.lastToken === "") return true;
    if (isWordCharacter(this.lastToken[0])) return REGEX_PRECEDING_KEYWORDS.has(this.lastToken);
    return !DIVISION_PRECEDING_TOKENS.has(this.lastToken);
  }

  maskRegex() {
    let inCharacterClass = false;
    this.blank();
    while (this.hasMore() && this.current() !== "\n") {
      const character = this.current();
      if (character === "/" && !inCharacterClass) break;
      if (character === "[") inCharacterClass = true;
      if (character === "]") inCharacterClass = false;
      this.blank(character === "\\" ? 2 : 1);
    }
    this.blank();
    while (isWordCharacter(this.current())) this.blank();
    this.lastToken = LITERAL_TOKEN;
  }

  keepCodeCharacter(character) {
    if (character === "{") this.braceDepth++;
    if (character === "}") this.braceDepth--;
    if (!/\s/.test(character)) this.updateLastToken(character);
    this.position++;
  }

  updateLastToken(character) {
    const continuesWord = isWordCharacter(character) && isWordCharacter(this.source[this.position - 1]);
    this.lastToken = continuesWord ? this.lastToken + character : character;
  }
}

// --- Rules: each takes { source, code } and returns a list of problems ---

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function forbid(names) {
  const pattern = new RegExp(`(?<![\\w$.])(?:globalThis\\s*\\.\\s*)?(${names.join("|")})(?![\\w$])`, "g");
  return ({ code }) =>
    [...code.matchAll(pattern)].map((match) => `line ${lineOf(code, match.index)}: Forbidden: "${match[1]}"`);
}

function requireCode(pattern, problem) {
  return ({ code }) => (pattern.test(code) ? [] : [problem]);
}

function requireMetadataHeader({ source }) {
  const lines = source.replace(/^﻿/, "").split(/\r?\n/);
  const firstCodeLine = lines.findIndex((line) => !line.startsWith("//"));
  const header = lines.slice(0, firstCodeLine === -1 ? lines.length : firstCodeLine).join("\n");
  const isValid = /\bicon-color:\s*[\w-]+/.test(header) && /\bicon-glyph:\s*[\w.-]+/.test(header);
  return isValid ? [] : ["Missing Scriptable metadata header (icon-color, icon-glyph) at the top of the file"];
}

const ALL_SCRIPT_RULES = [
  forbid(FORBIDDEN_IN_ALL_SCRIPTS),
  requireMetadataHeader,
  requireCode(/\bScript\s*\.\s*complete\s*\(/, "Missing Script.complete()"),
];

const SCRIPT_KINDS = [
  {
    directory: "scriptable",
    rules: [...ALL_SCRIPT_RULES, forbid(FORBIDDEN_IN_INSTALLER)],
  },
  {
    directory: "examples",
    rules: [
      ...ALL_SCRIPT_RULES,
      requireCode(/\bScript\s*\.\s*setWidget\s*\(/, "Missing Script.setWidget()"),
      requireCode(/\bconst\s+CONFIG\s*=\s*\{[^}]*\btitle\s*:/, "Missing CONFIG block with a title"),
      requireCode(/\.\s*refreshAfterDate\s*=/, "Missing refreshAfterDate"),
    ],
  },
];

// --- Running the checks ---

function findSyntaxError(source) {
  const directory = mkdtempSync(join(tmpdir(), "words2widget-check-"));
  try {
    const file = join(directory, "script.mjs");
    writeFileSync(file, source);
    const { status, stderr } = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (status === 0) return null;
    const line = stderr.match(/script\.mjs:(\d+)/)?.[1];
    const message = stderr.match(/^\w*Error: .*$/m)?.[0] ?? "Could not parse the file.";
    return line ? `line ${line}: ${message}` : message;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function checkFile(path, rules) {
  const source = readFileSync(path, "utf8");
  const syntaxError = findSyntaxError(source);
  if (syntaxError) return [`Syntax error, ${syntaxError}`];

  const code = new CodeMasker(source).mask();
  return rules.flatMap((rule) => rule({ source, code }));
}

function findScripts(root) {
  return SCRIPT_KINDS.flatMap(({ directory, rules }) => {
    const path = join(root, directory);
    if (!existsSync(path)) return [];
    return readdirSync(path, { recursive: true })
      .filter((file) => file.endsWith(".js"))
      .sort()
      .map((file) => ({ path: join(path, file), rules }));
  });
}

function checkInstallerPage(root) {
  const scriptPath = join(root, INSTALLER_SCRIPT);
  const pagePath = join(root, INSTALLER_PAGE);
  if (!existsSync(scriptPath) || !existsSync(pagePath)) return [];

  const normalize = (text) => text.replace(/\r\n/g, "\n").trim();
  const pageCode = normalize(readFileSync(pagePath, "utf8")).match(INSTALLER_PAGE_CODE_BLOCK)?.[1] ?? "";
  const isInSync = normalize(pageCode) === normalize(readFileSync(scriptPath, "utf8"));
  return isInSync ? [] : [`Code differs from ${INSTALLER_SCRIPT}`];
}

function reportFile(name, problems) {
  if (problems.length === 0) {
    console.log(`ok    ${name}`);
    return;
  }
  console.error(`FAIL  ${name}`);
  problems.forEach((problem) => console.error(`      ${problem}`));
}

function main() {
  const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const root = resolve(process.argv[2] ?? defaultRoot);
  const scripts = findScripts(root);

  if (scripts.length === 0) {
    const directories = SCRIPT_KINDS.map(({ directory }) => `${directory}/`).join(" or ");
    console.error(`No scripts found in ${directories}.`);
    return 1;
  }

  let failedCount = 0;
  for (const { path, rules } of scripts) {
    const problems = checkFile(path, rules);
    reportFile(relative(root, path), problems);
    if (problems.length > 0) failedCount++;
  }

  const pageProblems = checkInstallerPage(root);
  if (pageProblems.length > 0) reportFile(INSTALLER_PAGE, pageProblems);

  console.log(`\n${scripts.length - failedCount} of ${scripts.length} scripts passed.`);
  return failedCount === 0 && pageProblems.length === 0 ? 0 : 1;
}

process.exitCode = main();
