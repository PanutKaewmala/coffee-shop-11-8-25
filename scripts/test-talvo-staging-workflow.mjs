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

console.log("TALVO staging workflow static contract passed");
