// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: magic; share-sheet-inputs: file-url, plain-text;

// Saves widget code from the share sheet or clipboard as a new Scriptable script.
// The received code is only saved. It is never executed.

const DEFAULT_SCRIPT_NAME = "My Widget";
const CODE_START_MARKERS = ["// Variables used by Scriptable", "// icon-color:", "const CONFIG"];
const CODE_END_MARKER = "Script.complete();";
const FENCED_CODE_BLOCK = /^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gm;
const CONFIG_TITLE = /\bconst\s+CONFIG\s*=\s*\{[^}]*?\btitle\s*:\s*(["'`])((?:(?!\1).)*)\1/;
const HEADER_COMMENT_NAME = /^\/\/\s*(?:Name|Title|Widget):\s*(.+)$/im;
const INVALID_FILE_NAME_CHARACTERS = /[\/\\:*?"<>|]/g;

// --- Reading the input ---

function readSharedFile(fileURL) {
  try {
    const path = decodeURIComponent(fileURL.replace(/^file:\/\//, ""));
    return FileManager.local().readString(path);
  } catch {
    return null;
  }
}

function readClipboard() {
  const content = Pasteboard.paste();
  return typeof content === "string" ? content : "";
}

// The clipboard is only used without shared input, so old clipboard content is never saved by accident.
function readInputs() {
  const sharedInputs = [...args.fileURLs.map(readSharedFile), ...args.plainTexts].filter(Boolean);
  return sharedInputs.length > 0 ? sharedInputs : [readClipboard()];
}

// --- Extracting the code ---

function isWidgetScript(code) {
  return code.includes("ListWidget") && code.includes("Script.setWidget");
}

function fencedCodeBlocks(text) {
  return [...text.matchAll(FENCED_CODE_BLOCK)].map((match) => match[1]);
}

function unfencedCode(text) {
  const starts = CODE_START_MARKERS.map((marker) => text.indexOf(marker)).filter((index) => index >= 0);
  const end = text.lastIndexOf(CODE_END_MARKER);
  if (starts.length === 0 || end === -1) return "";

  return text.slice(Math.min(...starts), end + CODE_END_MARKER.length);
}

function extractWidgetCode(text) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const candidates = [...fencedCodeBlocks(normalizedText), unfencedCode(normalizedText)];
  return candidates.find(isWidgetScript)?.trim() ?? null;
}

function findWidgetCode(inputs) {
  for (const input of inputs) {
    const code = extractWidgetCode(input);
    if (code) return code;
  }
  return null;
}

// --- Naming the script ---

function cleanScriptName(name) {
  return name
    .replace(INVALID_FILE_NAME_CHARACTERS, "")
    .replace(/\.js$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+/, "")
    .trim();
}

function suggestScriptName(code) {
  const name = code.match(CONFIG_TITLE)?.[2] ?? code.match(HEADER_COMMENT_NAME)?.[1] ?? "";
  return cleanScriptName(name) || DEFAULT_SCRIPT_NAME;
}

// --- Saving the script ---

// Prefers iCloud and falls back to local storage if iCloud is not available.
function chooseFileManager() {
  try {
    const iCloud = FileManager.iCloud();
    iCloud.documentsDirectory();
    return iCloud;
  } catch {
    return FileManager.local();
  }
}

function scriptPath(fileManager, name) {
  return fileManager.joinPath(fileManager.documentsDirectory(), `${name}.js`);
}

// --- Dialogs ---

async function showMessage(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  await alert.presentAlert();
}

async function askForName(suggestedName) {
  const alert = new Alert();
  alert.title = "Name your widget";
  alert.message = "This is how the script will appear in Scriptable.";
  alert.addTextField("Widget name", suggestedName);
  alert.addAction("Save");
  alert.addCancelAction("Cancel");

  const choice = await alert.presentAlert();
  return choice === -1 ? null : cleanScriptName(alert.textFieldValue(0));
}

async function confirmReplace(name) {
  const alert = new Alert();
  alert.title = `"${name}" already exists`;
  alert.message = "Replacing it permanently overwrites the existing script.";
  alert.addDestructiveAction("Replace");
  alert.addAction("Choose Another Name");
  alert.addCancelAction("Cancel");

  const actions = { 0: "replace", 1: "rename", [-1]: "cancel" };
  return actions[await alert.presentAlert()];
}

async function chooseScriptName(fileManager, suggestedName) {
  let suggestion = suggestedName;

  while (true) {
    const name = await askForName(suggestion);
    if (name === null) return null;
    if (name === "") continue;
    if (!fileManager.fileExists(scriptPath(fileManager, name))) return name;

    const decision = await confirmReplace(name);
    if (decision === "replace") return name;
    if (decision === "cancel") return null;
    suggestion = name;
  }
}

function showNoWidgetFound() {
  return showMessage(
    "No widget found",
    "Share the full answer from your AI with this script, or copy the code and run this script again."
  );
}

function showInstructions(name) {
  return showMessage(
    `"${name}" is ready`,
    [
      "To add it to your home screen:",
      "1. Touch and hold the home screen, then tap Edit and Add Widget.",
      "2. Search for Scriptable, pick a size and add it.",
      `3. Tap the new widget and choose "${name}" as the script.`,
    ].join("\n")
  );
}

// --- Run ---

async function installWidget() {
  const code = findWidgetCode(readInputs());
  if (!code) {
    await showNoWidgetFound();
    return;
  }

  const fileManager = chooseFileManager();
  const name = await chooseScriptName(fileManager, suggestScriptName(code));
  if (name === null) return;

  fileManager.writeString(scriptPath(fileManager, name), `${code}\n`);
  await showInstructions(name);
}

try {
  await installWidget();
} catch (error) {
  await showMessage("Couldn't save the widget", error.message);
}

Script.complete();
