import assert from "node:assert/strict";
import test from "node:test";
import {
  handleFetch,
  handleQueue,
  hmacSha256Hex,
} from "../src/index.mjs";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function queueBinding() {
  const messages = [];
  return {
    messages,
    async send(message) {
      messages.push(message);
    },
  };
}

function r2Binding() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options) {
      const bytes = new Uint8Array(value);
      objects.set(key, { bytes: bytes.slice(), options });
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        async arrayBuffer() {
          return stored.bytes.buffer.slice(
            stored.bytes.byteOffset,
            stored.bytes.byteOffset + stored.bytes.byteLength,
          );
        },
      };
    },
  };
}

function env(overrides = {}) {
  return {
    LENA_ORGANIZATION_ID: ORG_ID,
    GITHUB_WEBHOOK_SECRET: "github-test-secret",
    TAILSCALE_WEBHOOK_SECRET: "tailscale-test-secret",
    LENA_EVENTS: queueBinding(),
    ...overrides,
  };
}

test("health endpoint reports the concrete service version", async () => {
  const response = await handleFetch(
    new Request("https://worker.example/health"),
    env(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "lena-webhook-gateway",
    version: "1.0.0",
  });
});

test("valid GitHub webhook is verified, normalized, and queued", async () => {
  const body = JSON.stringify({
    repository: { full_name: "fvegiard/OpenHands" },
    head_commit: { timestamp: "2026-09-01T18:00:00-04:00" },
  });
  const signature = await hmacSha256Hex("github-test-secret", body);
  const testEnv = env();
  const request = new Request("https://worker.example/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-delivery": "delivery-123",
      "x-github-event": "push",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body,
  });

  const response = await handleFetch(request, testEnv);
  assert.equal(response.status, 202);
  assert.equal(testEnv.LENA_EVENTS.messages.length, 1);
  const queued = testEnv.LENA_EVENTS.messages[0];
  assert.deepEqual(
    {
      schema_version: queued.schema_version,
      organization_id: queued.organization_id,
      provider: queued.provider,
      delivery_id: queued.delivery_id,
      event_type: queued.event_type,
      occurred_at: queued.occurred_at,
      idempotency_key: queued.idempotency_key,
      source: queued.source,
    },
    {
      schema_version: 1,
      organization_id: ORG_ID,
      provider: "github",
      delivery_id: "delivery-123",
      event_type: "push",
      occurred_at: "2026-09-01T22:00:00.000Z",
      idempotency_key: "github:delivery-123",
      source: "fvegiard/OpenHands",
    },
  );
  assert.equal(
    "x-hub-signature-256" in testEnv.LENA_EVENTS.messages[0].headers,
    false,
  );
});

test("invalid GitHub signature is rejected before JSON parsing or queuing", async () => {
  const testEnv = env();
  const response = await handleFetch(
    new Request("https://worker.example/webhooks/github", {
      method: "POST",
      headers: {
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
      },
      body: "not-json",
    }),
    testEnv,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_signature" });
  assert.equal(testEnv.LENA_EVENTS.messages.length, 0);
});

test("Tailscale timestamped signature accepts a batch and queues each event", async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const body = JSON.stringify([
    {
      timestamp: new Date(nowSeconds * 1000).toISOString(),
      version: 1,
      type: "nodeCreated",
      tailnet: "example.com",
      message: "node created",
      data: { nodeID: "node-1" },
    },
    {
      timestamp: new Date(nowSeconds * 1000).toISOString(),
      version: 1,
      type: "nodeApproved",
      tailnet: "example.com",
      message: "node approved",
      data: { nodeID: "node-1" },
    },
  ]);
  const signature = await hmacSha256Hex(
    "tailscale-test-secret",
    `${nowSeconds}.${body}`,
  );
  const testEnv = env();

  const response = await handleFetch(
    new Request("https://worker.example/webhooks/tailscale", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "tailscale-webhook-signature": `t=${nowSeconds},v1=${signature}`,
      },
      body,
    }),
    testEnv,
  );

  assert.equal(response.status, 202);
  assert.equal(testEnv.LENA_EVENTS.messages.length, 2);
  assert.deepEqual(
    testEnv.LENA_EVENTS.messages.map((item) => item.event_type),
    ["nodeCreated", "nodeApproved"],
  );
  assert.equal(
    testEnv.LENA_EVENTS.messages.every(
      (item) => item.idempotency_key.startsWith("tailscale:"),
    ),
    true,
  );
});

