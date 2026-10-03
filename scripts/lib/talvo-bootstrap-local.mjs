import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export const localProject = "coffee-saas-v1-local-runtime";
export const localContainer = `supabase_db_${localProject}`;

export function assertLocalEndpoint(endpoint) {
  assert.match(endpoint, /^(?:npipe:\/{4}\.\/pipe\/[^/\\\s]+|unix:\/\/\/\S+)$/, "Refusing a non-local Docker engine");
}

// No hostname, URL, credentials, alternate container or remote transport option.
// Docker itself must use a local engine, not a configured remote context.
export function assertLocalEngine() {
  const context = spawnSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8" });
  assert.equal(context.status, 0, "Cannot inspect Docker context");
  assertLocalEndpoint(context.stdout.trim());
  if (process.env.DOCKER_HOST) assertLocalEndpoint(process.env.DOCKER_HOST);
}

export function assertLocalContainer() {
  assertLocalEngine();
  const result = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}|{{.State.Running}}', localContainer], { encoding: "utf8" });
  assert.equal(result.status, 0, "Start the disposable local Supabase runtime first");
  assert.equal(result.stdout.trim(), `${localProject}|true`, "Refusing an unverified local database container");
}

export function localSql(input, { database = "postgres", transaction = false } = {}) {
  assert.match(database, /^(?:postgres|talvo_bootstrap_test_[a-f0-9]{16})$/, "Invalid disposable database name");
  assertLocalContainer();
  return spawnSync("docker", ["exec", "-i", localContainer, "psql", "-h", "/var/run/postgresql", "-X", "-q", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-At", ...(transaction ? ["--single-transaction"] : []), "-f", "-"],
  { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}
