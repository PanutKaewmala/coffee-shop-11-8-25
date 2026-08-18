import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/talvo-supply-item-staging-validation.yml";
const workflow = readFileSync(workflowPath, "utf8");

assert.ok(
  workflow.includes("checked_table_name text;"),
  "The canonical verifier must use a loop variable that cannot shadow information_schema.columns.table_name",
);
assert.ok(
  workflow.includes("isc.table_schema='public' and isc.table_name='branch' and isc.column_name='is_active'"),
  "The canonical verifier must qualify information_schema column references",
);
assert.ok(
  !/^\s*table_name text;$/m.test(workflow),
  "The ambiguous table_name verifier variable must not return",
);

const doBlockPattern = /do \$([a-zA-Z0-9_]+)\$([\s\S]*?)\$\1\$;/g;
const doBlocks = [...workflow.matchAll(doBlockPattern)];
assert.ok(doBlocks.length > 0, "Expected to inspect PL/pgSQL DO blocks in the staging workflow");
for (const [, tag, body] of doBlocks) {
  assert.ok(
    !body.includes(":'"),
    `psql variables are not interpolated inside the dollar-quoted DO block $${tag}$`,
  );
}

for (const setting of [
  "talvo.recovery_shop",
  "talvo.recovery_branch",
  "talvo.recovery_other_branch",
  "talvo.recovery_owner",
  "talvo.recovery_other_owner",
]) {
  assert.ok(
    workflow.includes(`select set_config('${setting}', :`),
    `Recovery must initialize ${setting} before entering its guarded DO block`,
  );
  assert.ok(
    workflow.includes(`current_setting('${setting}')::uuid`),
    `Recovery guards must consume ${setting} through current_setting`,
  );
}

console.log("TALVO staging workflow static contract passed");
