import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const read = (path) => readFileSync(join(root, path), "utf8");

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("the normalized Lena registry contains exactly 43 sequential capabilities", () => {
  const registry = JSON.parse(read("agents/lena-ia/capabilities.json"));
  assert.equal(registry.count, 43);
  assert.equal(registry.capabilities.length, 43);

  const expected = Array.from(
    { length: 43 },
    (_, index) => `LENA-${String(index + 1).padStart(2, "0")}`,
  );
  assert.deepEqual(
    registry.capabilities.map((capability) => capability.id),
    expected,
  );
  assert.equal(
    new Set(registry.capabilities.map((capability) => capability.slug)).size,
    43,
  );
  for (const capability of registry.capabilities) {
    assert.match(capability.minimum_privilege, /^A[0-4]$/);
    assert.ok(capability.purpose.length > 10);
    assert.ok(capability.output.length > 5);
    assert.ok(capability.proof_of_completion.length > 5);
  }
});

test("the human-readable capability table remains synchronized at 43 rows", () => {
  const markdown = read("agents/lena-ia/CAPABILITIES-43.md");
  const rows = markdown.match(/^\| LENA-\d{2} \|/gm) ?? [];
  assert.equal(rows.length, 43);
  assert.match(markdown, /reconstruction normalisée/i);
});

test("the canonical event schema is closed and requires idempotency and provenance", () => {
  const schema = JSON.parse(
    read("integrations/lena-ai/contracts/event-envelope.schema.json"),
  );
  assert.equal(schema.additionalProperties, false);
  for (const field of [
    "organization_id",
    "provider",
    "event_type",
    "occurred_at",
    "received_at",
    "idempotency_key",
    "source",
    "headers",
    "payload",
  ]) {
    assert.ok(schema.required.includes(field), `${field} must be required`);
  }
  assert.equal(schema.properties.schema_version.const, 1);
});

test("the Supabase foundation is additive, tenant-scoped, and server-only", () => {
  const sql = read(
    "integrations/lena-ai/supabase/proposals/202609010001_lena_control_plane_foundation.sql",
  );
  const executable = stripSqlComments(sql);

  assert.equal((executable.match(/^create table if not exists /gim) ?? []).length, 12);
  assert.equal(
    (executable.match(/^alter table [^;]+ enable row level security;/gim) ?? [])
      .length,
    12,
  );
  assert.doesNotMatch(executable, /\bdrop\s+(table|schema|column|function)\b/i);
  assert.doesNotMatch(executable, /\btruncate\b/i);
  assert.doesNotMatch(executable, /\bdelete\s+from\b/i);
  assert.doesNotMatch(executable, /\balter\s+table\b[^;]*\brename\b/i);
  assert.match(executable, /security definer/i);
  assert.match(
    executable,
    /set search_path = pg_catalog/i,
  );
  assert.match(
    executable,
    /unique \(organization_id, idempotency_key\)/i,
  );
  assert.match(
    executable,
    /revoke all on function public\.ingest_lena_event\(jsonb\) from public, anon, authenticated/i,
  );
  assert.match(
    executable,
    /check \(extensions\.vector_dims\(embedding\) = dimensions\)/i,
  );
});

test("the Supabase proposal enforces tenant consistency across references", () => {
  const sql = read(
    "integrations/lena-ai/supabase/proposals/202609010001_lena_control_plane_foundation.sql",
  );
  const executable = stripSqlComments(sql);

  assert.match(
    executable,
    /create unique index if not exists projects_organization_id_id_uidx[\s\S]*on public\.projects \(organization_id, id\)/i,
  );
  assert.match(
    executable,
    /create unique index if not exists governance_runs_organization_id_id_uidx[\s\S]*on public\.governance_runs \(organization_id, id\)/i,
  );
  assert.ok(
    (executable.match(/foreign key \(organization_id, [a-z_]+\)/gi) ?? [])
      .length >= 15,
  );
  const normalized = executable.toLowerCase();
  for (const parent of [
    "sources",
    "source_versions",
    "documents",
    "chunks",
    "claims",
    "webhook_events",
    "approvals",
  ]) {
    assert.ok(
      normalized.includes(`references lena.${parent}(organization_id, id)`),
      `${parent} must be tenant-scoped`,
    );
  }
  assert.match(
    executable,
    /on delete set null \(project_id\)/i,
  );
});

test("the hardening proposal is bounded to eight indexes and one search_path fix", () => {
  const sql = read(
    "integrations/lena-ai/supabase/proposals/202609010002_existing_schema_hardening.sql",
  );
  const executable = stripSqlComments(sql);
  assert.equal((executable.match(/^create index if not exists /gim) ?? []).length, 8);
  assert.match(executable, /alter function mavis\.set_updated_at\(\)/i);
  assert.match(executable, /set search_path = pg_catalog, mavis/i);
  assert.doesNotMatch(executable, /\bdrop\b|\btruncate\b|\bdelete\s+from\b/i);
});

test("the integration bundle contains no recognizable live secret", () => {
  const roots = [
    "agents/lena-ia",
    ".agents/skills/lena-ai-control-plane",
    "integrations/lena-ai",
  ];
  const files = [];

  function walk(relativeDir) {
    const absoluteDir = join(root, relativeDir);
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const child = join(relativeDir, entry.name);
      if (entry.isDirectory()) walk(child);
      else files.push(child);
    }
  }

  for (const directory of roots) walk(directory);
  const patterns = [
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
    /\bsk-[A-Za-z0-9_-]{30,}\b/,
    /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];

  const findings = [];
  for (const file of files) {
    const content = read(relative(root, join(root, file)));
    for (const pattern of patterns) {
      if (pattern.test(content)) findings.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(findings, []);
});
