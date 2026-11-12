"""Authenticated deed application, review, and approved-copy workflow.

OCR output is retained as applicant-submitted draft evidence. Pending applications
never enter the canonical ``deeds`` table; approval promotes them transactionally.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from psycopg.errors import UndefinedTable


class DigitizationParty(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    role: Literal["seller", "buyer", "previous_owner", "current_owner"]
    ownership_share: Optional[float] = Field(default=None, ge=0, le=100)


class DigitizationParcel(BaseModel):
    division_id: Optional[int] = Field(default=None, gt=0)
    district_id: Optional[int] = Field(default=None, gt=0)
    location_id: Optional[int] = Field(default=None, gt=0)
    location_type: Optional[Literal["upazila", "police_thana"]] = None
    mouza_id: Optional[int] = Field(default=None, gt=0)
    union_id: Optional[int] = Field(default=None, gt=0)
    division: str = Field(default="", max_length=120)
    district: str = Field(default="", max_length=120)
    upazila: str = Field(default="", max_length=120)
    mouza: str = Field(default="", max_length=160)
    union_ward: str = Field(default="", max_length=160)
    plot_id: str = Field(default="", max_length=100)
    khatian_no: str = Field(default="", max_length=100)
    area: Optional[float] = Field(default=None, gt=0)
    area_unit: str = Field(default="shotok", max_length=40)
    price: Optional[float] = Field(default=None, ge=0)
    land_class: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=2000)
    boundary_information: str = Field(default="", max_length=2000)


class DeedDigitizationRequest(BaseModel):
    deed_no: str = Field(min_length=1, max_length=120)
    reg_year: int = Field(ge=1800, le=2200)
    deed_type: str = Field(min_length=1, max_length=60)
    reg_date: str = Field(min_length=1, max_length=80)
    sub_registry_office: str = Field(min_length=2, max_length=160)
    division_id: int = Field(gt=0)
    district_id: int = Field(gt=0)
    location_id: int = Field(gt=0)
    location_type: Literal["upazila", "police_thana"]
    division: str = Field(default="", max_length=120)
    district: str = Field(min_length=1, max_length=120)
    upazila: str = Field(min_length=1, max_length=120)
    mouza_id: Optional[int] = Field(default=None, gt=0)
    mouza: str = Field(min_length=1, max_length=160)
    union_id: Optional[int] = Field(default=None, gt=0)
    union_ward: str = Field(default="", max_length=160)
    plot_id: str = Field(min_length=1, max_length=100)
    khatian_no: str = Field(min_length=1, max_length=100)
    seller_name: str = Field(min_length=2, max_length=200)
    buyer_name: str = Field(min_length=2, max_length=200)
    area: float = Field(gt=0)
    area_unit: str = Field(default="shotok", max_length=40)
    price: float = Field(ge=0)
    previous_owner: str = Field(default="", max_length=200)
    current_owner: str = Field(default="", max_length=200)
    land_class: str = Field(default="", max_length=160)
    land_description: str = Field(default="", max_length=3000)
    boundary_information: str = Field(default="", max_length=3000)
    supplemental_fields: dict = Field(default_factory=dict, max_length=50)
    additional_parties: list[DigitizationParty] = Field(default_factory=list, max_length=50)
    additional_parcels: list[DigitizationParcel] = Field(default_factory=list, max_length=100)
    entry_method: Literal["ocr", "manual"] = "manual"
    scan_token: Optional[str] = Field(default=None, min_length=32, max_length=32)
    review_confirmed: bool = False


class ApplicationDecision(BaseModel):
    action: Literal["under_review", "correction_required", "approved", "rejected", "cancelled"]
    note: str = Field(default="", max_length=4000)


class ApplicationAssignment(BaseModel):
    officer_id: Optional[int] = Field(default=None, gt=0)


class DigitalDeedRevocation(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


def build_router(*, engine, location_service, ocr_service, storage_service, get_user, enforce_upload_rate_limit):
    router = APIRouter(prefix="/api/deed-digitization", tags=["deed-digitization"])
    log = logging.getLogger("bhumisetu.deed_digitization")
    allowed_statuses = {
        "submitted", "under_review", "correction_required", "resubmitted",
        "approved", "digitization_processing", "completed", "rejected", "cancelled",
    }

    def user_from(authorization):
        user = get_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

    def staff(user):
        if user.get("role") not in {"officer", "admin"}:
            raise HTTPException(status_code=403, detail="Officer or admin access required")

    def require_officer_assignment(connection, table_name, key_column, key_value, officer_id):
        if table_name not in {"deed_digitization_applications"} or key_column != "id":
            raise HTTPException(status_code=403, detail="Officer assignment is unavailable.")
        available = connection.execute(
            """SELECT EXISTS (
                   SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s AND column_name='assigned_officer_id'
               ) AS available""",
            (table_name,),
        ).fetchone()["available"]
        if not available:
            raise HTTPException(status_code=403, detail="Officer application assignments are not configured.")
        row = connection.execute(
            f"SELECT 1 FROM {table_name} WHERE {key_column}=%s AND assigned_officer_id=%s LIMIT 1",
            (key_value, int(officer_id)),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Application not found in this officer's assigned scope.")

    def schema_required(exc):
        if isinstance(exc, UndefinedTable):
            raise HTTPException(status_code=503, detail="Deed application workflow schema is not installed. Ask an administrator to apply the reviewed migration.") from exc
        raise exc

    def dump_model(item):
        return item.model_dump() if hasattr(item, "model_dump") else item.dict()

    def safe_media_type(filename):
        return {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}.get(Path(filename or "").suffix.lower(), "application/octet-stream")

    def validate_selection(req):
        if not engine.is_supported_deed_type(req.deed_type):
            raise HTTPException(status_code=422, detail="Select an active deed type from the catalog.")
        try:
            resolved = location_service.resolve_selection(req.district_id, req.location_type, req.location_id, req.mouza_id)
        except location_service.LocationNotFound as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if int(resolved["division_id"]) != int(req.division_id):
            raise HTTPException(status_code=422, detail="Selected district does not belong to the selected division.")
        if req.mouza_id is None and not req.mouza.strip():
            raise HTTPException(status_code=422, detail="Mouza is required.")
        union_id, union_label = None, req.union_ward.strip()
        if req.union_id is not None:
            if req.location_type != "upazila":
                raise HTTPException(status_code=422, detail="A Union can only be selected under an Upazila.")
            with engine.conn() as connection:
                union = location_service.resolve_union_reference(connection, req.location_id, union_label, req.union_id)
            if not union:
                raise HTTPException(status_code=422, detail="Selected Union does not belong to the selected Upazila.")
            union_id = int(union["id"])
            union_label = union.get("name_bn") or union.get("name_en") or union_label
        return resolved, union_id, union_label

    def notify(owner_id, role, status, tracking_id, note=""):
        messages = {
            "submitted": ("দলিল ডিজিটাইজেশন আবেদন জমা হয়েছে", "Deed digitization application submitted", "আবেদন ট্র্যাকিং নম্বর: ", "Tracking ID: "),
            "under_review": ("আবেদন পর্যালোচনায় নেওয়া হয়েছে", "Application is under review", "ট্র্যাকিং নম্বর: ", "Tracking ID: "),
            "correction_required": ("আবেদনে সংশোধন প্রয়োজন", "Application needs correction", "সংশোধনী: ", "Correction: "),
            "resubmitted": ("সংশোধিত আবেদন পুনরায় জমা হয়েছে", "Corrected application resubmitted", "ট্র্যাকিং নম্বর: ", "Tracking ID: "),
            "completed": ("ডিজিটাল দলিল তৈরি হয়েছে", "Digital deed is ready", "ডিজিটাল কপি আপনার অ্যাকাউন্টে পাওয়া যাবে। ট্র্যাকিং: ", "The digital copy is available in your account. Tracking: "),
            "rejected": ("আবেদন প্রত্যাখ্যান করা হয়েছে", "Application rejected", "কারণ: ", "Reason: "),
            "cancelled": ("আবেদন বাতিল হয়েছে", "Application cancelled", "ট্র্যাকিং নম্বর: ", "Tracking ID: "),
        }
        title_bn, title_en, prefix_bn, prefix_en = messages.get(status, messages["submitted"])
        engine.add_notification(owner_id, "citizen", title_bn, title_en, prefix_bn + (note or tracking_id), prefix_en + (note or tracking_id), "info", "#deed-digitization")

    def application_row(connection, app_id, user, lock=False):
        suffix = " FOR UPDATE" if lock else ""
        row = connection.execute("SELECT * FROM deed_digitization_applications WHERE id=%s" + suffix, (app_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Application not found.")
        if int(row["owner_user_id"]) != int(user["id"]):
            if user.get("role") == "admin":
                pass
            elif user.get("role") == "officer":
                require_officer_assignment(connection, "deed_digitization_applications", "id", app_id, int(user["id"]))
            else:
                raise HTTPException(status_code=403, detail="Cannot access another user's application.")
        return dict(row)

    def safe_application(row, include_data=True):
        result = {key: row.get(key) for key in ("id", "tracking_id", "status", "entry_method", "submitted_at", "updated_at", "finalized_deed_id")}
        if include_data:
            result["deed_data"] = row.get("deed_data") or {}
            result["ocr_text"] = row.get("ocr_text") or ""
            result["ai_extraction_used"] = bool(row.get("ai_extraction_used"))
        return result

    def stage_error(exc):
        if isinstance(exc, PermissionError):
            raise HTTPException(status_code=403, detail="This scan belongs to another user.") from exc
        if isinstance(exc, (ValueError, FileNotFoundError)):
            raise HTTPException(status_code=410, detail=str(exc)) from exc

    @router.post("/scan")
    async def scan_document(request: Request, file: UploadFile = File(...), use_ai: bool = Form(False), authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        filename = Path(file.filename or "document").name
        try:
            enforce_upload_rate_limit(request.client.host if request.client else "unknown", user["id"], "digitization")
            contents = await file.read(10 * 1024 * 1024 + 1)
            if len(contents) > 10 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Uploaded file exceeds the 10 MB limit")
            extraction = await asyncio.to_thread(ocr_service.extract_document_text, filename, contents)
            extracted = await asyncio.to_thread(ocr_service.parse_deed_fields, extraction.text)
            ai = await storage_service.suggest_fields_with_gemini(extraction.text) if use_ai else {"status": "not_requested", "fields": {}}
            token = await asyncio.to_thread(storage_service.stage_document, filename, contents, int(user["id"]), extraction.text, ai.get("status") == "available", file.content_type or "application/octet-stream")
        except HTTPException:
            raise
        except ocr_service.DocumentProcessingError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        except Exception as exc:
            log.exception("Deed OCR scan failed (%s)", type(exc).__name__)
            raise HTTPException(status_code=500, detail="The document could not be prepared for review.") from exc
        finally:
            await file.close()
        recognized = sum(bool(value) for key, value in extracted.items() if key not in {"reg_year", "area", "price", "upazila_type"})
        recognized += int(extracted.get("reg_year") is not None)
        return {"scan_token": token, "filename": filename, "extracted_fields": extracted,
                "ai_suggestions": ai.get("fields", {}), "ai_status": ai.get("status", "not_requested"),
                "ai_model": ai.get("model"), "ocr_warnings": extraction.warnings,
                "raw_text_preview": extraction.text[:5000], "recognized_field_count": recognized,
                "review_required": True, "verification_status": "not_run",
                "message_bn": "OCR-এর তথ্য আবেদন হিসেবে জমা হবে; অনুমোদনের আগে এটি মূল deeds ডেটাবেজে যোগ হবে না।",
                "message_en": "OCR details are submitted as an application and do not enter the canonical deeds table before approval."}

    @router.delete("/scan/{scan_token}")
    def discard_scan(scan_token: str, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        try:
            storage_service.remove_staged_document(scan_token, int(user["id"]))
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail="This scan belongs to another user.") from exc
        return {"discarded": True}

    @router.post("/applications", status_code=201)
    def submit_application(req: DeedDigitizationRequest, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        if req.entry_method == "ocr" and not req.scan_token:
            raise HTTPException(status_code=422, detail="Scan the original document before submitting an OCR application.")
        if req.entry_method == "manual" and req.scan_token:
            raise HTTPException(status_code=422, detail="Manual applications cannot reference an OCR scan session.")
        resolved, union_id, union_label = validate_selection(req)
        staged = None
        staged_path = None
        if req.scan_token:
            try:
                staged, staged_path = storage_service.read_staged_document(req.scan_token, int(user["id"]))
            except (PermissionError, ValueError, FileNotFoundError) as exc:
                stage_error(exc)
        deed_data = dump_model(req)
        deed_data.pop("scan_token", None)
        deed_data.pop("review_confirmed", None)
        deed_data.update({"division": resolved["division"], "district": resolved["district"], "upazila": resolved["location"],
                          "union_id": union_id, "union_ward": union_label,
                          "mouza": resolved.get("mouza") or req.mouza.strip(),
                          "supplemental_fields": {"area_unit": req.area_unit, "previous_owner": req.previous_owner,
                              "current_owner": req.current_owner, "land_class": req.land_class,
                              "land_description": req.land_description, "boundary_information": req.boundary_information,
                              **req.supplemental_fields},
                          "additional_parties": [dump_model(item) for item in req.additional_parties],
                          "additional_parcels": [dump_model(item) for item in req.additional_parcels]})
        moved_path = None
        try:
            with engine.conn() as connection:
                row = connection.execute(
                    """INSERT INTO deed_digitization_applications
                       (tracking_year,owner_user_id,status,entry_method,deed_data,ocr_text,ai_extraction_used,submitted_at,updated_at)
                       VALUES (EXTRACT(YEAR FROM NOW())::INTEGER,%s,'submitted',%s,%s::jsonb,%s,%s,NOW(),NOW())
                       RETURNING id,tracking_id,status,submitted_at""",
                    (int(user["id"]), req.entry_method, json.dumps(deed_data, ensure_ascii=False),
                     staged.get("ocr_text", "") if staged else "", bool(staged and staged.get("ai_extraction_used"))),
                ).fetchone()
                app_id = int(row["id"])
                if staged:
                    relative, moved_path = storage_service.promote_staged_application(req.scan_token, int(user["id"]), app_id, staged.get("original_filename", "document"))
                    connection.execute(
                        """INSERT INTO deed_digitization_documents(application_id,uploaded_by,original_filename,content_type,byte_length,storage_path,created_at)
                           VALUES (%s,%s,%s,%s,%s,%s,NOW())""",
                        (app_id, int(user["id"]), staged.get("original_filename", "document"), safe_media_type(staged.get("original_filename", "")), int(staged.get("byte_length", 0)), relative),
                    )
                connection.execute(
                    """INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at)
                       VALUES (%s,%s,%s,NULL,'submitted','Application submitted',NOW())""",
                    (app_id, int(user["id"]), user.get("role", "citizen")),
                )
        except UndefinedTable as exc:
            if moved_path:
                storage_service.restore_promoted_application(req.scan_token, moved_path)
            schema_required(exc)
        except Exception:
            if moved_path:
                storage_service.restore_promoted_application(req.scan_token, moved_path)
            raise
        if req.scan_token:
            storage_service.finalize_stage(req.scan_token)
        engine.log_audit(user.get("name", ""), user.get("role", ""), "submitted", "deed_digitization", f"application={row['tracking_id']}")
        notify(int(user["id"]), "citizen", "submitted", row["tracking_id"])
        return {"id": app_id, "tracking_id": row["tracking_id"], "status": row["status"],
                "submitted_at": row["submitted_at"],
                "message_bn": "আবেদন জমা হয়েছে। অনুমোদনের আগে এটি deeds ডেটাবেজে যোগ হবে না।",
                "message_en": "Application submitted. It will not be added to the deeds database before approval."}

    @router.get("/applications/mine")
    def my_applications(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50), authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        try:
            with engine.conn() as connection:
                total = connection.execute("SELECT COUNT(*) AS total FROM deed_digitization_applications WHERE owner_user_id=%s", (int(user["id"]),)).fetchone()["total"]
                rows = connection.execute(
                    """SELECT id,tracking_id,status,entry_method,submitted_at,updated_at,finalized_deed_id
                       FROM deed_digitization_applications WHERE owner_user_id=%s ORDER BY submitted_at DESC,id DESC LIMIT %s OFFSET %s""",
                    (int(user["id"]), page_size, (page - 1) * page_size),
                ).fetchall()
                counts = connection.execute("SELECT status,COUNT(*) AS count FROM deed_digitization_applications WHERE owner_user_id=%s GROUP BY status", (int(user["id"]),)).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size,
                "counts": {status: sum(int(row["count"]) for row in counts if row["status"] == status) for status in allowed_statuses}}

    @router.get("/applications/review-queue")
    def review_queue(status: Optional[str] = Query(None), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50), authorization: Optional[str] = Header(None)):
        user = user_from(authorization); staff(user)
        if status and status not in allowed_statuses:
            raise HTTPException(status_code=422, detail="Unknown application status.")
        where = "WHERE status = %s" if status else "WHERE status IN ('submitted','resubmitted','under_review')"
        params = [status] if status else []
        try:
            with engine.conn() as connection:
                assignment_configured = True
                if user.get("role") == "officer":
                    assignment_configured = bool(connection.execute(
                        """SELECT EXISTS (
                               SELECT 1 FROM information_schema.columns
                               WHERE table_schema='public' AND table_name='deed_digitization_applications'
                                 AND column_name='assigned_officer_id'
                           ) AS available"""
                    ).fetchone()["available"])
                    if assignment_configured:
                        where += " AND a.assigned_officer_id = %s"
                        params.append(int(user["id"]))
                    else:
                        where += " AND FALSE"
                query_where = where.replace("status", "a.status")
                total = connection.execute("SELECT COUNT(*) AS total FROM deed_digitization_applications a " + where, params).fetchone()["total"]
                rows = connection.execute(
                    """SELECT a.id,a.tracking_id,a.owner_user_id,u.name AS applicant_name,u.username AS applicant_username,
                              a.assigned_officer_id,officer.name AS assigned_officer_name,officer.username AS assigned_officer_username,
                              a.status,a.entry_method,a.deed_data,a.submitted_at,a.updated_at
                       FROM deed_digitization_applications a JOIN users u ON u.id=a.owner_user_id
                       LEFT JOIN users officer ON officer.id=a.assigned_officer_id """ + query_where + " ORDER BY a.submitted_at,a.id LIMIT %s OFFSET %s",
                    [*params, page_size, (page - 1) * page_size],
                ).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size,
                "assignment_scope_configured": None if user.get("role") == "admin" else assignment_configured}

    @router.get("/applications/officers")
    def list_application_officers(authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        try:
            with engine.conn() as connection:
                rows = connection.execute(
                    """SELECT id,name,username,designation FROM users
                       WHERE role='officer' ORDER BY LOWER(COALESCE(name,username)),id"""
                ).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        return {"items": [dict(row) for row in rows]}

    @router.post("/applications/{app_id}/assign")
    def assign_application(app_id: int, assignment: ApplicationAssignment, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        officer = None
        tracking_id = None
        try:
            with engine.conn() as connection:
                application = connection.execute(
                    """SELECT id,tracking_id,status,assigned_officer_id
                       FROM deed_digitization_applications WHERE id=%s FOR UPDATE""",
                    (app_id,),
                ).fetchone()
                if not application:
                    raise HTTPException(status_code=404, detail="Application not found.")
                if application["status"] not in {"submitted", "resubmitted", "under_review"}:
                    raise HTTPException(status_code=409, detail="Only pending applications can be assigned.")
                if assignment.officer_id is not None:
                    officer = connection.execute(
                        "SELECT id,name,username FROM users WHERE id=%s AND role='officer'",
                        (assignment.officer_id,),
                    ).fetchone()
                    if not officer:
                        raise HTTPException(status_code=422, detail="Select a valid officer account.")
                next_officer_id = int(officer["id"]) if officer else None
                if application["assigned_officer_id"] == next_officer_id:
                    return {"application_id": app_id, "assigned_officer_id": next_officer_id,
                            "assigned_officer_name": officer["name"] if officer else None,
                            "assigned_officer_username": officer["username"] if officer else None,
                            "unchanged": True}
                connection.execute(
                    "UPDATE deed_digitization_applications SET assigned_officer_id=%s,updated_at=NOW() WHERE id=%s",
                    (next_officer_id, app_id),
                )
                assignment_note = ("Assigned to officer @" + officer["username"]) if officer else "Officer assignment removed by administrator"
                connection.execute(
                    """INSERT INTO deed_digitization_status_history
                       (application_id,actor_user_id,actor_role,from_status,to_status,note,created_at)
                       VALUES (%s,%s,'admin',%s,%s,%s,NOW())""",
                    (app_id, int(user["id"]), application["status"], application["status"], assignment_note),
                )
                tracking_id = application["tracking_id"]
        except UndefinedTable as exc:
            schema_required(exc)
        if officer:
            engine.add_notification(
                int(officer["id"]), "officer",
                "নতুন দলিল আবেদন দায়িত্ব দেওয়া হয়েছে", "A deed application was assigned to you",
                "ট্র্যাকিং নম্বর: " + tracking_id, "Tracking ID: " + tracking_id,
                "info", "#deed-digitization",
            )
        engine.log_audit(user.get("name", ""), "admin", "assigned" if officer else "unassigned",
                         "deed_digitization", f"application={tracking_id}; officer_id={next_officer_id}")
        return {"application_id": app_id, "assigned_officer_id": next_officer_id,
                "assigned_officer_name": officer["name"] if officer else None,
                "assigned_officer_username": officer["username"] if officer else None,
                "unchanged": False}

    @router.get("/applications/{app_id}")
    def application_detail(app_id: int, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        try:
            with engine.conn() as connection:
                row = application_row(connection, app_id, user)
                history = connection.execute("SELECT actor_role,from_status,to_status,note,created_at FROM deed_digitization_status_history WHERE application_id=%s ORDER BY id", (app_id,)).fetchall()
                documents = connection.execute("SELECT id,original_filename,content_type,byte_length,created_at FROM deed_digitization_documents WHERE application_id=%s ORDER BY id", (app_id,)).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        result = safe_application(row)
        result["history"] = [dict(item) for item in history]
        result["documents"] = [dict(item) for item in documents]
        if user.get("role") in {"officer", "admin"}:
            result["owner_user_id"] = row["owner_user_id"]
            with engine.conn() as connection:
                owner = connection.execute("SELECT name,username FROM users WHERE id=%s", (int(row["owner_user_id"]),)).fetchone()
            if owner:
                result["applicant_name"] = owner["name"]
                result["applicant_username"] = owner["username"]
        return result

    @router.get("/track/{tracking_id}")
    def track_own_application(tracking_id: str, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        if len(tracking_id) > 48:
            raise HTTPException(status_code=404, detail="Application not found.")
        try:
            with engine.conn() as connection:
                row = connection.execute("SELECT tracking_id,status,submitted_at,updated_at FROM deed_digitization_applications WHERE owner_user_id=%s AND UPPER(tracking_id)=UPPER(%s)", (int(user["id"]), tracking_id.strip())).fetchone()
        except UndefinedTable as exc:
            schema_required(exc)
        if not row:
            raise HTTPException(status_code=404, detail="Application not found.")
        return dict(row)

    @router.put("/applications/{app_id}/resubmit")
    def resubmit(app_id: int, req: DeedDigitizationRequest, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        resolved, union_id, union_label = validate_selection(req)
        with engine.conn() as connection:
            row = application_row(connection, app_id, user, lock=True)
            if int(row["owner_user_id"]) != int(user["id"]) or row["status"] != "correction_required":
                raise HTTPException(status_code=409, detail="Only the applicant can resubmit an application marked for correction.")
            if req.scan_token:
                raise HTTPException(status_code=422, detail="For a resubmission, keep the original application and update the entered fields; a new scan must be submitted as a new application.")
            data = dump_model(req); data.pop("scan_token", None); data.pop("review_confirmed", None)
            data.update({"division": resolved["division"], "district": resolved["district"], "upazila": resolved["location"],
                         "union_id": union_id, "union_ward": union_label, "mouza": resolved.get("mouza") or req.mouza.strip(),
                         "supplemental_fields": {"area_unit": req.area_unit, "previous_owner": req.previous_owner, "current_owner": req.current_owner,
                             "land_class": req.land_class, "land_description": req.land_description, "boundary_information": req.boundary_information, **req.supplemental_fields},
                         "additional_parties": [dump_model(item) for item in req.additional_parties],
                         "additional_parcels": [dump_model(item) for item in req.additional_parcels]})
            connection.execute("UPDATE deed_digitization_applications SET deed_data=%s::jsonb,entry_method=%s,status='resubmitted',updated_at=NOW() WHERE id=%s", (json.dumps(data, ensure_ascii=False), req.entry_method, app_id))
            connection.execute("INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,'correction_required','resubmitted','Applicant resubmitted corrected details',NOW())", (app_id, int(user["id"]), user.get("role", "citizen")))
        notify(int(user["id"]), "citizen", "resubmitted", row["tracking_id"])
        return {"tracking_id": row["tracking_id"], "status": "resubmitted"}

    @router.post("/applications/{app_id}/decision")
    def decide_application(app_id: int, decision: ApplicationDecision, authorization: Optional[str] = Header(None)):
        user = user_from(authorization); staff(user)
        if decision.action in {"correction_required", "rejected", "cancelled"} and not decision.note.strip():
            raise HTTPException(status_code=422, detail="Provide a reason for this decision.")
        owner_id = None; tracking_id = None; digital_deed_id = None; verification_token = None
        try:
            with engine.conn() as connection:
                app = application_row(connection, app_id, user, lock=True)
                current = app["status"]
                allowed_from = {"submitted", "resubmitted", "under_review"}
                if current not in allowed_from:
                    raise HTTPException(status_code=409, detail="This application is already final or cannot transition from its current status.")
                owner_id, tracking_id = int(app["owner_user_id"]), app["tracking_id"]
                data = app["deed_data"] if isinstance(app["deed_data"], dict) else json.loads(app["deed_data"])
                next_status = decision.action
                if decision.action == "approved":
                    # An advisory lock serializes approvals for a deed number/year.
                    connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (f"{data['deed_no'].strip().upper()}|{data['reg_year']}|{data['sub_registry_office'].strip().casefold()}",))
                    duplicate = connection.execute(
                        "SELECT id FROM deeds WHERE UPPER(REGEXP_REPLACE(deed_no,'\\s+','','g'))=UPPER(REGEXP_REPLACE(%s,'\\s+','','g')) AND reg_year=%s AND LOWER(BTRIM(sub_registry_office))=LOWER(BTRIM(%s)) LIMIT 1",
                        (data["deed_no"], int(data["reg_year"]), data["sub_registry_office"]),
                    ).fetchone()
                    if duplicate:
                        raise HTTPException(status_code=409, detail="A deed with this number and registration year already exists; resolve the duplicate before approval.")
                    connection.execute("UPDATE deed_digitization_applications SET status='approved',updated_at=NOW() WHERE id=%s", (app_id,))
                    connection.execute(
                        "INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,%s,'approved',%s,NOW())",
                        (app_id, int(user["id"]), user.get("role", ""), current, decision.note.strip()),
                    )
                    connection.execute("UPDATE deed_digitization_applications SET status='digitization_processing',updated_at=NOW() WHERE id=%s", (app_id,))
                    connection.execute(
                        "INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,'approved','digitization_processing','Creating the approved digital copy',NOW())",
                        (app_id, int(user["id"]), user.get("role", "")),
                    )
                    deed = connection.execute(
                        """INSERT INTO deeds(deed_no,reg_year,district,upazila,mouza,plot_id,khatian_no,seller_name,buyer_name,
                           area,price,sub_registry_office,reg_date,is_verified,raw_text,created_at,division,division_id,union_id,union_ward,deed_type)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,%s,NOW(),%s,%s,%s,%s,%s) RETURNING id""",
                        (data["deed_no"].strip(), int(data["reg_year"]), data["district"], data["upazila"], data["mouza"],
                         data["plot_id"].strip(), data["khatian_no"].strip(), data["seller_name"].strip(), data["buyer_name"].strip(),
                         float(data["area"]), float(data["price"]), data["sub_registry_office"].strip(), data["reg_date"],
                         app.get("ocr_text") or "", data["division"], int(data["division_id"]), data.get("union_id"),
                         data.get("union_ward", ""), data["deed_type"]),
                    ).fetchone()
                    deed_id = int(deed["id"])
                    supplemental = data.get("supplemental_fields") or {}
                    additional_parties = data.get("additional_parties") or []
                    additional_parcels = data.get("additional_parcels") or []
                    verification_token = secrets.token_urlsafe(32)
                    token_hash = hashlib.sha256(verification_token.encode("utf-8")).hexdigest()
                    digital_deed_id = f"BHM-DD-{int(data['reg_year'])}-{deed_id:06d}"
                    original_doc = connection.execute("SELECT storage_path FROM deed_digitization_documents WHERE application_id=%s ORDER BY id LIMIT 1", (app_id,)).fetchone()
                    connection.execute(
                        """INSERT INTO deed_digitization_metadata(application_id,deed_id,owner_user_id,entry_method,review_status,
                           original_document_path,ai_extraction_used,supplemental_fields,additional_parties,additional_parcels,
                           digital_deed_id,verification_token,verification_token_hash,record_status,is_archived,created_at,updated_at)
                           VALUES (%s,%s,%s,%s,'reviewed',%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s,%s,'active',FALSE,NOW(),NOW())""",
                        (app_id, deed_id, owner_id, app["entry_method"], original_doc["storage_path"] if original_doc else None,
                         bool(app.get("ai_extraction_used")), json.dumps(supplemental, ensure_ascii=False),
                         json.dumps(additional_parties, ensure_ascii=False), json.dumps(additional_parcels, ensure_ascii=False),
                         digital_deed_id, verification_token, token_hash),
                    )
                    next_status = "completed"
                    connection.execute("UPDATE deed_digitization_applications SET status='completed',finalized_deed_id=%s,updated_at=NOW() WHERE id=%s", (deed_id, app_id))
                    connection.execute(
                        "INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,'digitization_processing','completed','Digital deed copy created',NOW())",
                        (app_id, int(user["id"]), user.get("role", "")),
                    )
                else:
                    connection.execute("UPDATE deed_digitization_applications SET status=%s,updated_at=NOW() WHERE id=%s", (next_status, app_id))
                    connection.execute(
                        "INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,%s,%s,%s,NOW())",
                        (app_id, int(user["id"]), user.get("role", ""), current, next_status, decision.note.strip()),
                    )
        except UndefinedTable as exc:
            schema_required(exc)
        engine.log_audit(user.get("name", ""), user.get("role", ""), decision.action, "deed_digitization", f"application={tracking_id or app_id}")
        notify(owner_id, "citizen", next_status, tracking_id, decision.note.strip())
        result = {"tracking_id": tracking_id, "status": next_status, "message_bn": "আবেদনের অবস্থা হালনাগাদ হয়েছে।", "message_en": "Application status updated."}
        if digital_deed_id:
            result.update({"digital_deed_id": digital_deed_id, "verification_token": verification_token})
        return result

    @router.post("/applications/{app_id}/cancel")
    def cancel_application(app_id: int, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        with engine.conn() as connection:
            app = application_row(connection, app_id, user, lock=True)
            if int(app["owner_user_id"]) != int(user["id"]):
                raise HTTPException(status_code=403, detail="Only the applicant can cancel this application.")
            if app["status"] not in {"submitted", "under_review", "correction_required", "resubmitted"}:
                raise HTTPException(status_code=409, detail="A final application cannot be cancelled.")
            connection.execute("UPDATE deed_digitization_applications SET status='cancelled',updated_at=NOW() WHERE id=%s", (app_id,))
            connection.execute("INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,%s,'cancelled','Cancelled by applicant',NOW())", (app_id, int(user["id"]), user.get("role", "citizen"), app["status"]))
        engine.log_audit(user.get("name", ""), user.get("role", ""), "cancelled", "deed_digitization", f"application={app['tracking_id']}")
        notify(int(user["id"]), "citizen", "cancelled", app["tracking_id"])
        return {"status": "cancelled"}

    @router.get("/applications/{app_id}/documents/{document_id}")
    def application_document(app_id: int, document_id: int, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        with engine.conn() as connection:
            application_row(connection, app_id, user)
            doc = connection.execute("SELECT * FROM deed_digitization_documents WHERE id=%s AND application_id=%s", (document_id, app_id)).fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        path = storage_service.resolve_storage_path(doc["storage_path"])
        if not path:
            raise HTTPException(status_code=404, detail="Document is unavailable.")
        return FileResponse(path, filename=doc["original_filename"], media_type=safe_media_type(doc["original_filename"]))

    @router.get("/applications/{app_id}/staff-history-documents/{document_id}")
    def staff_history_application_document(app_id: int, document_id: int, authorization: Optional[str] = Header(None)):
        """Document access for the explicit system-wide Admin/Officer history view only."""
        user = user_from(authorization)
        staff(user)
        with engine.conn() as connection:
            exists = connection.execute(
                "SELECT 1 FROM deed_digitization_applications WHERE id=%s", (app_id,),
            ).fetchone()
            if not exists:
                raise HTTPException(status_code=404, detail="Application not found.")
            doc = connection.execute(
                "SELECT * FROM deed_digitization_documents WHERE id=%s AND application_id=%s",
                (document_id, app_id),
            ).fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found.")
        path = storage_service.resolve_storage_path(doc["storage_path"])
        if not path:
            raise HTTPException(status_code=404, detail="Document is unavailable.")
        return FileResponse(path, filename=doc["original_filename"], media_type=safe_media_type(doc["original_filename"]))

    @router.post("/applications/{app_id}/documents", status_code=201)
    async def add_application_document(app_id: int, request: Request, file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
        user = user_from(authorization); filename = Path(file.filename or "document").name
        try:
            enforce_upload_rate_limit(request.client.host if request.client else "unknown", user["id"], "digitization")
            contents = await file.read(10 * 1024 * 1024 + 1)
            if len(contents) > 10 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Uploaded file exceeds the 10 MB limit")
            if not contents:
                raise HTTPException(status_code=422, detail="The uploaded document is empty.")
            if Path(filename).suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
                raise HTTPException(status_code=415, detail="Only PDF, JPG, and PNG documents are accepted.")
            with engine.conn() as connection:
                app = application_row(connection, app_id, user)
                if app["status"] in {"completed", "approved", "rejected", "cancelled"}:
                    raise HTTPException(status_code=409, detail="Documents cannot be added to a finalized application.")
                document_count = connection.execute("SELECT COUNT(*) AS count FROM deed_digitization_documents WHERE application_id=%s", (app_id,)).fetchone()["count"]
                if int(document_count) >= 10:
                    raise HTTPException(status_code=409, detail="An application can contain at most 10 documents.")
            token = await asyncio.to_thread(storage_service.stage_document, filename, contents, int(user["id"]), "", False)
            staged, _ = await asyncio.to_thread(storage_service.read_staged_document, token, int(user["id"]))
        finally:
            await file.close()
        moved = None
        try:
            with engine.conn() as connection:
                app = application_row(connection, app_id, user, lock=True)
                if app["status"] in {"completed", "approved", "rejected", "cancelled"}:
                    raise HTTPException(status_code=409, detail="Documents cannot be added to a finalized application.")
                relative, moved = storage_service.promote_staged_application(token, int(user["id"]), app_id, filename)
                doc = connection.execute(
                    """INSERT INTO deed_digitization_documents(application_id,uploaded_by,original_filename,content_type,byte_length,storage_path,created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,NOW()) RETURNING id""",
                    (app_id, int(user["id"]), filename, safe_media_type(filename), len(contents), relative),
                ).fetchone()
        except Exception:
            if moved:
                storage_service.restore_promoted_application(token, moved)
            raise
        storage_service.finalize_stage(token)
        return {"id": int(doc["id"]), "filename": filename}

    @router.get("/digital-deeds/mine")
    def my_digital_deeds(authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        try:
            with engine.conn() as connection:
                rows = connection.execute(
                    """SELECT d.id,d.deed_no,d.reg_year,d.deed_type,d.district,d.upazila,d.mouza,d.plot_id,d.khatian_no,
                              m.digital_deed_id,m.verification_token,m.record_status,m.created_at
                       FROM deed_digitization_metadata m JOIN deeds d ON d.id=m.deed_id
                       WHERE m.owner_user_id=%s AND m.is_archived=FALSE ORDER BY m.created_at DESC""",
                    (int(user["id"]),),
                ).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        return {"items": [dict(row) for row in rows]}

    @router.get("/digital-deeds/review")
    def review_digital_deeds(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50), authorization: Optional[str] = Header(None)):
        user = user_from(authorization); staff(user)
        try:
            with engine.conn() as connection:
                where = "WHERE m.is_archived=FALSE"
                params = []
                assignment_configured = True
                if user.get("role") == "officer":
                    assignment_configured = bool(connection.execute(
                        """SELECT EXISTS (
                               SELECT 1 FROM information_schema.columns
                               WHERE table_schema='public' AND table_name='deed_digitization_applications'
                                 AND column_name='assigned_officer_id'
                           ) AS available"""
                    ).fetchone()["available"])
                    where += " AND EXISTS (SELECT 1 FROM deed_digitization_applications a WHERE a.id=m.application_id AND a.assigned_officer_id=%s)" if assignment_configured else " AND FALSE"
                    if assignment_configured:
                        params.append(int(user["id"]))
                total = connection.execute("SELECT COUNT(*) AS total FROM deed_digitization_metadata m " + where, params).fetchone()["total"]
                rows = connection.execute(
                    """SELECT d.id,d.deed_no,d.reg_year,d.deed_type,d.district,d.upazila,d.mouza,d.plot_id,
                              m.digital_deed_id,m.record_status,m.created_at
                       FROM deed_digitization_metadata m JOIN deeds d ON d.id=m.deed_id
                       """ + where + " ORDER BY m.created_at DESC LIMIT %s OFFSET %s",
                    [*params, page_size, (page - 1) * page_size],
                ).fetchall()
        except UndefinedTable as exc:
            schema_required(exc)
        return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size,
                "assignment_scope_configured": None if user.get("role") == "admin" else assignment_configured}

    @router.get("/digital-deeds/{deed_id}")
    def digital_deed_detail(deed_id: int, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        try:
            with engine.conn() as connection:
                row = connection.execute(
                    """SELECT d.*,m.application_id,m.owner_user_id,m.entry_method,m.review_status,m.original_document_path,m.generated_pdf_path,
                              m.supplemental_fields,m.additional_parties,m.additional_parcels,m.digital_deed_id,
                              m.verification_token,m.record_status,m.created_at AS digitized_at
                       FROM deed_digitization_metadata m JOIN deeds d ON d.id=m.deed_id WHERE d.id=%s AND m.is_archived=FALSE""",
                    (deed_id,),
                ).fetchone()
        except UndefinedTable as exc:
            schema_required(exc)
        if not row:
            raise HTTPException(status_code=404, detail="Digital deed not found.")
        if int(row["owner_user_id"]) != int(user["id"]):
            if user.get("role") == "admin":
                pass
            elif user.get("role") == "officer":
                with engine.conn() as connection:
                    require_officer_assignment(connection, "deed_digitization_applications", "id", row["application_id"], int(user["id"]))
            else:
                raise HTTPException(status_code=403, detail="Cannot access another user's digital deed.")
        result = dict(row); result.pop("owner_user_id", None); result.pop("verification_token_hash", None)
        return result

    @router.get("/public/verify/{verification_token}")
    def verify_digital_deed(verification_token: str):
        if len(verification_token) > 80:
            raise HTTPException(status_code=404, detail="Verification record not found.")
        token_hash = hashlib.sha256(verification_token.encode("utf-8")).hexdigest()
        try:
            with engine.conn() as connection:
                row = connection.execute(
                    """SELECT m.digital_deed_id,m.record_status,d.deed_type,d.reg_year,d.district
                       FROM deed_digitization_metadata m JOIN deeds d ON d.id=m.deed_id
                       WHERE m.verification_token_hash=%s AND m.is_archived=FALSE""",
                    (token_hash,),
                ).fetchone()
        except UndefinedTable as exc:
            schema_required(exc)
        if not row:
            return {"valid": False, "status": "invalid", "message_bn": "ডিজিটাল কপিটি পাওয়া যায়নি বা যাচাই লিংকটি সঠিক নয়।", "message_en": "Digital copy not found or the verification link is invalid."}
        record = dict(row)
        valid = record["record_status"] == "active"
        return {"valid": valid, "status": record["record_status"], "digital_deed_id": record["digital_deed_id"],
                "deed_type": record["deed_type"], "reg_year": record["reg_year"], "district": record["district"],
                "message_bn": "ভূমিসেতুর অনুমোদিত ডিজিটাল কপি সক্রিয় আছে; এটি সরকারি নিবন্ধন বা মালিকানার চূড়ান্ত প্রমাণ নয়।" if valid else "এই ডিজিটাল কপিটি প্রত্যাহার করা হয়েছে।",
                "message_en": "This Bhumisetu-approved digital copy is active; it is not final proof of government registration or ownership." if valid else "This digital copy has been revoked."}

    @router.post("/digital-deeds/{deed_id}/revoke")
    def revoke_digital_deed(deed_id: int, body: DigitalDeedRevocation, authorization: Optional[str] = Header(None)):
        user = user_from(authorization)
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required.")
        with engine.conn() as connection:
            row = connection.execute("UPDATE deed_digitization_metadata SET record_status='revoked',updated_at=NOW() WHERE deed_id=%s AND record_status='active' RETURNING application_id,digital_deed_id", (deed_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Active digital deed not found.")
            connection.execute("INSERT INTO deed_digitization_status_history(application_id,actor_user_id,actor_role,from_status,to_status,note,created_at) VALUES (%s,%s,%s,'completed','completed',%s,NOW())", (row["application_id"], int(user["id"]), user.get("role", "admin"), "Digital deed revoked: " + body.reason.strip()))
        engine.log_audit(user.get("name", ""), user.get("role", ""), "revoked", "deed_digitization", f"digital_deed_id={row['digital_deed_id']}; revocation reason recorded")
        return {"digital_deed_id": row["digital_deed_id"], "status": "revoked"}

    return router
