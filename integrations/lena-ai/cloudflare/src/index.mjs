const SERVICE_NAME = "lena-webhook-gateway";
const SERVICE_VERSION = "1.0.0";
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
// Cloudflare Queues currently caps each message at 128 KB. Keep headroom for
// serialization metadata; oversized verified payloads are externalized to R2.
const DEFAULT_MAX_QUEUE_MESSAGE_BYTES = 100_000;
const MAX_QUEUE_MESSAGE_BYTES = 120_000;
const DEFAULT_MAX_SKEW_SECONDS = 300;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export default {
  fetch: handleFetch,
  queue: handleQueue,
};

export async function handleFetch(request, env = {}) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse(
      {
        status: "ok",
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
      },
      200,
    );
  }

  const provider = providerFromPath(url.pathname);
  if (!provider) return jsonResponse({ error: "not_found" }, 404);
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, {
      Allow: "POST",
    });
  }

  if (!env.LENA_EVENTS || typeof env.LENA_EVENTS.send !== "function") {
    return jsonResponse({ error: "queue_not_configured" }, 503);
  }

  const organizationId = requiredString(env.LENA_ORGANIZATION_ID);
  if (!organizationId) {
    return jsonResponse({ error: "organization_not_configured" }, 503);
  }

  const maxBodyBytes = positiveInteger(
    env.MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES,
  );
  const contentLength = parseContentLength(request.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBodyBytes) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  let rawBytes;
  try {
    rawBytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return jsonResponse({ error: "body_read_failed" }, 400);
  }
  if (rawBytes.byteLength > maxBodyBytes) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  const rawBody = textDecoder.decode(rawBytes);
  const receivedAt = new Date().toISOString();

  let payload;
  let envelopes;
  try {
    if (provider === "github") {
      await assertGitHubSignature(
        rawBytes,
        request.headers.get("x-hub-signature-256"),
        requiredSecret(env.GITHUB_WEBHOOK_SECRET, "GITHUB_WEBHOOK_SECRET"),
      );
      payload = parseJson(rawBody);
      envelopes = [
        await buildGitHubEnvelope({
          organizationId,
          request,
          payload,
          rawBytes,
          receivedAt,
        }),
      ];
    } else {
      const maxSkewSeconds = positiveInteger(
        env.WEBHOOK_MAX_SKEW_SECONDS,
        DEFAULT_MAX_SKEW_SECONDS,
      );
      const signature = await assertTailscaleSignature({
        rawBody,
        header: request.headers.get("tailscale-webhook-signature"),
        secret: requiredSecret(
          env.TAILSCALE_WEBHOOK_SECRET,
          "TAILSCALE_WEBHOOK_SECRET",
        ),
        maxSkewSeconds,
      });
      payload = parseJson(rawBody);
      if (!Array.isArray(payload) || payload.length === 0) {
        throw new WebhookError("invalid_tailscale_payload", 400);
      }
      envelopes = await Promise.all(
        payload.map((event, index) =>
          buildTailscaleEnvelope({
            organizationId,
            request,
            event,
            batchIndex: index,
            rawBytes,
            signedAtSeconds: signature.timestamp,
            receivedAt,
          }),
        ),
      );
    }
  } catch (error) {
    return webhookErrorResponse(error);
  }

  let queueEnvelopes;
  try {
    queueEnvelopes = await prepareQueueEnvelopes({
      envelopes,
      rawBytes,
      provider,
      env,
      maxQueueMessageBytes: boundedPositiveInteger(
        env.MAX_QUEUE_MESSAGE_BYTES,
        DEFAULT_MAX_QUEUE_MESSAGE_BYTES,
        MAX_QUEUE_MESSAGE_BYTES,
      ),
    });
    await Promise.all(
      queueEnvelopes.map((envelope) => env.LENA_EVENTS.send(envelope)),
    );
  } catch (error) {
    if (error instanceof WebhookError) return webhookErrorResponse(error);
    return jsonResponse({ error: "queue_unavailable" }, 503);
  }

  return jsonResponse(
    {
      accepted: queueEnvelopes.length,
      provider,
      idempotency_keys: envelopes.map((item) => item.idempotency_key),
    },
    202,
  );
}

