"""Tests for ``openhands.integrations.claude_desktop.rest_client``."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from openhands.integrations.claude_desktop.rest_client import (
    OpenHandsRestClient,
    OpenHandsRestError,
    RestConfig,
)


def _config() -> RestConfig:
    return RestConfig(base_url='http://oh.test', api_key='secret')


def _mock_transport(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_start_conversation_posts_initial_message():
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['url'] = str(request.url)
        captured['headers'] = dict(request.headers)
        captured['json'] = json.loads(request.content) if request.content else None
        return httpx.Response(200, json={'id': 'task-1', 'status': 'WORKING'})

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        result = await client.start_conversation(
            prompt='do a thing', selected_repository='octocat/hello'
        )

    assert result == {'id': 'task-1', 'status': 'WORKING'}
    assert captured['url'] == 'http://oh.test/api/v1/app-conversations'
    assert captured['headers']['authorization'] == 'Bearer secret'
    body = captured['json']
    assert body['initial_message']['role'] == 'user'
    assert body['initial_message']['content'] == [
        {'type': 'text', 'text': 'do a thing'}
    ]
    assert body['selected_repository'] == 'octocat/hello'


@pytest.mark.asyncio
async def test_start_conversation_surfaces_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text='nope')

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        with pytest.raises(OpenHandsRestError) as exc:
            await client.start_conversation(prompt='x')

    assert '401' in str(exc.value)


@pytest.mark.asyncio
async def test_start_conversation_surfaces_network_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom')

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        with pytest.raises(OpenHandsRestError) as exc:
            await client.start_conversation(prompt='x')

    assert 'Could not reach' in str(exc.value)


@pytest.mark.asyncio
async def test_get_start_task_returns_first_item():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/v1/app-conversations/start-tasks'
        assert request.url.params['ids'] == 'task-1'
        return httpx.Response(200, json=[{'id': 'task-1', 'status': 'READY'}])

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        task = await client.get_start_task('task-1')

    assert task == {'id': 'task-1', 'status': 'READY'}


@pytest.mark.asyncio
async def test_get_start_task_handles_empty_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        assert await client.get_start_task('missing') is None


@pytest.mark.asyncio
async def test_wait_for_ready_polls_until_terminal():
    statuses = iter(['WORKING', 'WAITING_FOR_SANDBOX', 'READY'])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[{'id': 't', 'status': next(statuses), 'app_conversation_id': 'c'}],
        )

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        result = await client.wait_for_ready('t', timeout_s=5, poll_interval_s=0)

    assert result['status'] == 'READY'
    assert result['app_conversation_id'] == 'c'


@pytest.mark.asyncio
async def test_wait_for_ready_times_out_when_still_working():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{'id': 't', 'status': 'WORKING'}])

    async with _mock_transport(handler) as http:
        client = OpenHandsRestClient(_config(), client=http)
        with pytest.raises(asyncio.TimeoutError):
            await client.wait_for_ready('t', timeout_s=0.05, poll_interval_s=0.01)


def test_from_env_requires_base_url(monkeypatch):
    monkeypatch.delenv('OPENHANDS_BASE_URL', raising=False)
    with pytest.raises(OpenHandsRestError):
        RestConfig.from_env()


def test_from_env_strips_trailing_slash(monkeypatch):
    monkeypatch.setenv('OPENHANDS_BASE_URL', 'http://oh.test/')
    monkeypatch.setenv('OPENHANDS_API_KEY', 'k')
    cfg = RestConfig.from_env()
    assert cfg.base_url == 'http://oh.test'
    assert cfg.api_v1 == 'http://oh.test/api/v1'
    assert cfg.mcp_url == 'http://oh.test/mcp/mcp'
    assert cfg.headers() == {'Authorization': 'Bearer k'}
