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

const bootstrapWorkflowPath = ".github/workflows/pre-talvo-branch-bootstrap-staging-validation.yml";
const bootstrapWorkflow = readFileSync(bootstrapWorkflowPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: staging-database-mutation",
  "environment: talvo-staging",
  "APPROVED_TALVO_TARGET_SHA",
  "STAGING_DATABASE_URL",
  "TRUSTED_BOOTSTRAP_BASE_SHA: 81cf7e0506baeb664f7c3794c987f05bf5d2ad64",
  'git merge-base --is-ancestor "$TRUSTED_BOOTSTRAP_BASE_SHA" "$TARGET_SHA"',
  "20260922193511_bootstrap_pre_talvo_branches.sql",
  "Require data-empty staging baseline",
  "rollback;",
  "Prove staging unchanged",
]) {
  assert.ok(
    bootstrapWorkflow.includes(marker),
    `Pre-TALVO bootstrap staging validator must include: ${marker}`,
  );
}
assert.ok(
  !bootstrapWorkflow.includes("PRODUCTION_DATABASE_URL"),
  "Pre-TALVO bootstrap rehearsal must never receive production database credentials",
);
assert.ok(
  bootstrapWorkflow.includes('[[ "$REF_NAME" == "main" ]]'),
  "Pre-TALVO bootstrap validator must dispatch from main only",
);
assert.ok(
  bootstrapWorkflow.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Pre-TALVO bootstrap validator must require the protected exact target SHA",
);
assert.ok(
  !bootstrapWorkflow.includes('git merge-base --is-ancestor "$GITHUB_SHA" "$TARGET_SHA"'),
  "Validator must not require the feature SHA to descend from the validator merge commit",
);
assert.ok(
  bootstrapWorkflow.includes("PASS staging unchanged after bootstrap rehearsal"),
  "Pre-TALVO bootstrap validator must prove rollback residue is absent",
);


const productionPreflightPath = ".github/workflows/talvo-production-rollout-preflight.yml";
const productionPreflight = readFileSync(productionPreflightPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: cb01ad6499c154b26fc172fa9dbb9c29a40ad081",
  "PRODUCTION_PROJECT_REF: udgxrvtbhytqncmyhmiv",
  "STAGING_PROJECT_REF: vgsrqrirtxxxnccactsb",
  "default_transaction_read_only=on",
  "20260807090000_atomic_pos_checkout.sql",
  "20260817100000_talvo_supply_item_vertical_slice.sql",
  "20260922193511_bootstrap_pre_talvo_branches.sql",
  "20260819180000_talvo_receive_supply_item.sql",
  "20260819180100_talvo_receive_history_hardening.sql",
  "20260910042652_sale_recipe_inventory.sql",
  "20260921142010_current_usable_stock.sql",
  "NO PRODUCTION MUTATION WAS PERFORMED",
]) {
  assert.ok(
    productionPreflight.includes(marker),
    `Production rollout preflight must include: ${marker}`,
  );
}
assert.ok(
  productionPreflight.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rollout preflight must dispatch from main only",
);
assert.ok(
  productionPreflight.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rollout preflight must require the protected exact target SHA",
);
assert.ok(
  productionPreflight.includes('git merge-base --is-ancestor "$TRUSTED_ROLLOUT_BASE_SHA" "$TARGET_SHA"'),
  "Production rollout preflight must pin the reviewed rollout base",
);
assert.ok(
  !productionPreflight.includes("supabase db push"),
  "Production rollout preflight must never push migrations",
);
assert.ok(
  !productionPreflight.includes("apply_migration"),
  "Production rollout preflight must never apply migrations",
);
assert.ok(
  !productionPreflight.includes("STAGING_DATABASE_URL"),
  "Production rollout preflight must never receive staging database credentials",
);
assert.ok(
  !/psql[^\n]*-f\s+supabase\/migrations/i.test(productionPreflight),
  "Production rollout preflight must never execute a migration file against production",
);
assert.ok(
  productionPreflight.includes("to_regclass('supabase_migrations.schema_migrations') is null"),
  "Production rollout preflight must fail closed if migration history unexpectedly appears",
);


