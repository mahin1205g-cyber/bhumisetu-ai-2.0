"""Chat orchestration tests with the provider and database paths isolated."""

from backend.chat_service import LandAIChatService, detect_language


def _run_immediate_coroutine(coroutine):
    """Drive this fully mocked coroutine without opening Windows loop sockets."""
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("Mocked chat completion unexpectedly performed asynchronous I/O")


def test_platform_context_is_passed_to_model_and_labeled(monkeypatch):
    service = LandAIChatService()
    captured = {}

    monkeypatch.setattr(
        service,
        "_config",
        lambda: {"provider": "gemini", "model": "test-model", "base_url": "https://example.invalid"},
    )

    async def fake_completion(system_prompt, messages, cfg):
        captured["prompt"] = system_prompt
        captured["messages"] = messages
        return "দলিল যাচাই ফর্মে দলিল ও জমির তথ্য দিন। ফলটি অ্যাপ ডেটাবেজের সঙ্গে তুলনা, সরকারি যাচাই নয়।"

    monkeypatch.setattr(service, "_request_completion", fake_completion)
    result = _run_immediate_coroutine(service.generate_response(
        "দলিল যাচাই কীভাবে করব?",
        user={"id": 17, "role": "citizen"},
        current_page="deed-verify",
    ))

    assert "Retrieved Bhumisetu platform knowledge" in captured["prompt"]
    assert "#/deed-verify" in captured["prompt"]
    assert result["grounding"]["kind"] == "platform"
    assert result["context_used"] is True


def test_general_question_does_not_receive_platform_knowledge(monkeypatch):
    service = LandAIChatService()
    captured = {}
    monkeypatch.setattr(
        service,
        "_config",
        lambda: {"provider": "gemini", "model": "test-model", "base_url": "https://example.invalid"},
    )

    async def fake_completion(system_prompt, messages, cfg):
        captured["prompt"] = system_prompt
        return "Photosynthesis converts light energy into chemical energy."

    monkeypatch.setattr(service, "_request_completion", fake_completion)
    result = _run_immediate_coroutine(service.generate_response("Explain photosynthesis simply."))

    assert "Feature: " not in captured["prompt"]
    assert "#/deed-verify" not in captured["prompt"]
    assert result["grounding"]["kind"] == "general"
    assert result["context_used"] is False


def test_exact_private_record_requires_authenticated_user_without_database_lookup():
    service = LandAIChatService()
    result = service._tool_context("Please show deed D-1001", None, None)
    assert result["kind"] == "auth_required"
    assert result["grounding"]["kind"] == "unavailable"


def test_language_detection_covers_bengali_english_and_banglish():
    assert detect_language("আমি কীভাবে নামজারি করব?") == "bn"
    assert detect_language("Ami OOP shikhte chai") == "bn"
    assert detect_language("Explain object-oriented programming") == "en"

