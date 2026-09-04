import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const posPath = path.join(root, "src", "app", "pos", "POSClient.tsx");

function fail(message) {
  console.error(`\nTALVO POS shortcut fix failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(posPath)) fail("src/app/pos/POSClient.tsx is missing");

let source = fs.readFileSync(posPath, "utf8");

if (source.includes("checkoutRef.current()")) {
  console.log("TALVO_POS_ENTER_SHORTCUT_ALREADY_FIXED");
  process.exit(0);
}

// Be tolerant of Windows CRLF and small indentation differences in the local file.
const refPattern = /^(\s*const idempotencyKeyRef = useRef<string \| null>\(null\);)\r?$/m;
const refMatch = source.match(refPattern);
if (!refMatch) fail("Could not find idempotencyKeyRef anchor");
const indent = refMatch[1].match(/^\s*/)?.[0] ?? "    ";
source = source.replace(
  refPattern,
  `${refMatch[1]}\n${indent}const checkoutRef = useRef<() => void>(() => {});`,
);

const keyboardPattern = /^(\s*)\/\* -------------------- KEYBOARD SHORTCUTS -------------------- \*\/\r?\n\s*useEffect\(\(\) => \{/m;
const keyboardMatch = source.match(keyboardPattern);
if (!keyboardMatch) fail("Could not find keyboard shortcut anchor");
const keyboardIndent = keyboardMatch[1] ?? "    ";
source = source.replace(
  keyboardPattern,
  `${keyboardIndent}/* Keep the keyboard shortcut pointed at the latest checkout closure so\n${keyboardIndent}   cash amount, payment method, cart quantity, and other current state are\n${keyboardIndent}   never read from a stale render. */\n${keyboardIndent}useEffect(() => {\n${keyboardIndent}    checkoutRef.current = checkout;\n${keyboardIndent}});\n\n${keyboardIndent}/* -------------------- KEYBOARD SHORTCUTS -------------------- */\n${keyboardIndent}useEffect(() => {`,
);

const staleCallPattern = /void\s+checkout\(\);/;
if (!staleCallPattern.test(source)) fail("Could not find Enter shortcut checkout call");
source = source.replace(staleCallPattern, "void checkoutRef.current();");

fs.writeFileSync(posPath, source);

console.log("TALVO_POS_ENTER_SHORTCUT_FIXED");
console.log("Changed only src/app/pos/POSClient.tsx in the local working tree.");
console.log("Next: let Next.js hot-reload, then repeat exact-cash + Enter in the browser.");