const productionRehearsalPath = ".github/workflows/talvo-production-rollout-rehearsal.yml";
const productionRehearsal = readFileSync(productionRehearsalPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "REHEARSE_TALVO_PRODUCTION",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: d46a7cb276dddf0b135b2681e1fc1eb0207b8005",
  "begin isolation level read committed;",
  "set local lock_timeout = '3s';",
  "in share row exclusive mode nowait;",
  "insert into talvo.schema_revisions",
  "rollback;",
  "PASS TALVO production rollout rehearsal rolled back cleanly",
  "PASS production returned to reviewed pre-TALVO state",
]) {
  assert.ok(
    productionRehearsal.includes(marker),
    `Production rollout rehearsal must include: ${marker}`,
  );
}
assert.ok(
  productionRehearsal.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rehearsal must dispatch from main only",
);
assert.ok(
  productionRehearsal.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rehearsal must require the protected exact target SHA",
);
assert.ok(
  !productionRehearsal.includes("supabase db push"),
  "Production rehearsal must not use db push",
);
assert.ok(
  !productionRehearsal.includes("apply_migration"),
  "Production rehearsal must not use the Supabase apply-migration action",
);
assert.ok(
  !productionRehearsal.includes("STAGING_DATABASE_URL"),
  "Production rehearsal must never receive staging database credentials",
);
assert.ok(
  !/^\s*commit;\s*$/mi.test(productionRehearsal),
  "Production rehearsal must never commit its transaction",
);
assert.ok(
  productionRehearsal.indexOf("20260807090000_atomic_pos_checkout.sql") <
    productionRehearsal.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") &&
    productionRehearsal.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") <
    productionRehearsal.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") &&
    productionRehearsal.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") <
    productionRehearsal.indexOf("20260819180000_talvo_receive_supply_item.sql") &&
    productionRehearsal.indexOf("20260819180000_talvo_receive_supply_item.sql") <
    productionRehearsal.indexOf("20260819180100_talvo_receive_history_hardening.sql") &&
    productionRehearsal.indexOf("20260819180100_talvo_receive_history_hardening.sql") <
    productionRehearsal.indexOf("20260910042652_sale_recipe_inventory.sql") &&
    productionRehearsal.indexOf("20260910042652_sale_recipe_inventory.sql") <
    productionRehearsal.indexOf("20260921142010_current_usable_stock.sql"),
  "Production rehearsal must keep the reviewed explicit rollout order",
);


const productionApplyPath = ".github/workflows/talvo-production-rollout-apply.yml";
const productionApply = readFileSync(productionApplyPath, "utf8");

for (const marker of [
  "workflow_dispatch:",
  "group: talvo-production-database-rollout",
  "environment: talvo-production",
  "APPLY_TALVO_PRODUCTION",
  "APPROVED_TALVO_TARGET_SHA",
  "PRODUCTION_DATABASE_URL",
  "TRUSTED_ROLLOUT_BASE_SHA: be51e0f0b7541ef2f2a8dd63c8df0bfeb43be79b",
  "--single-transaction",
  "set transaction isolation level read committed;",
  "set local lock_timeout = '3s';",
  "in share row exclusive mode nowait;",
  "TALVO_EXPECTED_COUNTS",
  "insert into talvo.schema_revisions",
  "PASS TALVO production rollout transaction verified before commit",
  "PASS TALVO production rollout committed and verified",
  "Classify production state after any failure",
]) {
  assert.ok(
    productionApply.includes(marker),
    `Production rollout apply workflow must include: ${marker}`,
  );
}
assert.ok(
  productionApply.includes('[[ "$REF_NAME" == "main" ]]'),
  "Production rollout apply must dispatch from main only",
);
assert.ok(
  productionApply.includes('[[ "$TARGET_SHA" == "$APPROVED_TALVO_TARGET_SHA" ]]'),
  "Production rollout apply must require the protected exact target SHA",
);
assert.ok(
  productionApply.includes('echo "TALVO_IDENTITY_VALIDATED=true" >> "$GITHUB_ENV"'),
  "Production rollout apply must classify post-state only after exact production identity validation",
);
assert.ok(
  !productionApply.includes("supabase db push"),
  "Production rollout apply must not use unbounded db push",
);
assert.ok(
  !productionApply.includes("apply_migration"),
  "Production rollout apply must not use an unreviewed migration action",
);
assert.ok(
  !productionApply.includes("STAGING_DATABASE_URL"),
  "Production rollout apply must never receive staging database credentials",
);
assert.ok(
  !/^\s*commit;\s*$/mi.test(productionApply),
  "Production rollout apply must rely on psql --single-transaction rather than embedded COMMIT statements",
);
assert.ok(
  productionApply.indexOf("20260807090000_atomic_pos_checkout.sql") <
    productionApply.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") &&
    productionApply.indexOf("20260817100000_talvo_supply_item_vertical_slice.sql") <
    productionApply.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") &&
    productionApply.indexOf("20260922193511_bootstrap_pre_talvo_branches.sql") <
    productionApply.indexOf("20260819180000_talvo_receive_supply_item.sql") &&
    productionApply.indexOf("20260819180000_talvo_receive_supply_item.sql") <
    productionApply.indexOf("20260819180100_talvo_receive_history_hardening.sql") &&
    productionApply.indexOf("20260819180100_talvo_receive_history_hardening.sql") <
    productionApply.indexOf("20260910042652_sale_recipe_inventory.sql") &&
    productionApply.indexOf("20260910042652_sale_recipe_inventory.sql") <
    productionApply.indexOf("20260921142010_current_usable_stock.sql"),
  "Production rollout apply must keep the reviewed explicit rollout order",
);

console.log("TALVO staging, production preflight, rehearsal, and apply workflow static contracts passed");