export async function handleQueue(batch, env = {}) {
  const ingestUrl = requiredString(env.SUPABASE_INGEST_URL);
  const secretKey = requiredString(env.SUPABASE_SECRET_KEY);
  if (!ingestUrl || !secretKey) {
    for (const message of batch.messages ?? []) message.retry?.();
    throw new Error("SUPABASE_INGEST_URL and SUPABASE_SECRET_KEY are required");
  }

  const results = await Promise.allSettled(
    (batch.messages ?? []).map(async (message) => {
      const envelope = await rehydrateQueueEnvelope(message.body, env);
      const response = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          apikey: secretKey,
          "Content-Type": "application/json",
          "User-Agent": `${SERVICE_NAME}/${SERVICE_VERSION}`,
        },
        body: JSON.stringify({ p_event: envelope }),
      });

      if (!response.ok) {
        const responseText = (await response.text()).slice(0, 500);
        throw new Error(
          `Supabase ingest failed (${response.status}): ${responseText}`,
        );
      }

      message.ack?.();
    }),
  );

  let failures = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "rejected") {
      failures += 1;
      batch.messages[index]?.retry?.();
      console.error("Lena event ingest failed", {
        messageId: batch.messages[index]?.id,
        error: safeErrorMessage(result.reason),
      });
    }
  }

  // Failed messages were explicitly marked for retry. Returning successfully
  // preserves acknowledgements for successful messages and avoids retrying the
  // whole batch or counting the invocation itself as failed.
  if (failures > 0) {
    console.warn(`${failures} Lena event(s) scheduled for retry`);
  }
}

async function prepareQueueEnvelopes({
  envelopes,
  rawBytes,
  provider,
  env,
  maxQueueMessageBytes,
}) {
  const prepared = [];
  let payloadReference = null;

  for (let index = 0; index < envelopes.length; index += 1) {
    const envelope = envelopes[index];
    if (serializedByteLength(envelope) <= maxQueueMessageBytes) {
      prepared.push(envelope);
      continue;
    }

    if (!env.LENA_WEBHOOK_RAW || typeof env.LENA_WEBHOOK_RAW.put !== "function") {
      throw new WebhookError("payload_storage_not_configured", 503);
    }

    if (!payloadReference) {
      const sha256 = await sha256Hex(rawBytes);
      const key = `verified-webhooks/${provider}/${sha256}.json`;
      try {
        await env.LENA_WEBHOOK_RAW.put(key, rawBytes, {
          httpMetadata: { contentType: "application/json" },
          customMetadata: {
            provider,
            sha256,
            verification: "signature-verified",
          },
        });
      } catch {
        throw new WebhookError("payload_storage_unavailable", 503);
      }
      payloadReference = {
        storage: "r2",
        key,
        sha256,
        bytes: rawBytes.byteLength,
      };
    }

    const externalized = {
      ...envelope,
      payload: {
        __lena_payload_ref: {
          ...payloadReference,
          json_pointer: provider === "tailscale" ? `/${index}` : "",
        },
      },
    };
    if (serializedByteLength(externalized) > maxQueueMessageBytes) {
      throw new WebhookError("queue_message_too_large", 413);
    }
    prepared.push(externalized);
  }

  return prepared;
}

async function rehydrateQueueEnvelope(envelope, env) {
  const reference = envelope?.payload?.__lena_payload_ref;
  if (!reference) return envelope;
  if (
    reference.storage !== "r2" ||
    !requiredString(reference.key) ||
    !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "") ||
    !Number.isSafeInteger(reference.bytes) ||
    reference.bytes < 0 ||
    (!["", undefined].includes(reference.json_pointer) &&
      !/^\/\d+$/.test(reference.json_pointer))
  ) {
    throw new Error("Invalid external payload reference");
  }
  if (!env.LENA_WEBHOOK_RAW || typeof env.LENA_WEBHOOK_RAW.get !== "function") {
    throw new Error("LENA_WEBHOOK_RAW is required to rehydrate payloads");
  }

  const object = await env.LENA_WEBHOOK_RAW.get(reference.key);
  if (!object || typeof object.arrayBuffer !== "function") {
    throw new Error(`External payload not found: ${reference.key}`);
  }
  const rawBytes = new Uint8Array(await object.arrayBuffer());
  if (rawBytes.byteLength !== reference.bytes) {
    throw new Error("External payload byte length mismatch");
  }
  if ((await sha256Hex(rawBytes)) !== reference.sha256) {
    throw new Error("External payload hash mismatch");
  }

  const decoded = parseJson(textDecoder.decode(rawBytes));
  let payload = decoded;
  if (reference.json_pointer) {
    const index = Number(reference.json_pointer.slice(1));
    if (!Array.isArray(decoded) || !(index in decoded)) {
      throw new Error("External payload JSON pointer is invalid");
    }
    payload = decoded[index];
  }
  return { ...envelope, payload };
}

function serializedByteLength(value) {
  return textEncoder.encode(JSON.stringify(value)).byteLength;
}

