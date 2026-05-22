import pytest
from openhands.integrations.antigravity.mcp_server import openhands_execute_task, openhands_get_status

class TestMCPServer:
    @pytest.mark.asyncio
    async def test_openhands_execute_task(self):
        result = await openhands_execute_task("test task", "/test/workspace")
        assert "Task successfully delegated to OpenHands Agent." in result

    @pytest.mark.asyncio
    async def test_openhands_get_status(self):
        result = await openhands_get_status("session_123")
        assert "Status: running" in result
