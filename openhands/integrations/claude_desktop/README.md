# Claude Desktop integration

A stdio MCP server (`openhands-mcp`) that lets Claude Desktop drive an
OpenHands backend. It bundles two layers of tools in a single Desktop server
entry:

- **Forge tools** (`create_pr`, `create_mr`, `create_bitbucket_pr`,
  `create_bitbucket_data_center_pr`, `create_azure_devops_pr`) — proxied
  unchanged from the existing OpenHands HTTP MCP server at
  `${OPENHANDS_BASE_URL}/mcp/mcp`.
- **Agent task tools**:
  - `openhands_run_task(prompt, selected_repository?, timeout_s?)` — starts a
    new conversation and waits for it to be ready.
  - `openhands_get_conversation(conversation_id)` — fetches the current
    status/metadata of an existing conversation.

## Prerequisites

- An OpenHands backend reachable over HTTP (e.g. `make run` locally or a
  deployed instance).
- `openhands-ai` installed in the same environment Desktop will spawn from
  (Desktop runs whatever `command` you put in `claude_desktop_config.json`).

## Configure Claude Desktop

Add an `openhands` server to
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "openhands": {
      "command": "openhands-mcp",
      "env": {
        "OPENHANDS_BASE_URL": "http://localhost:3000",
        "OPENHANDS_API_KEY": ""
      }
    }
  }
}
```

Restart Desktop. The `openhands` server should appear in the tool list (hammer
icon). Ask Claude something like "use openhands to summarise the README in
this repo" and it will call `openhands_run_task`.

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `OPENHANDS_BASE_URL` | (required) | Root URL of the OpenHands backend, e.g. `http://localhost:3000`. Trailing slash optional. |
| `OPENHANDS_API_KEY`  | unset | Sent as `Authorization: Bearer <key>` to both REST and the proxied MCP endpoint. Leave blank if your backend does not require auth. |
| `OPENHANDS_MCP_PROXY` | `1` | Set to `0` to skip mounting the upstream HTTP MCP. Use this if the forge tools require auth/headers you do not want to configure here. |
| `OPENHANDS_MCP_LOG_LEVEL` | `INFO` | stdlib log level. Logs are written to stderr (stdout is reserved for the MCP protocol). |

## Troubleshooting

- **Desktop shows no tools.** Verify `openhands-mcp` is on `PATH` for Desktop's
  shell. From a terminal, run `openhands-mcp` directly — it should print log
  lines about starting an MCP server (and otherwise wait for stdin).
- **"OPENHANDS_BASE_URL is not set."** Set it in the `env` block above.
- **`401` from the REST API.** Set `OPENHANDS_API_KEY`.
- **Forge tools error on call.** The upstream HTTP MCP expects user-context
  headers (e.g. provider tokens, conversation IDs) that this stdio shim does
  not synthesize. If you do not need them from Desktop, set
  `OPENHANDS_MCP_PROXY=0` to hide them.
