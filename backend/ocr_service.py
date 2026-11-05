"""OCR and field extraction for uploaded deed documents.

Text PDFs are read directly. Scanned PDFs and images use the system Tesseract
engine with Bengali and English language data; no OCR output is treated as a
verified land record.
"""

from __future__ import annotations

import io
import os
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError


MAX_PDF_PAGES = 20
MAX_IMAGE_PIXELS = 30_000_000
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return "".join(
        char for char in normalized
        if char.isalnum() or unicodedata.category(char).startswith("M")
    )


class DocumentProcessingError(Exception):
    status_code = 422


class UnsupportedDocumentError(DocumentProcessingError):
    status_code = 415


class OCRUnavailableError(DocumentProcessingError):
    status_code = 503


class _OCRFailedError(DocumentProcessingError):
    status_code = 422


@dataclass
class OCRResult:
    text: str
    warnings: list[str]


def _prepare_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("L")
    width, height = image.size
    longest = max(width, height)
    if longest < 1800:
        scale = min(2.0, 1800 / max(1, longest))
        image = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    return ImageEnhance.Contrast(image).enhance(1.45).filter(ImageFilter.SHARPEN)


def _tesseract_languages() -> tuple[object, str, list[str]]:
    try:
        import pytesseract
    except ImportError as exc:
        raise OCRUnavailableError(
            "OCR dependencies are missing. Install the backend requirements and Tesseract OCR."
        ) from exc

    executable = os.environ.get("TESSERACT_CMD", "").strip()
    if executable:
        pytesseract.pytesseract.tesseract_cmd = executable
    else:
        backend_dir = Path(__file__).resolve().parent
        program_files = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
        program_files_x86 = Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
        candidates = (
            backend_dir / ".venv" / "Tools" / "Tesseract" / "tesseract.exe",
            program_files / "Tesseract-OCR" / "tesseract.exe",
            program_files_x86 / "Tesseract-OCR" / "tesseract.exe",
        )
        for candidate in candidates:
            if candidate.is_file():
                pytesseract.pytesseract.tesseract_cmd = str(candidate)
                break

    if not os.environ.get("TESSDATA_PREFIX", "").strip():
        local_tessdata = Path(__file__).resolve().parent / ".venv" / "Tools" / "Tesseract" / "tessdata"
        if local_tessdata.is_dir():
            os.environ["TESSDATA_PREFIX"] = str(local_tessdata)

    try:
        available = set(pytesseract.get_languages(config=""))
    except (pytesseract.TesseractNotFoundError, pytesseract.TesseractError) as exc:
        raise OCRUnavailableError(
            "Tesseract OCR is not installed or is not configured on this server."
        ) from exc

    requested = [part.strip() for part in os.environ.get("TESSERACT_LANG", "ben+eng").split("+") if part.strip()]
    selected = [part for part in requested if part in available]
    if not selected:
        raise OCRUnavailableError(
            "Install Bengali (ben) and English (eng) Tesseract language data to use deed OCR."
        )
    language = "+".join(selected)
    missing = [part for part in requested if part not in available]
    warnings = []
    if "ben" in missing:
        warnings.append("Bengali OCR language data is unavailable; Bengali text may be missed.")
    if "eng" in missing:
        warnings.append("English OCR language data is unavailable; English text may be missed.")
    return pytesseract, language, warnings


def _ocr_image(image: Image.Image) -> tuple[str, list[str]]:
    pytesseract, language, warnings = _tesseract_languages()
    try:
        prepared = _prepare_image(image)
        text = pytesseract.image_to_string(
            prepared,
            lang=language,
            config="--oem 1 --psm 6",
            timeout=30,
        )
        # Bangladesh deed summaries commonly put the deed type and location
        # in a small table near the page bottom. If the main pass misses those
        # signals, read that region with both block and sparse-text layouts.
        if not re.search(r"সাফ\s*কবলা|City\s+Corporation|সিটি\s*কর্পোরেশন", text, re.IGNORECASE):
            top = round(prepared.height * 0.72)
            summary_region = prepared.crop((0, top, prepared.width, prepared.height))
            supplemental = []
            for psm in (6, 11):
                try:
                    region_text = pytesseract.image_to_string(
                        summary_region,
                        lang=language,
                        config=f"--oem 1 --psm {psm}",
                        timeout=20,
                    ).strip()
                except pytesseract.TesseractError:
                    continue
                if region_text:
                    supplemental.append(region_text)
            if supplemental:
                text = "\n".join((text, *supplemental))
    except pytesseract.TesseractNotFoundError as exc:
        raise OCRUnavailableError("Tesseract OCR is not installed or is not configured on this server.") from exc
    except pytesseract.TesseractError as exc:
        raise _OCRFailedError("The uploaded document could not be read by OCR. Try a clearer scan.") from exc
    return text.strip(), warnings


