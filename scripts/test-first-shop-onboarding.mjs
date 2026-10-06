import assert from "node:assert/strict";
import fs from "node:fs";

import {
    firstShopInputError,
    firstShopSlugBase,
    normalizeFirstShopInput,
} from "../src/lib/firstShopOnboarding.mjs";

const login = fs.readFileSync("src/app/login/LoginClient.tsx", "utf8");
const wrapper = fs.readFileSync("src/app/ClientWrapper.tsx", "utf8");
const noAccess = fs.readFileSync("src/app/no-access/page.tsx", "utf8");
const page = fs.readFileSync("src/app/onboarding/page.tsx", "utf8");
const client = fs.readFileSync("src/app/onboarding/FirstShopOnboardingClient.tsx", "utf8");
const route = fs.readFileSync("src/app/api/onboarding/first-shop/route.ts", "utf8");
const signupPage = fs.readFileSync("src/app/signup/page.tsx", "utf8");
const signupClient = fs.readFileSync("src/app/signup/SignupClient.tsx", "utf8");

assert.deepEqual(
    normalizeFirstShopInput({
        shop_name: "  ชงกะชา  ",
        branch_name: "  ธกส. ปาย ",
        address: "  หน้า ธ.ก.ส.  ",
        phone: " 0812345678 ",
    }),
    {
        shopName: "ชงกะชา",
        branchName: "ธกส. ปาย",
        address: "หน้า ธ.ก.ส.",
        phone: "0812345678",
    }
);

assert.equal(firstShopInputError(normalizeFirstShopInput({})), "กรุณาใส่ชื่อร้าน");
assert.equal(firstShopInputError(normalizeFirstShopInput({ shop_name: "ร้าน" })), "กรุณาใส่ชื่อสาขา");
assert.equal(
    firstShopInputError(normalizeFirstShopInput({ shop_name: "ร้าน", branch_name: "หลัก" })),
    "กรุณาใส่ที่อยู่ร้าน"
);
assert.equal(
    firstShopInputError(normalizeFirstShopInput({
        shop_name: "ร้าน",
        branch_name: "หลัก",
        address: "เชียงใหม่",
    })),
    null
);
assert.equal(firstShopSlugBase("Coffee Space"), "coffee-space");
assert.equal(firstShopSlugBase("ชงกะชา"), "shop");

assert.match(login, /pickShop\.mode === "none"[\s\S]*action: "onboarding"[\s\S]*href: "\/onboarding"/);
assert.match(noAccess, /memberships \?\? \[\]\)\.length === 0[\s\S]*redirect\("\/onboarding"\)/);

assert.match(page, /if \(!auth\.user\) redirect\("\/login\?next=\/onboarding"\)/);
assert.match(page, /shop_members/);
assert.match(page, /redirect\("\/api\/context\/resolve\?next=%2Fadmin"\)/);

assert.match(client, /ชื่อร้าน/);
assert.match(client, /ชื่อสาขา/);
assert.match(client, /ที่อยู่ร้าน/);
assert.match(client, /เบอร์โทรร้าน/);
assert.match(client, /\/api\/onboarding\/first-shop/);

assert.match(route, /if \(!auth\.user\) return jsonError\("Unauthorized", 401\)[\s\S]*if \(authError\)/);
assert.match(route, /shop_members[\s\S]*eq\("user_id", auth\.user\.id\)[\s\S]*limit\(1\)/);
assert.match(route, /บัญชีนี้มีร้านอยู่แล้ว/);
assert.match(route, /from\("shops"\)[\s\S]*\.insert/);
assert.match(route, /from\("shop_members"\)\.insert\([\s\S]*role: "owner"/);
assert.match(route, /from\("branch"\)[\s\S]*is_primary: true/);
assert.match(route, /from\("profiles"\)\.upsert/);
assert.match(route, /current_shop_id: shopId/);
assert.match(route, /current_branch_id: branch\.id/);
assert.match(route, /current_shop_id"[\s\S]*current_branch_id"/);
assert.match(route, /clearCreatedShop/);

assert.match(login, /href="\/signup"/);
for (const path of ["/signup", "/onboarding", "/no-access", "/select-branch", "/select-shop"]) {
    assert.match(wrapper, new RegExp(`pathname\\.startsWith\\("${path.replace("/", "\\/")}"\\)`));
}
assert.match(signupPage, /if \(auth\.user\) redirect\("\/onboarding"\)/);
assert.match(signupPage, /SignupClient/);
assert.match(signupClient, /supabase\.auth\.signUp/);
assert.match(signupClient, /password\.length < 8/);
assert.match(signupClient, /password !== confirmPassword/);
assert.match(signupClient, /router\.replace\("\/onboarding"\)/);
assert.match(signupClient, /เช็กอีเมลเพื่อยืนยันบัญชี/);
assert.match(signupClient, /href="\/login\?next=\/onboarding"/);

console.log("first-shop onboarding assertions passed");
