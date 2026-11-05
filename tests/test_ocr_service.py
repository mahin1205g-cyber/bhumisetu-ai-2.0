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