test("stale Tailscale webhook is rejected as a replay", async () => {
  const timestamp = Math.floor(Date.now() / 1000) - 301;
  const body = JSON.stringify([
    {
      timestamp: new Date(timestamp * 1000).toISOString(),
      version: 1,
      type: "test",
      tailnet: "example.com",
      message: "test",
      data: null,
    },
  ]);
  const signature = await hmacSha256Hex(
    "tailscale-test-secret",
    `${timestamp}.${body}`,
  );
  const testEnv = env();

  const response = await handleFetch(
    new Request("https://worker.example/webhooks/tailscale", {
      method: "POST",
      headers: {
        "tailscale-webhook-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    }),
    testEnv,
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "stale_signature" });
  assert.equal(testEnv.LENA_EVENTS.messages.length, 0);
});

test("same GitHub delivery produces a stable idempotency key", async () => {
  const body = JSON.stringify({ repository: { full_name: "org/repo" } });
  const signature = await hmacSha256Hex("github-test-secret", body);
  const testEnv = env();

  for (let index = 0; index < 2; index += 1) {
    const response = await handleFetch(
      new Request("https://worker.example/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-delivery": "delivery-stable",
          "x-github-event": "push",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body,
      }),
      testEnv,
    );
    assert.equal(response.status, 202);
  }

  assert.equal(testEnv.LENA_EVENTS.messages.length, 2);
  assert.equal(
    testEnv.LENA_EVENTS.messages[0].idempotency_key,
    testEnv.LENA_EVENTS.messages[1].idempotency_key,
  );
});

test("oversized body is rejected before queue handoff", async () => {
  const testEnv = env({ MAX_BODY_BYTES: "4" });
  const response = await handleFetch(
    new Request("https://worker.example/webhooks/github", {
      method: "POST",
      headers: { "content-length": "5" },
      body: "12345",
    }),
    testEnv,
  );

  assert.equal(response.status, 413);
  assert.equal(testEnv.LENA_EVENTS.messages.length, 0);
});

test("large verified webhook payload is externalized to R2 before queuing", async (t) => {
  const body = JSON.stringify({
    repository: { full_name: "fvegiard/OpenHands" },
    blob: "x".repeat(4_000),
  });
  const signature = await hmacSha256Hex("github-test-secret", body);
  const rawStore = r2Binding();
  const testEnv = env({
    MAX_QUEUE_MESSAGE_BYTES: "1200",
    LENA_WEBHOOK_RAW: rawStore,
  });

  const response = await handleFetch(
    new Request("https://worker.example/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-large",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body,
    }),
    testEnv,
  );

  assert.equal(response.status, 202);
  assert.equal(rawStore.objects.size, 1);
  assert.equal(testEnv.LENA_EVENTS.messages.length, 1);
  const queued = testEnv.LENA_EVENTS.messages[0];
  assert.equal(queued.payload.__lena_payload_ref.storage, "r2");

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let ingested;
  globalThis.fetch = async (_url, options) => {
    ingested = JSON.parse(options.body).p_event;
    return new Response(JSON.stringify({ status: "inserted" }), { status: 200 });
  };

  let acked = 0;
  await handleQueue(
    {
      messages: [
        {
          id: "message-large",
          body: queued,
          ack() {
            acked += 1;
          },
        },
      ],
    },
    {
      LENA_WEBHOOK_RAW: rawStore,
      SUPABASE_INGEST_URL:
        "https://project.supabase.co/rest/v1/rpc/ingest_lena_event",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    },
  );

  assert.equal(acked, 1);
  assert.equal(ingested.payload.blob.length, 4_000);
  assert.equal(ingested.idempotency_key, "github:delivery-large");
});

test("large payload is rejected safely when R2 is not configured", async () => {
  const body = JSON.stringify({
    repository: { full_name: "fvegiard/OpenHands" },
    blob: "x".repeat(4_000),
  });
  const signature = await hmacSha256Hex("github-test-secret", body);
  const testEnv = env({ MAX_QUEUE_MESSAGE_BYTES: "1200" });

  const response = await handleFetch(
    new Request("https://worker.example/webhooks/github", {
      method: "POST",
      headers: {
        "x-github-delivery": "delivery-large-no-r2",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body,
    }),
    testEnv,
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "payload_storage_not_configured",
  });
  assert.equal(testEnv.LENA_EVENTS.messages.length, 0);
});

test("queue consumer acknowledges successful Supabase RPC calls", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ status: "inserted" }), { status: 200 });
  };

  let acked = 0;
  let retried = 0;
  const message = {
    id: "message-1",
    body: { idempotency_key: "github:1" },
    ack() {
      acked += 1;
    },
    retry() {
      retried += 1;
    },
  };

  await handleQueue(
    { messages: [message] },
    {
      SUPABASE_INGEST_URL:
        "https://project.supabase.co/rest/v1/rpc/ingest_lena_event",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    },
  );

  assert.equal(acked, 1);
  assert.equal(retried, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_event: message.body,
  });
});

test("queue consumer retries failed Supabase RPC calls", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  let retried = 0;
  const message = {
    id: "message-2",
    body: { idempotency_key: "github:2" },
    retry() {
      retried += 1;
    },
  };

  await handleQueue(
    { messages: [message] },
    {
      SUPABASE_INGEST_URL:
        "https://project.supabase.co/rest/v1/rpc/ingest_lena_event",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    },
  );
  assert.equal(retried, 1);
});
