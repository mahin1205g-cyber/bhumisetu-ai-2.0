"""Offline regression tests for temporary Gemini/LLM provider overloads."""

import pytest
import httpx

from backend.chat_service import LandAIChatService, LLMError


def _run_immediate_coroutine(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("The mocked provider path unexpectedly performed I/O")


def test_http_503_maps_to_retryable_provider_unavailable():
    response = httpx.Response(503, json={"error": {"status": "UNAVAILABLE", "message": "High demand"}})
    with pytest.raises(LLMError) as caught:
        LandAIChatService._check_status(response)
    assert caught.value.code == "provider_unavailable"
    assert caught.value.http_status == 503
    assert caught.value.retryable is True


def test_provider_503_is_not_replayed_automatically():
    error = LLMError("provider_unavailable", "503: high demand", retryable=True, http_status=503)
    assert LandAIChatService._transient_retry_delay(error) is None


def test_provider_503_returns_clear_message_without_fake_completion(monkeypatch):
    service = LandAIChatService()
    monkeypatch.setattr(
        service,
        "_config",
        lambda: {"provider": "gemini", "model": "gemini-3.8-flash", "base_url": "https://example.invalid"},
    )

    async def overloaded(*_args):
        raise LLMError("provider_unavailable", "503: high demand", retryable=True, http_status=503)

    monkeypatch.setattr(service, "_request_completion", overloaded)
    result = _run_immediate_coroutine(service.generate_response("Hi"))
    assert result["error"]["code"] == "provider_unavailable"
    assert result["error"]["retryable"] is True
    assert "high demand" in result["reply"].lower()
