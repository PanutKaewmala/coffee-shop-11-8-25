import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync("src/app/pos/POSClient.tsx", "utf8");

function extractBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Missing end marker after ${startNeedle}: ${endNeedle}`);
  return text.slice(start, end);
}

function assertNotIncludes(haystack, needle, message) {
  assert.equal(haystack.includes(needle), false, message);
}

function extractButtonContaining(text, visibleText) {
  const normalizedVisibleText = visibleText.replace(/\s+/g, " ").trim();
  const matches = (text.match(/<button\b[\s\S]*?<\/button>/g) ?? []).filter(
    (button) =>
      button.replace(/\s+/g, " ").includes(normalizedVisibleText),
  );

  assert.equal(
    matches.length,
    1,
    `Expected exactly one button containing: ${visibleText}`,
  );
  return matches[0];
}

const desktopCard = extractBetween(
  source,
  'title="เลือกอุณหภูมิและความหวาน แล้วกด + เพิ่ม"',
  '{configuredMenu && portalTarget ? createPortal',
);
const variantButton = extractBetween(
  desktopCard,
  'variants.map((variant) => {',
  'ระดับความหวาน',
);
const sweetnessButton = extractBetween(
  desktopCard,
  'SWEETNESS_OPTIONS.map((option) => {',
  'ตัวเลือกปัจจุบัน',
);
const desktopAddButton = extractButtonContaining(desktopCard, "+ เพิ่ม");
const mobileConfigurator = extractBetween(
  source,
  'id="mobile-configurator-title"',
  '{mobileCartOpen && portalTarget',
);
const mobileAddButton = extractButtonContaining(
  mobileConfigurator,
  "เพิ่มลงตะกร้า",
);
const mobileOptions = extractBetween(
  mobileConfigurator,
  '<fieldset>',
  mobileAddButton,
);
const keyboardShortcut = extractBetween(
  source,
  '/* -------------------- KEYBOARD SHORTCUTS -------------------- */',
  'async function checkout()',
);

assertNotIncludes(desktopCard.slice(0, 500), 'onClick={() => addToCart(item)}', 'Desktop card container must not add to cart when blank card space is clicked.');
assertNotIncludes(variantButton, 'addVariantToCart(', 'Desktop variant selection must not call cart-add function.');
assert(variantButton.includes('setVariantPick('), 'Desktop variant selection should update variantPick.');
assertNotIncludes(sweetnessButton, 'addToCart(', 'Desktop sweetness selection must not call addToCart.');
assertNotIncludes(sweetnessButton, 'addVariantToCart(', 'Desktop sweetness selection must not call addVariantToCart.');
assert(sweetnessButton.includes('setSweetnessPick('), 'Desktop sweetness selection should update sweetnessPick.');
assert.equal((desktopAddButton.match(/addToCart\(item\)/g) ?? []).length, 1, 'Desktop + เพิ่ม button should call addToCart(item) once.');
assertNotIncludes(source, 'เลือกและเพิ่มลงตะกร้า', 'Temperature copy/aria-label must not say select and add to cart.');
assertNotIncludes(source, 'ปุ่มอุณหภูมิจะเลือกและเพิ่มทันที', 'Temperature helper copy must not say temperature buttons add immediately.');
assert(source.includes('เลือกอุณหภูมิและความหวาน แล้วกด “+ เพิ่ม” เพื่อนำลงตะกร้า'), 'Desktop helper copy should instruct explicit add.');
assertNotIncludes(mobileOptions, 'addToCart(', 'Mobile variant/sweetness options must not add to cart.');
assert.equal((mobileAddButton.match(/addToCart\(configuredMenu\)/g) ?? []).length, 1, 'Mobile เพิ่มลงตะกร้า button should call addToCart(configuredMenu) once.');
assert(mobileAddButton.includes('mobileAddLockRef.current'), 'Mobile rapid tap protection should remain on add button.');
assert(source.includes('const checkoutRef = useRef<() => void>(() => {});'), 'POS must keep a ref for the latest checkout closure.');
assert(source.includes('checkoutRef.current = checkout;'), 'POS must refresh the checkout ref from current render state.');
assert(keyboardShortcut.includes('void checkoutRef.current();'), 'Enter shortcut must invoke the latest checkout closure.');
assertNotIncludes(keyboardShortcut, 'void checkout();', 'Enter shortcut must not call a stale checkout closure directly.');

// Execute the actual checkout closure with deterministic transport/storage boundaries.
// This reproduces a committed checkout whose response is lost, then retried.
const checkoutCode = extractBetween(source, "    async function checkout() {", "  const receiptShopName =");
const storageCode = extractBetween(source, "function pendingCheckoutStorageKey(", "type ReceiptItem =");
const compiled = ts.transpileModule(`${storageCode}\n${checkoutCode}\nreturn { checkout, readPendingCheckout };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const cartFixture = [{ id: "line", variant_id: "variant", qty: 2, price: 50, menu_name: "Latte", sweetness: "100%" }];
let keyCounter = 0;
function checkoutHarness(saved = null, sharedStorage = new Map()) {
  const result = { pending: saved, receipt: null, cart: [...cartFixture], requests: [], alerts: [], loading: false };
  const pendingCheckoutRef = { current: saved };
  const state = {
    checkoutInFlightRef: { current: false }, pendingCheckoutRef, pendingReady: true,
    context: { shopId: "shop", branchId: "branch" }, cart: result.cart,
    isBusinessDayClosed: false, paymentMethod: "cash", paidAmount: "100", total: 100,
    parseNumberInput: Number, normalizeSweetness: (value) => value,
    generateIdempotencyKey: () => `checkout-key-${++keyCounter}`,
    sessionStorage: {
      setItem: (key, value) => sharedStorage.set(key, value),
      removeItem: (key) => sharedStorage.delete(key),
    },
    setPendingCheckout: (value) => { result.pending = value; },
    setPendingStorageError: (value) => { result.storageError = value; },
    setLoading: (value) => { result.loading = value; },
    setReceiptData: (value) => { result.receipt = value; },
    setCart: (value) => { result.cart = value; },
    setPaidAmount: () => {}, setMobileCartOpen: () => {},
    isRecord: (value) => typeof value === "object" && value !== null,
    toNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    alert: (message) => result.alerts.push(message),
    console: { error: () => {} },
    fetch: async (url, options) => {
      result.requests.push({ url, ...options });
      return result.transport();
    },
  };
  const functions = new Function(...Object.keys(state), compiled)(...Object.values(state));
  return { ...functions, result, state, sharedStorage };
}
const successResponse = () => ({ ok: true, status: 200, json: async () => ({ success: true, order: {
  id: "original-order", items: [{ name: "Stored Latte", variant_label: "Iced", price: 45, qty: 2 }],
  total: 90, paid_amount: 100, change_amount: 10, created_at: "2026-09-10T00:00:00Z", payment_method: "cash",
} }) });
const first = checkoutHarness();
let release;
first.result.transport = () => new Promise((resolve) => { release = resolve; });
const initialRequest = first.checkout();
await first.checkout();
assert.equal(first.result.requests.length, 1, "synchronous double submit sends one request");
assert.equal(first.sharedStorage.size, 1, "pending checkout is persisted before the response");
release({ ok: false, status: 502, json: async () => ({ error: "Transport failed" }) });
await initialRequest;
const firstRequest = first.result.requests[0];
assert.ok(first.result.pending, "5xx keeps the original checkout pending");
const saved = first.readPendingCheckout([...first.sharedStorage.values()][0], "shop", "branch");
assert.throws(() => first.readPendingCheckout([...first.sharedStorage.values()][0], "shop", "other"), /Invalid saved checkout/, "pending checkout cannot move to another branch");
const reloaded = checkoutHarness(saved, first.sharedStorage);
reloaded.result.transport = successResponse;
await reloaded.checkout();
assert.equal(reloaded.result.requests[0].headers["Idempotency-Key"], firstRequest.headers["Idempotency-Key"], "reload retry preserves key");
assert.equal(reloaded.result.requests[0].body, firstRequest.body, "reload retry preserves the exact payload");
assert.equal(reloaded.sharedStorage.size, 0, "confirmed success clears saved pending state");
assert.equal(reloaded.result.receipt.orderId, "original-order");
assert.equal(reloaded.result.receipt.total, 90, "receipt uses the server's historical total");
assert.equal(reloaded.result.receipt.items[0].name, "Stored Latte", "receipt uses stored sale names");
assert.equal(reloaded.result.receipt.changeAmount, 10);
const networkFailure = checkoutHarness();
networkFailure.result.transport = () => { throw new Error("Response lost"); };
await networkFailure.checkout();
const networkKey = networkFailure.result.requests[0].headers["Idempotency-Key"];
networkFailure.result.transport = successResponse;
await networkFailure.checkout();
assert.equal(networkFailure.result.requests[1].headers["Idempotency-Key"], networkKey, "network-loss retry preserves key");
const rejected = checkoutHarness();
rejected.result.transport = () => ({ ok: false, status: 400, json: async () => ({ code: "NO_RECIPE", error: "Recipe required" }) });
await rejected.checkout();
assert.equal(rejected.result.pending, null, "confirmed rollback unlocks cart for correction");
assert.equal(rejected.sharedStorage.size, 0);
assert.equal(rejected.result.cart.length, 1, "rejected checkout preserves cart");

console.log('POS interaction behavior checks passed, including uncertain retry and reload recovery.');
