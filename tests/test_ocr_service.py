import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import ocr_service


def test_parse_labelled_bengali_and_english_fields():
    result = ocr_service.parse_deed_fields(
        "Deed No: A-123\nRegistration Year: ২০২২\nPlot No: ১২৩\n"
        "Khatian No: ৯৯\nOwner Name: Example Owner\nDistrict: Dhaka\n"
        "Upazila: Savar\nMouza: Example Mouza"
    )

    assert result["deed_no"] == "A-123"
    assert result["reg_year"] == 2022
    assert result["plot_id"] == "123"
    assert result["khatian_no"] == "99"
    assert result["owner_name"] == "Example Owner"
    assert result["district"] == "Dhaka"
    assert result["upazila"] == "Savar"
    assert result["mouza"] == "Example Mouza"


def test_parse_does_not_invent_unlabelled_values():
    result = ocr_service.parse_deed_fields("Some unrelated text with no deed identifiers.")

    assert result["deed_no"] == ""
    assert result["reg_year"] is None
    assert result["district"] == ""
    assert result["upazila"] == ""
    assert result["mouza"] == ""


def test_utf8_text_upload_is_read_without_an_ocr_engine():
    result = ocr_service.extract_document_text("deed.txt", "দলিল নং: ১২৩".encode("utf-8"))

    assert result.text == "দলিল নং: ১২৩"
    assert result.warnings == []


def test_digitization_parser_reads_registration_and_land_detail_labels():
    result = ocr_service.parse_deed_fields(
        "বিভাগ: ঢাকা\nদলিল নং: ৪৫৬\nনিবন্ধনের তারিখ: ১২/০৫/২০২৪\n"
        "সাব-রেজিস্ট্রি অফিস: মিরপুর\nজমির পরিমাণ: ২.৫ শতক\n"
        "দলিলের মূল্য: ৫০০০০ টাকা\nজমির শ্রেণি: নাল\n"
        "জমির বিবরণ: বসতভিটা\nচৌহদ্দি: উত্তর-রাস্তা"
    )

    assert result["division"] == "ঢাকা"
    assert result["deed_no"] == "456"
    assert result["reg_date"] == "১২/০৫/২০২৪"
    assert result["sub_registry_office"] == "মিরপুর"
    assert result["area"] == "২.৫ শতক"
    assert result["price"] == "৫০০০০ টাকা"
    assert result["land_class"] == "নাল"
    assert result["land_description"] == "বসতভিটা"
    assert result["boundary_information"] == "উত্তর-রাস্তা"


def test_mixed_pdf_uses_existing_ocr_for_pages_without_searchable_text(monkeypatch):
    import fitz

    document = fitz.open()
    first = document.new_page()
    first.insert_text((72, 72), "Searchable page")
    document.new_page()  # A scanned page has no extractable text layer.
    pdf_bytes = document.tobytes()
    document.close()

    calls = []

    def fake_ocr(image):
        calls.append(image.size)
        return "OCR page", []

    monkeypatch.setattr(ocr_service, "_ocr_image", fake_ocr)
    result = ocr_service.extract_document_text("mixed.pdf", pdf_bytes)

    assert "Searchable page" in result.text
    assert "OCR page" in result.text
    assert len(calls) == 1