function providerFromPath(pathname) {
  const match = /^\/webhooks\/(github|tailscale)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

async function buildGitHubEnvelope({
  organizationId,
  request,
  payload,
  rawBytes,
  receivedAt,
}) {
  const deliveryId =
    requiredString(request.headers.get("x-github-delivery")) ??
    (await sha256Hex(rawBytes));
  const eventType =
    requiredString(request.headers.get("x-github-event")) ?? "unknown";
  const repository = requiredString(payload?.repository?.full_name);
  const idempotencyKey = `github:${deliveryId}`;

  return {
    schema_version: 1,
    organization_id: organizationId,
    provider: "github",
    delivery_id: deliveryId,
    event_type: eventType,
    occurred_at: inferGitHubOccurredAt(payload) ?? receivedAt,
    received_at: receivedAt,
    idempotency_key: idempotencyKey,
    source: repository ?? "github",
    headers: safeHeaders(request.headers, [
      "content-type",
      "user-agent",
      "x-github-delivery",
      "x-github-event",
      "x-github-hook-id",
    ]),
    payload,
  };
}

async function buildTailscaleEnvelope({
  organizationId,
  request,
  event,
  batchIndex,
  rawBytes,
  signedAtSeconds,
  receivedAt,
}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new WebhookError("invalid_tailscale_event", 400);
  }
  const batchHash = await sha256Hex(rawBytes);
  const eventType = requiredString(event.type) ?? "unknown";
  const eventTimestamp = normalizeTimestamp(event.timestamp) ?? receivedAt;
  const tailnet = requiredString(event.tailnet) ?? "tailscale";
  const deliveryId = `${signedAtSeconds}:${batchHash}:${batchIndex}`;

  return {
    schema_version: 1,
    organization_id: organizationId,
    provider: "tailscale",
    delivery_id: deliveryId,
    event_type: eventType,
    occurred_at: eventTimestamp,
    received_at: receivedAt,
    idempotency_key: `tailscale:${deliveryId}`,
    source: tailnet,
    headers: safeHeaders(request.headers, ["content-type", "user-agent"]),
    payload: event,
  };
}

export async function assertGitHubSignature(rawBody, header, secret) {
  if (!header?.startsWith("sha256=")) {
    throw new WebhookError("missing_or_invalid_signature", 401);
  }
  const provided = header.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) {
    throw new WebhookError("missing_or_invalid_signature", 401);
  }
  const expected = await hmacSha256Hex(secret, rawBody);
  if (!constantTimeHexEqual(provided, expected)) {
    throw new WebhookError("invalid_signature", 401);
  }
}

export async function assertTailscaleSignature({
  rawBody,
  header,
  secret,
  maxSkewSeconds = DEFAULT_MAX_SKEW_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const parts = parseSignatureHeader(header);
  const timestamp = Number(parts.t);
  const signature = parts.v1?.toLowerCase();
  if (
    !Number.isInteger(timestamp) ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw new WebhookError("missing_or_invalid_signature", 401);
  }
  if (Math.abs(nowSeconds - timestamp) > maxSkewSeconds) {
    throw new WebhookError("stale_signature", 401);
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!constantTimeHexEqual(signature, expected)) {
    throw new WebhookError("invalid_signature", 401);
  }
  return { timestamp };
}

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes =
    typeof message === "string" ? textEncoder.encode(message) : message;
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return bytesToHex(new Uint8Array(signature));
}

export async function sha256Hex(message) {
  const bytes =
    typeof message === "string" ? textEncoder.encode(message) : message;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeHexEqual(left, right) {
  if (left.length !== right.length || left.length % 2 !== 0) return false;
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function parseSignatureHeader(header) {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter(([key, value]) => key && value),
  );
}

function parseJson(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new WebhookError("invalid_json", 400);
  }
}

function inferGitHubOccurredAt(payload) {
  const candidates = [
    payload?.timestamp,
    payload?.created_at,
    payload?.updated_at,
    payload?.workflow_run?.created_at,
    payload?.workflow_job?.created_at,
    payload?.issue?.updated_at,
    payload?.pull_request?.updated_at,
    payload?.head_commit?.timestamp,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeTimestamp(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function safeHeaders(headers, allowedNames) {
  const result = {};
  for (const name of allowedNames) {
    const value = headers.get(name);
    if (value !== null) result[name] = value.slice(0, 500);
  }
  return result;
}

function parseContentLength(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedPositiveInteger(value, fallback, maximum) {
  return Math.min(positiveInteger(value, fallback), maximum);
}

function requiredSecret(value, name) {
  const secret = requiredString(value);
  if (!secret) throw new WebhookError(`${name}_not_configured`, 503);
  return secret;
}

function requiredString(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function webhookErrorResponse(error) {
  if (error instanceof WebhookError) {
    return jsonResponse({ error: error.code }, error.status);
  }
  console.error("Unhandled webhook error", { error: safeErrorMessage(error) });
  return jsonResponse({ error: "internal_error" }, 500);
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 500) : String(error);
}

class WebhookError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "WebhookError";
    this.code = code;
    this.status = status;
  }
}
