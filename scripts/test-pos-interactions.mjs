import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

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

console.log('POS interaction behavior checks passed.');
