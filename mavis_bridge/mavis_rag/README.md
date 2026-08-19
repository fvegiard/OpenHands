# Mavis RAG — local Qdrant + BGE-small knowledge base

> **What this is**: a fully local, no-API-key semantic search over **187
> entries** describing every skill, plugin, environment access, agent
> memory topic, tool, sub-agent, and MCP server Mavis has.

## Why it exists

Mavis used to RAG against Supabase REST (66 vectors, only `mavis_knowledge`
table). This is a **second-tier RAG** running entirely in the sandbox:

- **Qdrant 1.19.0** (Rust binary, `localhost:6333`, gRPC on `:6334`)
- **BGE-small-en-v1.5** via `fastembed` (ONNX runtime, 384-dim, ~3 MB)
- **Zero external API calls** — works even when every LLM key is dead
- **187 points**, 16 categories, ready in < 40s end-to-end

## Corpus

| Type | Count | Examples |
|------|-------|----------|
| `skill` (Mavis system prompt) | 94 | `code-savant`, `superpowers:*`, `frontend-design`, `deep-research` |
| `mavis-skill` (openagent port) | 26 | `github`, `gitlab`, `docker`, `code-review`, `kubernetes` |
| `plugin` (7 official MiniMax) | 7 | `superdesign`, `everme`, `excel`, `superpowers`, `ppt`, `pdf`, `notion` |
| `tool` (Mavis tools) | 25 | `bash`, `read`, `web_fetch`, `team`, `mavis`, `memory_*` |
| `llm-provider` (env keys) | 10 | `anthropic`, `openai`, `openrouter`, `gemini`, `grok`, `groq`, `ollama`, `huggingface` |
| `cloud` (env keys) | 4 | `cloudflare`, `r2`, `netlify`, `supabase` |
| `dev-platform` (env keys) | 4 | `github`, `cursor`, `opencode`, `tailscale` |
| `memory-topic` (Mavis MEMORY) | 8 | `bun-runtime`, `jarvis-stack`, `mavis-platform`, `pre-flight-protocol` |
| `subagent` | 3 | `explore`, `general`, `scout` |
| `mcp-server` | 1 | `sequential-thinking` (always loaded) |
| `messaging` | 1 | `telegram` |
| `search` | 1 | `brave` |
| `security` | 1 | `virustotal` |
| `other` | 2 | `stitch`, `warp2` |
| **Total** | **187** | |

## How to use

```bash
# CLI
python3 /workspace/mavis-rag/query.py "kilo autonomy" --k 8
python3 /workspace/mavis-rag/query.py "k8s" --type mavis-skill,plugin
python3 /workspace/mavis-rag/query.py "github" --json | jq

# HTTP API
curl -X POST http://127.0.0.1:8088/search \
  -H "Content-Type: application/json" \
  -d '{"query": "how to deploy", "k": 5, "type": "tool,plugin"}'
```

## How to re-ingest (idempotent)

```bash
cd /workspace/mavis-rag
python3 ingest.py
# wipes + recreates the collection, re-embeds, re-uploads
```

## Files

```
qdrant/                     # Qdrant 1.19.0 binary + storage/
corpus.py                   # the 187-entry knowledge base
ingest.py                   # embed + upload
query.py                    # CLI search
serve.py                    # HTTP server on :8088
ingest.log                  # last run log
serve.log                   # HTTP server log
```

## Latency

- Embed: 60–110ms per query (BGE-small CPU)
- Qdrant search: 5–15ms (187 vectors, single segment)
- HTTP overhead: 1–2ms

Total: **~80–130ms per query** on this sandbox. At 1k vectors expect
~150ms. At 100k vectors expect ~250ms (still well under the user-perceived
threshold of 500ms).
