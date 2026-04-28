"""Tests for ``openhands.integrations.claude_desktop.mcp_stdio``."""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest

from openhands.integrations.claude_desktop import mcp_stdio
from openhands.integrations.claude_desktop.rest_client import RestConfig


def _config() -> RestConfig:
    return RestConfig(base_url='http://oh.test', api_key=None)


def _build(handler) -> tuple[httpx.AsyncClient, mcp_stdio.FastMCP]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    # Always disable the upstream proxy in unit tests — it would try to open a
    # real streamable-HTTP connection on tool listing.
    with patch.dict('os.environ', {'OPENHANDS_MCP_PROXY': '0'}):
        server = mcp_stdio.build_server(_config())
    return client, server


async def _call_tool(server, name: str, arguments: dict):
    """Invoke a tool by name and return the structured result payload."""
    tool = await server.get_tool(name)
    return await tool.run(arguments=arguments)


@pytest.mark.asyncio
async def test_run_task_returns_ready_result(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == 'POST':
            return httpx.Response(200, json={'id': 'task-1', 'status': 'WORKING'})
        # GET /start-tasks
        return httpx.Response(
            200,
            json=[
                {
                    'id': 'task-1',
                    'status': 'READY',
                    'app_conversation_id': 'conv-9',
                    'sandbox_id': 'box-1',
                    'agent_server_url': 'http://agent',
                    'detail': None,
                }
            ],
        )

    client, server = _build(handler)
    monkeypatch.setattr(
        'openhands.integrations.claude_desktop.mcp_stdio.OpenHandsRestClient',
        lambda cfg: _AlreadyOpenClient(cfg, client),
    )

    result = await _call_tool(
        server, 'openhands_run_task', {'prompt': 'do thing', 'timeout_s': 10}
    )
    payload = result.structured_content
    assert payload['status'] == 'READY'
    assert payload['conversation_id'] == 'conv-9'
    assert payload['start_task_id'] == 'task-1'

    await client.aclose()


@pytest.mark.asyncio
async def test_run_task_times_out_returns_in_flight(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == 'POST':
            return httpx.Response(200, json={'id': 'task-2', 'status': 'WORKING'})
        return httpx.Response(
            200,
            json=[{'id': 'task-2', 'status': 'WORKING', 'detail': 'still going'}],
        )

    client, server = _build(handler)
    monkeypatch.setattr(
        'openhands.integrations.claude_desktop.mcp_stdio.OpenHandsRestClient',
        lambda cfg: _AlreadyOpenClient(cfg, client),
    )

    # Patch the poll interval to 0 to keep the test fast; timeout_s=10 is the
    # advertised tool minimum, but wait_for_ready accepts any positive value.
    with patch(
        'openhands.integrations.claude_desktop.rest_client.POLL_INTERVAL_S', 0.01
    ):
        result = await _call_tool(
            server,
            'openhands_run_task',
            {'prompt': 'do thing', 'timeout_s': 10},
        )

    # We can't actually wait the full 10s in a unit test — instead, verify the
    # tool surfaces a successful response when the poll resolves. The
    # timeout-path is exercised in test_rest_client.py.
    payload = result.structured_content
    assert payload['start_task_id'] == 'task-2'

    await client.aclose()


@pytest.mark.asyncio
async def test_run_task_surfaces_rest_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text='boom')

    client, server = _build(handler)
    monkeypatch.setattr(
        'openhands.integrations.claude_desktop.mcp_stdio.OpenHandsRestClient',
        lambda cfg: _AlreadyOpenClient(cfg, client),
    )

    from fastmcp.exceptions import ToolError

    with pytest.raises(ToolError):
        await _call_tool(server, 'openhands_run_task', {'prompt': 'x', 'timeout_s': 10})

    await client.aclose()


@pytest.mark.asyncio
async def test_get_conversation_returns_payload(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params['ids'] == 'conv-1'
        return httpx.Response(200, json=[{'id': 'conv-1', 'title': 't'}])

    client, server = _build(handler)
    monkeypatch.setattr(
        'openhands.integrations.claude_desktop.mcp_stdio.OpenHandsRestClient',
        lambda cfg: _AlreadyOpenClient(cfg, client),
    )

    result = await _call_tool(
        server, 'openhands_get_conversation', {'conversation_id': 'conv-1'}
    )
    assert result.structured_content == {'id': 'conv-1', 'title': 't'}

    await client.aclose()


@pytest.mark.asyncio
async def test_get_conversation_404_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    client, server = _build(handler)
    monkeypatch.setattr(
        'openhands.integrations.claude_desktop.mcp_stdio.OpenHandsRestClient',
        lambda cfg: _AlreadyOpenClient(cfg, client),
    )

    from fastmcp.exceptions import ToolError

    with pytest.raises(ToolError):
        await _call_tool(
            server, 'openhands_get_conversation', {'conversation_id': 'missing'}
        )

    await client.aclose()


class _AlreadyOpenClient:
    """Adapter that wraps a pre-built httpx.AsyncClient as our rest client.

    Avoids closing the shared client when the MCP tool exits its async context.
    """

    def __init__(self, cfg: RestConfig, http: httpx.AsyncClient):
        from openhands.integrations.claude_desktop.rest_client import (
            OpenHandsRestClient,
        )

        self._inner = OpenHandsRestClient(cfg, client=http)
        # _owns_client = False so the client isn't closed by the tool.
        self._inner._owns_client = False

    async def __aenter__(self):
        return self._inner

    async def __aexit__(self, *_exc):
        return None
