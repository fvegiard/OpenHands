import pytest
from unittest.mock import patch, MagicMock

from openhands.utils.llm import HybridRouter

@pytest.fixture
def mock_litellm():
    with patch("openhands.utils.llm.litellm.acompletion") as mock:
        yield mock

@pytest.fixture
def mock_httpx():
    with patch("openhands.utils.llm.httpx.get") as mock:
        yield mock

class TestHybridRouter:
    @pytest.mark.asyncio
    async def test_local_available_routes_to_local(self, mock_litellm, mock_httpx):
        # Setup mock to simulate Ollama running with the model
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "qwen3.6:35b-a3b-q4_K_M"}]}
        mock_httpx.return_value = mock_response

        # Setup mock litellm response
        mock_litellm.return_value = {"choices": [{"message": {"content": "Local model response"}}]}

        router = HybridRouter()
        messages = [{"role": "user", "content": "Hello"}]
        
        response = await router.completion(messages=messages)
        
        # Verify it tried to use the local model
        mock_litellm.assert_called_once()
        args, kwargs = mock_litellm.call_args
        assert kwargs["model"] == "ollama/qwen3.6:35b-a3b-q4_K_M"

    @pytest.mark.asyncio
    async def test_local_unavailable_routes_to_cloud(self, mock_litellm, mock_httpx):
        # Setup mock to simulate Ollama NOT having the model
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "llama3:8b"}]}
        mock_httpx.return_value = mock_response

        # Setup mock litellm response
        mock_litellm.return_value = {"choices": [{"message": {"content": "Cloud model response"}}]}

        router = HybridRouter()
        messages = [{"role": "user", "content": "Hello"}]
        
        response = await router.completion(messages=messages)
        
        # Verify it used the fallback cloud model
        mock_litellm.assert_called_once()
        args, kwargs = mock_litellm.call_args
        assert kwargs["model"] == "gemini-3.1-pro"

    @pytest.mark.asyncio
    async def test_high_complexity_routes_to_cloud(self, mock_litellm, mock_httpx):
        # Even if local is available, high complexity should force cloud
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "qwen3.6:35b-a3b-q4_K_M"}]}
        mock_httpx.return_value = mock_response

        mock_litellm.return_value = {"choices": [{"message": {"content": "Cloud model response"}}]}

        router = HybridRouter()
        messages = [{"role": "user", "content": "Hello"}]
        
        response = await router.completion(messages=messages, complexity="high")
        
        # Verify it used the fallback cloud model
        mock_litellm.assert_called_once()
        args, kwargs = mock_litellm.call_args
        assert kwargs["model"] == "gemini-3.1-pro"
        assert "complexity" not in kwargs

    @pytest.mark.asyncio
    async def test_local_failure_falls_back_to_cloud(self, mock_litellm, mock_httpx):
        # Local is available
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"models": [{"name": "qwen3.6:35b-a3b-q4_K_M"}]}
        mock_httpx.return_value = mock_response

        # But litellm call fails the first time
        mock_litellm.side_effect = [Exception("Local inference failed"), {"choices": [{"message": {"content": "Cloud fallback response"}}]}]

        router = HybridRouter()
        messages = [{"role": "user", "content": "Hello"}]
        
        response = await router.completion(messages=messages)
        
        # Verify it tried local, then fell back to cloud
        assert mock_litellm.call_count == 2
        
        first_call_kwargs = mock_litellm.call_args_list[0][1]
        assert first_call_kwargs["model"] == "ollama/qwen3.6:35b-a3b-q4_K_M"
        
        second_call_kwargs = mock_litellm.call_args_list[1][1]
        assert second_call_kwargs["model"] == "gemini-3.1-pro"
