"""Private staging, storage and optional evidence-grounded Gemini extraction.

OCR itself remains in ocr_service (Tesseract/PyMuPDF and searchable PDF text).
This module never treats OCR or AI suggestions as legal verification.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import unicodedata
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx


MAX_STAGED_AGE = timedelta(hours=12)
MAX_AI_TEXT = 30_000
_TOKEN_RE = re.compile(r"^[a-f0-9]{32}$")
AI_FIELDS = (
    "deed_no", "deed_type", "reg_date", "reg_year", "sub_registry_office",
    "division", "district", "upazila", "mouza", "union_ward", "seller_name",
    "buyer_name", "previous_owner", "current_owner", "khatian_no", "plot_id",
    "area", "area_unit", "price", "land_class", "land_description",
    "boundary_information",
)


def storage_root() -> Path:
    configured = os.environ.get("DEED_STORAGE_DIR", "").strip()
    root = Path(configured).expanduser() if configured else Path(__file__).resolve().parent / "var" / "deed-storage"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _safe_stage_paths(token: str) -> tuple[Path, Path]:
    if not _TOKEN_RE.fullmatch(str(token or "")):
        raise ValueError("Invalid scan token")
    stage_dir = storage_root() / "staging"
    return stage_dir / f"{token}.upload", stage_dir / f"{token}.json"


def stage_document(filename: str, contents: bytes, owner_id: int, raw_text: str, ai_extraction_used: bool = False, content_type: str = "") -> str:
    token = uuid.uuid4().hex
    upload_path, manifest_path = _safe_stage_paths(token)
    upload_path.parent.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename or "document").name[:180]
    manifest = {
        "owner_user_id": int(owner_id),
        "original_filename": safe_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "byte_length": len(contents),
        "content_type": content_type or "application/octet-stream",
        "ocr_text": raw_text,
        "ai_extraction_used": bool(ai_extraction_used),
    }
    try:
        upload_path.write_bytes(contents)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    except OSError:
        upload_path.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)
        raise
    return token


def read_staged_document(token: str, owner_id: int) -> tuple[dict[str, Any], Path]:
    upload_path, manifest_path = _safe_stage_paths(token)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        created_at = datetime.fromisoformat(manifest["created_at"])
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created_at > MAX_STAGED_AGE:
            raise ValueError("The uploaded document session has expired. Upload it again.")
        if int(manifest["owner_user_id"]) != int(owner_id):
            raise PermissionError("This uploaded document belongs to another user")
        if not upload_path.is_file():
            raise FileNotFoundError("The staged document is no longer available")
        return manifest, upload_path
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise FileNotFoundError("The uploaded document is no longer available. Upload it again.") from exc


def promote_staged_document(token: str, owner_id: int, deed_id: int, filename: str) -> tuple[str, Path]:
    _, staged_path = read_staged_document(token, owner_id)
    extension = Path(filename or "").suffix.lower()
    if extension not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise ValueError("Unsupported document extension")
    relative = Path("deeds") / str(int(deed_id)) / f"original{extension}"
    target = (storage_root() / relative).resolve()
    root = storage_root()
    if root not in target.parents:
        raise ValueError("Invalid deed document path")
    if target.exists():
        raise FileExistsError("An original document already exists for this deed")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(staged_path), str(target))
    return relative.as_posix(), target


def promote_staged_application(token: str, owner_id: int, application_id: int, filename: str) -> tuple[str, Path]:
    """Move a staged upload into private application storage before DB commit."""
    _, staged_path = read_staged_document(token, owner_id)
    extension = Path(filename or "").suffix.lower()
    if extension not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise ValueError("Unsupported document extension")
    relative = Path("applications") / str(int(application_id)) / f"{uuid.uuid4().hex}{extension}"
    root = storage_root()
    target = (root / relative).resolve()
    if root not in target.parents:
        raise ValueError("Invalid application document path")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError("Application document path already exists")
    shutil.move(str(staged_path), str(target))
    return relative.as_posix(), target


def restore_promoted_application(token: str, target: Path) -> None:
    """Restore staged upload if the referencing application transaction rolls back."""
    try:
        upload_path, _ = _safe_stage_paths(token)
        upload_path.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and not upload_path.exists():
            shutil.move(str(target), str(upload_path))
        target.parent.rmdir()
    except OSError:
        pass


def restore_promoted_document(token: str, target: Path) -> None:
    """Return the staged bytes if the database transaction that references them rolls back."""
    try:
        upload_path, _ = _safe_stage_paths(token)
        upload_path.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and not upload_path.exists():
            shutil.move(str(target), str(upload_path))
        target.parent.rmdir()
        target.parent.parent.rmdir()
    except OSError:
        pass


def finalize_stage(token: str) -> None:
    try:
        _, manifest_path = _safe_stage_paths(token)
        manifest_path.unlink(missing_ok=True)
    except ValueError:
        return


def resolve_storage_path(relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    root = storage_root()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def remove_staged_document(token: str, owner_id: int) -> None:
    try:
        _, upload_path = read_staged_document(token, owner_id)
        _, manifest_path = _safe_stage_paths(token)
        upload_path.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)
    except (ValueError, FileNotFoundError):
        return


def _comparison_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    return " ".join(value.split()).casefold()


def _parse_json_response(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE)
    try:
        decoded = json.loads(candidate)
    except json.JSONDecodeError:
        first, last = candidate.find("{"), candidate.rfind("}")
        if first < 0 or last <= first:
            raise ValueError("Gemini did not return structured JSON")
        decoded = json.loads(candidate[first:last + 1])
    if not isinstance(decoded, dict):
        raise ValueError("Gemini returned an invalid extraction object")
    return decoded


async def suggest_fields_with_gemini(raw_text: str) -> dict[str, Any]:
    """Return only suggestions supported by a verbatim OCR evidence span."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    model = os.environ.get("GEMINI_MODEL", "").strip() or "gemini-3.8-flash"
    if not key:
        return {"status": "not_configured", "model": None, "fields": {}, "message": "Gemini is not configured on the backend."}
    source_text = str(raw_text or "")[:MAX_AI_TEXT]
    prompt = (
        "Extract deed details from OCR text into JSON only. Never infer missing data, repair legal names, "
        "or use outside knowledge. For each supported field return {\"value\": string, \"evidence\": string}; "
        "evidence must be copied exactly from the OCR text. Omit unknown fields. Do not decide ownership, "
        "registration validity, or legal status. Allowed field keys: " + ", ".join(AI_FIELDS) + "\nOCR text:\n" + source_text
    )
    payload = {
        "systemInstruction": {"parts": [{"text": "You are a cautious deed OCR extraction helper. Return evidence-grounded JSON only."}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
            **({"thinkingConfig": {"thinkingLevel": "low"}} if model == "gemini-3.8-flash" else {}),
        },
    }
    timeout = httpx.Timeout(60.0, connect=10.0)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers={"x-goog-api-key": key}, json=payload)
        if response.status_code >= 400:
            status_code = response.status_code
            if status_code == 429:
                status = "rate_limited"
            elif status_code in {401, 403}:
                status = "invalid_credentials_or_access"
            elif status_code == 404:
                status = "model_unavailable"
            elif status_code in {500, 502, 503, 504}:
                status = "provider_unavailable"
            else:
                status = "provider_error"
            return {"status": status, "model": model, "fields": {}, "http_status": status_code}
        data = response.json()
        text = "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"])
        response_data = _parse_json_response(text)
    except (httpx.TimeoutException, httpx.TransportError):
        return {"status": "timeout_or_network_error", "model": model, "fields": {}}
    except (ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        return {"status": "invalid_response", "model": model, "fields": {}}

    source = _comparison_text(source_text)
    suggestions: dict[str, dict[str, str]] = {}
    for field in AI_FIELDS:
        item = response_data.get(field)
        if not isinstance(item, dict):
            continue
        value = str(item.get("value") or "").strip()
        evidence = str(item.get("evidence") or "").strip()
        if not value or not evidence or len(value) > 500 or len(evidence) > 600:
            continue
        normalized_evidence = _comparison_text(evidence)
        normalized_value = _comparison_text(value)
        if normalized_evidence not in source or not normalized_value or normalized_value not in normalized_evidence:
            continue
        suggestions[field] = {"value": value, "evidence": evidence}
    return {"status": "available", "model": model, "fields": suggestions}
