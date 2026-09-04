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

const refAnchor = '    const idempotencyKeyRef = useRef<string | null>(null);\n';
if (!source.includes(refAnchor)) fail("Could not find idempotencyKeyRef anchor");
source = source.replace(
  refAnchor,
  `${refAnchor}    const checkoutRef = useRef<() => void>(() => {});\n`,
);

const keyboardAnchor = `    /* -------------------- KEYBOARD SHORTCUTS -------------------- */\n    useEffect(() => {\n`;
if (!source.includes(keyboardAnchor)) fail("Could not find keyboard shortcut anchor");
source = source.replace(
  keyboardAnchor,
  `    /* Keep the keyboard shortcut pointed at the latest checkout closure so\n       cash amount, payment method, cart quantity, and other current state are\n       never read from a stale render. */\n    useEffect(() => {\n        checkoutRef.current = checkout;\n    });\n\n${keyboardAnchor}`,
);

const staleCall = "          void checkout();";
if (!source.includes(staleCall)) fail("Could not find Enter shortcut checkout call");
source = source.replace(staleCall, "          void checkoutRef.current();");

fs.writeFileSync(posPath, source);

console.log("TALVO_POS_ENTER_SHORTCUT_FIXED");
console.log("Changed only src/app/pos/POSClient.tsx in the local working tree.");
console.log("Next: let Next.js hot-reload, then repeat exact-cash + Enter in the browser.");
