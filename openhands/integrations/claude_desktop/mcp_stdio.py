"""Stdio MCP server that exposes OpenHands to Claude Desktop.

Runs as a local subprocess launched by ``claude_desktop_config.json``. It does
two things:

1. Proxies the OpenHands HTTP MCP server (``${OPENHANDS_BASE_URL}/mcp/mcp``)
   so the existing forge tools (``create_pr``, ``create_mr``, etc.) are
   callable from Desktop without duplication.
2. Adds two REST-backed tools for running a task end-to-end:
   ``openhands_run_task`` and ``openhands_get_conversation``.

The shim is intentionally thin — it shells out to a running OpenHands backend.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Annotated, Any

from fastmcp import Client, FastMCP
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.exceptions import ToolError
from pydantic import Field

from openhands.integrations.claude_desktop.rest_client import (
    DEFAULT_TIMEOUT_S,
    OpenHandsRestClient,
    OpenHandsRestError,
    RestConfig,
)

logger = logging.getLogger('openhands.mcp.stdio')


def _build_proxy(config: RestConfig) -> FastMCP[Any] | None:
    """Construct a proxy FastMCP for the upstream HTTP MCP server.

    Returns ``None`` if proxying is disabled via ``OPENHANDS_MCP_PROXY=0`` —
    useful when the upstream forge tools require auth/headers the user has
    not configured and would otherwise spam errors at startup.
    """
    if os.environ.get('OPENHANDS_MCP_PROXY', '1') == '0':
        return None

    transport = StreamableHttpTransport(
        url=config.mcp_url,
        headers=config.headers() or None,
    )
    upstream = Client(transport)
    return FastMCP.as_proxy(upstream, name='openhands-forge')


def _format_run_result(start_task: dict[str, Any]) -> dict[str, Any]:
    return {
        'start_task_id': start_task.get('id'),
        'status': start_task.get('status'),
        'detail': start_task.get('detail'),
        'conversation_id': start_task.get('app_conversation_id'),
        'sandbox_id': start_task.get('sandbox_id'),
        'agent_server_url': start_task.get('agent_server_url'),
    }


def build_server(config: RestConfig | None = None) -> FastMCP[Any]:
    """Build the stdio MCP server. Exposed for tests."""
    cfg = config or RestConfig.from_env()
    mcp: FastMCP[Any] = FastMCP('openhands')

    proxy = _build_proxy(cfg)
    if proxy is not None:
        mcp.mount(proxy)

    @mcp.tool()
    async def openhands_run_task(
        prompt: Annotated[
            str,
            Field(
                description='The task or instructions to send to the OpenHands agent.'
            ),
        ],
        selected_repository: Annotated[
            str | None,
            Field(
                default=None,
                description=(
                    'Optional repository in "owner/repo" form to clone into the '
                    'sandbox before the agent runs.'
                ),
            ),
        ] = None,
        timeout_s: Annotated[
            int,
            Field(
                default=DEFAULT_TIMEOUT_S,
                description=(
                    'Maximum seconds to wait for the conversation to start. If the '
                    'timeout elapses, the start_task_id is returned so the caller '
                    'can resume polling.'
                ),
                ge=10,
                le=3600,
            ),
        ] = DEFAULT_TIMEOUT_S,
    ) -> dict[str, Any]:
        """Start a new OpenHands conversation with ``prompt`` and wait for it to be ready."""
        async with OpenHandsRestClient(cfg) as client:
            try:
                start_task = await client.start_conversation(
                    prompt=prompt, selected_repository=selected_repository
                )
            except OpenHandsRestError as e:
                raise ToolError(str(e)) from e

            start_task_id = start_task.get('id')
            if not start_task_id:
                raise ToolError(
                    f'OpenHands did not return a start task id: {start_task!r}'
                )

            try:
                final = await client.wait_for_ready(start_task_id, timeout_s=timeout_s)
            except OpenHandsRestError as e:
                raise ToolError(str(e)) from e
            except TimeoutError:
                # Return the in-flight task so the caller can poll later.
                in_flight = await client.get_start_task(start_task_id) or start_task
                result = _format_run_result(in_flight)
                result['timed_out'] = True
                return result

            return _format_run_result(final)

    @mcp.tool()
    async def openhands_get_conversation(
        conversation_id: Annotated[
            str, Field(description='The OpenHands conversation UUID to fetch.')
        ],
    ) -> dict[str, Any]:
        """Fetch the current status and metadata of an OpenHands conversation."""
        async with OpenHandsRestClient(cfg) as client:
            try:
                conversation = await client.get_conversation(conversation_id)
            except OpenHandsRestError as e:
                raise ToolError(str(e)) from e

        if conversation is None:
            raise ToolError(f'Conversation {conversation_id} not found.')
        return conversation

    return mcp


def main() -> None:
    """Entry point used by the ``openhands-mcp`` console script."""
    log_level = os.environ.get('OPENHANDS_MCP_LOG_LEVEL', 'INFO').upper()
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        stream=sys.stderr,  # stdout is reserved for the MCP protocol
    )

    try:
        server = build_server()
    except OpenHandsRestError as e:
        logger.error('%s', e)
        sys.exit(2)

    server.run(transport='stdio')


if __name__ == '__main__':
    main()
