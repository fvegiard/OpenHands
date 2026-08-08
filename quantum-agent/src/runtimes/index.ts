// Runtime adapter registry — maps a RuntimeId to its concrete adapter.
// Exhaustive over RuntimeId so a new runtime fails to compile until wired.

import type { RuntimeId } from "../providers/registry.ts";
import type { RuntimeAdapter } from "./adapter.ts";
import { claudeAdapter } from "./claude.ts";
import { codexAdapter } from "./codex.ts";
import { openaiAgentsAdapter } from "./openai-agents.ts";

const ADAPTERS: Record<RuntimeId, RuntimeAdapter> = {
  claude: claudeAdapter,
  "openai-agents": openaiAgentsAdapter,
  codex: codexAdapter,
};

export function getAdapter(id: RuntimeId): RuntimeAdapter {
  return ADAPTERS[id];
}

export type { Importer, RuntimeAdapter } from "./adapter.ts";
export { makeClaudeAdapter } from "./claude.ts";
export { makeCodexAdapter } from "./codex.ts";
export { makeOpenAIAgentsAdapter } from "./openai-agents.ts";
