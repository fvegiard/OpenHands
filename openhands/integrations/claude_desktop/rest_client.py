"""Minimal async client for the OpenHands `/api/v1/app-conversations` REST API.

Used by the Claude Desktop stdio MCP shim (see ``mcp_stdio.py``). Kept
deliberately small: only the calls needed for ``openhands_run_task`` and
``openhands_get_conversation`` are implemented.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_TIMEOUT_S = 600
POLL_INTERVAL_S = 2.0
START_TASK_TERMINAL_STATUSES = {'READY', 'ERROR'}


class OpenHandsRestError(RuntimeError):
    """Raised when the OpenHands REST API returns an error or is unreachable."""


@dataclass(frozen=True)
class RestConfig:
    base_url: str
    api_key: str | None = None

    @classmethod
    def from_env(cls) -> 'RestConfig':
        base_url = os.environ.get('OPENHANDS_BASE_URL', '').rstrip('/')
        if not base_url:
            raise OpenHandsRestError(
                'OPENHANDS_BASE_URL is not set. Point it at a running OpenHands '
                'backend (e.g. http://localhost:3000).'
            )
        return cls(base_url=base_url, api_key=os.environ.get('OPENHANDS_API_KEY'))

    @property
    def api_v1(self) -> str:
        return f'{self.base_url}/api/v1'

    @property
    def mcp_url(self) -> str:
        return f'{self.base_url}/mcp/mcp'

    def headers(self) -> dict[str, str]:
        if not self.api_key:
            return {}
        return {'Authorization': f'Bearer {self.api_key}'}


class OpenHandsRestClient:
    """Thin async client around the conversation start/poll endpoints."""

    def __init__(self, config: RestConfig, client: httpx.AsyncClient | None = None):
        self._config = config
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=30.0)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> 'OpenHandsRestClient':
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        await self.aclose()

    async def start_conversation(
        self,
        prompt: str,
        selected_repository: str | None = None,
    ) -> dict[str, Any]:
        """POST /api/v1/app-conversations and return the start-task payload."""
        body: dict[str, Any] = {
            'initial_message': {
                'role': 'user',
                'content': [{'type': 'text', 'text': prompt}],
                'run': True,
            },
        }
        if selected_repository:
            body['selected_repository'] = selected_repository

        return await self._post_json('/app-conversations', body)

    async def get_start_task(self, start_task_id: str) -> dict[str, Any] | None:
        """GET /api/v1/app-conversations/start-tasks?ids=<id>."""
        results = await self._get_json(
            '/app-conversations/start-tasks', params={'ids': start_task_id}
        )
        if not isinstance(results, list) or not results:
            return None
        return results[0]

    async def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        """GET /api/v1/app-conversations?ids=<id>."""
        results = await self._get_json(
            '/app-conversations', params={'ids': conversation_id}
        )
        if not isinstance(results, list) or not results:
            return None
        return results[0]

    async def wait_for_ready(
        self,
        start_task_id: str,
        timeout_s: float,
        poll_interval_s: float = POLL_INTERVAL_S,
    ) -> dict[str, Any]:
        """Poll a start task until it reaches a terminal status or times out.

        Returns the final start-task payload. Raises :class:`asyncio.TimeoutError`
        if ``timeout_s`` elapses while still WORKING.
        """

        async def _poll() -> dict[str, Any]:
            while True:
                task = await self.get_start_task(start_task_id)
                if task is None:
                    raise OpenHandsRestError(
                        f'Start task {start_task_id} not found while polling.'
                    )
                if task.get('status') in START_TASK_TERMINAL_STATUSES:
                    return task
                await asyncio.sleep(poll_interval_s)

        return await asyncio.wait_for(_poll(), timeout=timeout_s)

    async def _post_json(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f'{self._config.api_v1}{path}'
        try:
            response = await self._client.post(
                url, json=body, headers=self._config.headers()
            )
        except httpx.RequestError as e:
            raise OpenHandsRestError(f'Could not reach OpenHands at {url}: {e}') from e
        return _decode(response, url)

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f'{self._config.api_v1}{path}'
        try:
            response = await self._client.get(
                url, params=params, headers=self._config.headers()
            )
        except httpx.RequestError as e:
            raise OpenHandsRestError(f'Could not reach OpenHands at {url}: {e}') from e
        return _decode(response, url)


def _decode(response: httpx.Response, url: str) -> Any:
    if response.status_code >= 400:
        raise OpenHandsRestError(
            f'OpenHands responded {response.status_code} for {url}: '
            f'{response.text[:500]}'
        )
    if not response.content:
        return None
    return response.json()
