from backend.engine import resolve_deed_type_reference


CATALOG = [
    {"code": "gift", "name_bn": "দানপত্র", "name_en": "Gift deed"},
    {"code": "heba", "name_bn": "হেবা / হেবা ঘোষণা", "name_en": "Heba declaration"},
]


def test_deed_type_code_and_bengali_label_resolve_to_same_catalog_entry():
    submitted = resolve_deed_type_reference("gift", CATALOG)
    recorded = resolve_deed_type_reference(" দানপত্র  ", CATALOG)

    assert submitted["code"] == recorded["code"] == "gift"


def test_english_deed_type_label_resolves_case_insensitively():
    assert resolve_deed_type_reference("GIFT DEED", CATALOG)["code"] == "gift"


def test_distinct_deed_types_remain_distinct():
    gift = resolve_deed_type_reference("gift", CATALOG)
    heba = resolve_deed_type_reference("হেবা / হেবা ঘোষণা", CATALOG)

    assert gift["code"] != heba["code"]


def test_ambiguous_or_unknown_deed_type_does_not_get_guessed():
    ambiguous_catalog = CATALOG + [
        {"code": "gift_alt", "name_bn": "দানপত্র", "name_en": "Other gift deed"},
    ]

    assert resolve_deed_type_reference("দানপত্র", ambiguous_catalog) is None
    assert resolve_deed_type_reference("unknown deed", CATALOG) is None