def _image_from_bytes(contents: bytes, expected_format: str | None = None) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(contents))
        image_format = (image.format or "").upper()
        if image_format not in {"JPEG", "PNG"}:
            raise UnsupportedDocumentError("Only JPEG and PNG images are supported.")
        if expected_format and image_format != expected_format:
            raise UnsupportedDocumentError("The image content does not match its file extension.")
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise UnsupportedDocumentError("The image dimensions are too large to process safely.")
        image.load()
        return image.copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise DocumentProcessingError("The uploaded image is invalid or damaged.") from exc


def extract_document_text(filename: str, contents: bytes) -> OCRResult:
    """Extract text from a supported document, including scanned PDF pages."""
    extension = Path(filename).suffix.lower()
    warnings: list[str] = []

    if extension in {".jpg", ".jpeg", ".png"}:
        expected = "PNG" if extension == ".png" else "JPEG"
        text, warnings = _ocr_image(_image_from_bytes(contents, expected))
    elif extension == ".pdf":
        if not contents.startswith(b"%PDF-"):
            raise DocumentProcessingError("The uploaded file is not a valid PDF.")
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(contents), strict=False)
            if reader.is_encrypted:
                raise DocumentProcessingError("Password-protected PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise UnsupportedDocumentError(f"PDFs are limited to {MAX_PDF_PAGES} pages.")
            text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        except DocumentProcessingError:
            raise
        except Exception as exc:
            raise DocumentProcessingError("Could not read the uploaded PDF.") from exc

        if not text:
            try:
                import fitz
            except ImportError as exc:
                raise OCRUnavailableError(
                    "Scanned PDF OCR needs PyMuPDF. Install the backend requirements and Tesseract OCR."
                ) from exc
            try:
                pages: list[str] = []
                with fitz.open(stream=contents, filetype="pdf") as document:
                    if len(document) > MAX_PDF_PAGES:
                        raise UnsupportedDocumentError(f"PDFs are limited to {MAX_PDF_PAGES} pages.")
                    for page in document:
                        rect = page.rect
                        scale = min(2.0, 2800 / max(rect.width, rect.height, 1))
                        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                        with Image.open(io.BytesIO(pixmap.tobytes("png"))) as page_image:
                            page_text, page_warnings = _ocr_image(page_image)
                        if page_text:
                            pages.append(page_text)
                        warnings.extend(page_warnings)
                text = "\n".join(pages).strip()
            except DocumentProcessingError:
                raise
            except Exception as exc:
                raise DocumentProcessingError("Could not run OCR on this scanned PDF.") from exc
    elif extension == ".txt":
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise DocumentProcessingError("The text file must use UTF-8 encoding.") from exc
    else:
        raise UnsupportedDocumentError("Only PDF, JPG, JPEG, PNG, and UTF-8 text files are supported.")

    if not text.strip():
        raise DocumentProcessingError("No readable text was found. Try a clearer image or searchable PDF.")
    return OCRResult(text=text, warnings=list(dict.fromkeys(warnings)))


def _capture(text: str, labels: tuple[str, ...], value_pattern: str = r"([^\r\n]{1,120})") -> str:
    label_pattern = "|".join(labels)
    match = re.search(
        rf"(?im)(?:^|[\r\n])\s*(?:{label_pattern})\s*[:：\-]?\s*{value_pattern}",
        text,
    )
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip(" \t:：-.,;।")


def _summary_table_fields(text: str) -> dict[str, str]:
    """Read the common deed-summary row when OCR preserves its cell separators."""
    deed_match = re.search(r"(?:সাফ|শাফ|লাফ)\s*কবলা", text, re.IGNORECASE)
    if not deed_match:
        return {}

    after_deed_type = text[deed_match.end():]
    first_cell = re.match(r"\s*\|\s*([^|\r\n]{2,80})\s*\|", after_deed_type)
    mouza = first_cell.group(1).strip(" \t:：-.,;।") if first_cell else ""

    # A Gazipur/Dhaka deed summary can place the metro thana after the city
    # corporation cell. Use that cell only when the table explicitly labels
    # the city corporation; free text elsewhere is too easy to misclassify.
    city_corporation = re.search(r"সিটি\s*কর্পোরেশন", after_deed_type, re.IGNORECASE)
    upazila = ""
    location_type = ""
    if city_corporation:
        tail = after_deed_type[city_corporation.end():]
        for cell in tail.split("|"):
            candidate = cell.strip(" \t\r\n:：-.,;।")
            letters = [char for char in candidate if unicodedata.category(char).startswith("L")]
            bengali_letters = [char for char in letters if "\u0980" <= char <= "\u09ff"]
            if len(bengali_letters) >= 3 and len(bengali_letters) / max(1, len(letters)) >= 0.7:
                upazila = candidate
                location_type = "police_thana"
                break

    fields = {}
    if mouza:
        letters = [char for char in mouza if unicodedata.category(char).startswith("L")]
        bengali_letters = [char for char in letters if "\u0980" <= char <= "\u09ff"]
        if len(bengali_letters) >= 3 and len(bengali_letters) / max(1, len(letters)) >= 0.7:
            fields["mouza"] = mouza
    if upazila:
        fields["upazila"] = upazila
        fields["upazila_type"] = location_type
    return fields


def parse_deed_fields(text: str) -> dict:
    """Extract labelled values and a few unambiguous summary-table fields."""
    deed_no = _capture(text, (
        r"দলিল\s*(?:নং|নম্বর)?", r"Deed\s*(?:No\.?|Number)?",
    ), r"([A-Za-z0-9০-৯০-৯/.-]{1,40})")
    year = _capture(text, (
        r"নিবন্ধন(?:ের)?(?:\s*(?:সাল|বছর))?", r"রেজিস্ট্রেশন(?:\s*(?:সাল|বছর))?",
        r"সন", r"Registration\s*Year", r"Year",
    ), r"([0-9০-৯]{4})")
    plot_id = _capture(text, (
        r"দাগ\s*(?:নং|নম্বর)?", r"প্লট\s*(?:নং|নম্বর)?", r"Plot\s*(?:No\.?|Number)?",
    ), r"([A-Za-z0-9০-৯০-৯/.-]{1,50})")
    khatian_no = _capture(text, (
        r"খতিয়ান\s*(?:নং|নম্বর)?", r"খতিয়ান\s*(?:নং|নম্বর)?", r"Khatian\s*(?:No\.?|Number)?",
    ), r"([A-Za-z0-9০-৯০-৯/.-]{1,50})")
    mouza = _capture(text, (r"মৌজা", r"Mouza"))
    district = _capture(text, (r"জেলা", r"District"))
    normalized_text = _normalize_text(text)
    city_corporation_districts = (
        ("ঢাকা", "Dhaka"),
        ("গাজীপুর", "Gazipur"),
        ("চট্টগ্রাম", "Chattogram"),
        ("খুলনা", "Khulna"),
        ("রাজশাহী", "Rajshahi"),
        ("বরিশাল", "Barishal"),
        ("সিলেট", "Sylhet"),
        ("রংপুর", "Rangpur"),
        ("কুমিল্লা", "Cumilla"),
        ("ময়মনসিংহ", "Mymensingh"),
        ("ময়মনসিংহ", "Mymensingh"),
        ("নারায়ণগঞ্জ", "Narayanganj"),
        ("নারায়ণগঞ্জ", "Narayanganj"),
    )
    normalized_district = _normalize_text(district)
    for bengali_name, english_name in city_corporation_districts:
        normalized_name = _normalize_text(bengali_name)
        if normalized_district.startswith(normalized_name) or (
            not district and (
                f"{normalized_name}সিটি" in normalized_text
                or f"{english_name.casefold()}city" in normalized_text
            )
        ):
            district = english_name
            break
    upazila = _capture(text, (r"উপজেলা", r"Upazila", r"Thana"))
    summary_fields = _summary_table_fields(text)
    if not mouza:
        mouza = summary_fields.get("mouza", "")
    if not upazila:
        upazila = summary_fields.get("upazila", "")
    buyer = _capture(text, (
        r"ক্রেতা(?:র)?\s*নাম", r"গ্রহীতা(?:র)?\s*নাম",
        r"Buyer(?:\s*Name)?", r"Purchaser(?:\s*Name)?", r"Transferee(?:\s*Name)?",
    ))
    owner = _capture(text, (r"মালিক(?:ের)?\s*নাম", r"Owner(?:\s*Name)?"))
    seller = _capture(text, (r"বিক্রেতা(?:র)?\s*নাম", r"Seller(?:\s*Name)?"))
    area = _capture(text, (r"জমির\s*পরিমাণ", r"জমির\s*পরিমান", r"আয়তন", r"আয়তন", r"Area"))
    deed_type = "sale" if re.search(r"(?:[সশল]া?ফ\s*কবলা|sale\s+deed)", text, re.IGNORECASE) else ""
    union_ward_match = re.search(
        r"([০-৯0-9]{1,3}\s*(?:নং|নম্বর)\s*(?:ওয়ার্ড|ওয়ার্ড|ward))",
        text,
        re.IGNORECASE,
    )
    union_ward = re.sub(r"\s+", " ", union_ward_match.group(1)).strip() if union_ward_match else ""

    normalized_year = year.translate(_BN_DIGITS) if year else ""
    return {
        "deed_no": deed_no.translate(_BN_DIGITS) if deed_no else "",
        "deed_type": deed_type,
        "reg_year": int(normalized_year) if normalized_year.isdigit() else None,
        "district": district,
        "upazila": upazila,
        "upazila_type": summary_fields.get("upazila_type", ""),
        "mouza": mouza,
        "union_ward": union_ward,
        "plot_id": plot_id.translate(_BN_DIGITS) if plot_id else "",
        "khatian_no": khatian_no.translate(_BN_DIGITS) if khatian_no else "",
        "owner_name": owner or buyer,
        "seller_name": seller,
        "buyer_name": buyer,
        "area": area,
    }
