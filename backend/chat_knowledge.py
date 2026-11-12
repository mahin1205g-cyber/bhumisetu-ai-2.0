"""Small, source-backed retrieval layer for Bhumisetu platform guidance.

This is product documentation, not a FAQ answer bank. Gemini receives only the
few matching feature facts and writes the answer in the user's own context.
Keep each entry aligned with the frontend route and backend service it cites.
"""

from __future__ import annotations

import re
import unicodedata
import math
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


# Routes are copied from App.jsx. Values supplied by the browser are always
# checked against this map and never treated as prompt text.
PAGE_LABELS = {
    "home": "Home / landing page",
    "dashboard": "Dashboard",
    "deed-verify": "Digital deed verification",
    "deed-search": "Deed number search",
    "verification-result": "Verification result",
    "mutation": "E-Namjari / mutation application",
    "mutation-track": "Mutation application tracking",
    "officer-review": "Officer application review",
    "due-diligence": "Pre-purchase due diligence",
    "due-diligence-report": "Due diligence report",
    "properties": "Properties register",
    "audit-logs": "Audit history",
    "notifications": "Notifications",
    "profile": "User profile",
    "admin": "Admin dashboard",
    "help": "Help and FAQ",
    "disclaimer": "Disclaimer and policy",
    "login": "Login",
    "register": "Registration",
}


# Facts below were checked against the matching routes, React page components,
# API handlers, and backend engine functions. They describe app behavior only.
FEATURES: Sequence[Dict[str, Any]] = (
    {
        "id": "overview", "route": "home", "roles": ("public", "citizen", "officer", "admin"),
        "title": "Bhumisetu platform overview",
        "aliases": ("bhumisetu", "ভূমিসেতু", "website", "site", "ওয়েবসাইট", "ওয়েবসাইট", "সাইট", "platform", "প্ল্যাটফর্ম", "what can i do", "purpose", "ওয়েবসাইটের কাজ", "ওয়েবসাইটের কাজ", "প্ল্যাটফর্ম কী", "কী করা যায়", "কি কি করা যায়", "ki ki korte pari", "ki diye hoy", "asole ki hoy"),
        "facts": "Bhumisetu is a land-service application with digital deed verification against its application database, deed search, e-Namjari application and tracking, preliminary due-diligence screening, and account-specific dashboards. It is not the official government land registry and does not certify legal title.",
        "sources": ("frontend/src/App.jsx", "frontend/src/components/SlideDrawer.jsx", "backend/main.py"),
    },
    {
        "id": "deed_verification", "route": "deed-verify", "roles": ("citizen", "officer", "admin"),
        "title": "Digital deed verification form",
        "aliases": ("deed verify", "verify deed", "deed verification", "দলিল যাচাই", "দলিল যাচাই করব", "dolil verify", "dolil check", "dolil kivabe check", "dolil jachai", "seller buyer", "ক্রেতা", "বিক্রেতা", "dag", "দাগ", "khatian", "খতিয়ান", "mouza", "মৌজা", "ocr", "scan document", "দলিল আপলোড"),
        "facts": "The authenticated deed-verification form requires deed number and registration year, deed type, division/district/upazila, Mouza, Dag/plot and Khatian numbers, buyer/transferee and seller names; Union/Ward is optional. A PDF/JPG/PNG up to 10 MB can be uploaded for OCR extraction. Searchable PDF text is read directly; scanned images/PDFs require backend Tesseract with Bengali and English language data. Extracted values are suggestions to review, not proof. The submitted values are compared with matching records in Bhumisetu's PostgreSQL application database. Results are preliminary app-record comparisons, not official Balam-book or title verification. Use the verification page from the Services menu (hash route #/deed-verify).",
        "sources": ("frontend/src/pages/DeedVerification.jsx", "backend/main.py:/api/verification/verify-deed", "backend/main.py:/api/verification/upload-deed", "backend/engine.py"),
    },
    {
        "id": "deed_search", "route": "deed-search", "roles": ("citizen", "officer", "admin"),
        "title": "Deed search",
        "aliases": ("deed search", "search deed", "find deed", "দলিল খুঁজুন", "দলিল অনুসন্ধান", "dolil khuja", "dolil khujbo", "deed number", "দলিল নম্বর", "advanced search", "record search"),
        "facts": "Deed search looks for records in the Bhumisetu application database by deed number or available advanced filters. Search results are not a query to the official government registry. Open Deed Search from the Services menu (hash route #/deed-search); enter the deed number or the filters the form offers. Sign-in is required, and the backend applies search protections and returns role-filtered public deed fields.",
        "sources": ("frontend/src/pages/DeedSearch.jsx", "backend/main.py:/api/deeds/search-by-number", "backend/main.py:/api/deeds/advanced-search", "backend/deed_search.py"),
    },
    {
        "id": "mutation", "route": "mutation", "roles": ("citizen", "officer", "admin"),
        "title": "E-Namjari / mutation application",
        "aliases": ("mutation", "e-namjari", "namjari", "নামজারি", "ই-নামজারি", "apply mutation", "application process", "abedon", "namjari kivabe", "কী কাগজ", "documents required", "document lagbe"),
        "facts": "A signed-in citizen can submit an e-Namjari/mutation request through a multi-step form. It asks for applicant name, NID, phone, relationship and address; parcel location, Mouza/JL, Khatian type/number, Dag/plot, area/class; ownership source, registered deed number/date; and a supporting-document checklist. The current UI checklist offers the original registered deed, heir certificate when applicable, latest RS/BS Khatian, current land-tax receipt, NID copy, and a land sketch; this app checklist is not a government-certified exhaustive legal requirements list. The form can contain sample-prefilled values: review and replace them with actual details before submission. The backend creates an application and tracking number. Applications may be reviewed by authorized officers. Do not state government fees, legal deadlines, or approval guarantees unless an authoritative current source is supplied. Open e-Namjari from Services (hash route #/mutation).",
        "sources": ("frontend/src/pages/SmartMutation.jsx", "backend/main.py:/api/mutation/apply", "backend/engine.py"),
    },
    {
        "id": "mutation_tracking", "route": "mutation-track", "roles": ("citizen", "officer", "admin"),
        "title": "Application tracking",
        "aliases": ("track application", "application status", "mutation status", "tracking number", "স্ট্যাটাস", "আবেদনের অবস্থা", "আবেদন কোথায়", "আবেদন কোথায়", "আমার আবেদন কোথায়", "আমার আবেদন কোথায়", "amar application", "amar abedon", "status kivabe", "track korbo"),
        "facts": "Users can track their mutation application with its tracking number. The backend requires authentication and permits the applicant to see their own application; officers/admins have their authorized review access. A chat lookup must use the authenticated account and backend ownership checks. Open Application Tracking (hash route #/mutation-track).",
        "sources": ("frontend/src/pages/ApplicationTracking.jsx", "backend/main.py", "backend/engine.py:get_mutation_application"),
    },
    {
        "id": "officer", "route": "officer-review", "roles": ("officer", "admin"),
        "title": "Officer review",
        "aliases": ("officer", "land officer", "review application", "officer panel", "কর্মকর্তা", "অফিসার", "review", "অনুমোদন", "যাচাই আবেদন"),
        "facts": "Officer Review is available to officer and admin roles. It is used to review mutation applications through the authenticated backend workflow; only authorized roles can access the page and status actions. Citizens should use their tracking page for their own request. Open Officer Review from the role-specific menu (hash route #/officer-review).",
        "sources": ("frontend/src/App.jsx", "frontend/src/components/SlideDrawer.jsx", "frontend/src/pages/OfficerReview.jsx", "backend/main.py"),
    },
    {
        "id": "due_diligence", "route": "due-diligence", "roles": ("citizen", "officer", "admin"),
        "title": "Pre-purchase due diligence",
        "aliases": ("due diligence", "risk report", "land risk", "ঝুঁকি বিশ্লেষণ", "ঝুঁকি রিপোর্ট", "জমি কেনার আগে", "pre purchase", "seller check", "jomi kenar age", "risk assessment"),
        "facts": "Due Diligence is a preliminary pre-purchase screening form. It accepts seller and deed details, location and parcel identifiers, recorded/proposed area, a checklist of documents held, and whether a court dispute is known. The form includes sample-prefilled values and demonstration scenarios; replace them with actual information and do not treat those samples as verified land records. The report is a screening aid based on app records and configured indicators, not legal advice or an official title certificate. A missing app record is not proof of fraud or safety. Open Due Diligence from Services (hash route #/due-diligence).",
        "sources": ("frontend/src/pages/DueDiligence.jsx", "backend/main.py:/api/due-diligence/assess", "backend/engine.py:assess_due_diligence"),
    },
    {
        "id": "reports", "route": "due-diligence-report", "roles": ("citizen", "officer", "admin"),
        "title": "Verification and due-diligence reports",
        "aliases": ("report", "my reports", "saved report", "verification result", "যাচাই ফলাফল", "রিপোর্ট", "আমার রিপোর্ট", "report kothay", "risk result"),
        "facts": "Verification and due-diligence report views show the result produced for the current application. Saved report retrieval is user-scoped in backend APIs; admins have the configured administrative access. The report explains app-database matching or preliminary screening, not official land-registry certification. A result's values and status must come from the actual response/report, never inferred by the assistant.",
        "sources": ("frontend/src/pages/VerificationResult.jsx", "frontend/src/pages/DueDiligenceReport.jsx", "backend/main.py:/api/due-diligence/report/{ref}", "backend/engine.py"),
    },
    {
        "id": "locations", "route": "deed-verify", "roles": ("citizen", "officer", "admin"),
        "title": "Division, district, upazila, Mouza and Union fields",
        "aliases": ("division", "district", "zila", "জেলা", "বিভাগ", "upazila", "thana", "উপজেলা", "থানা", "mouza", "mouja", "মৌজা", "union", "ward", "ইউনিয়ন", "ওয়ার্ড", "location", "address", "elaka"),
        "facts": "The deed form uses dependent official location selections where backend location data is available. Division and district are administrative levels; Metropolitan Thana remains distinct from an administrative Upazila. Union/Ward is optional. Mouza can be manually supplied when the official list does not contain it; manual input must not be described as officially verified. Use the displayed Bengali name and confirm the deed itself. The form is at #/deed-verify.",
        "sources": ("frontend/src/pages/DeedVerification.jsx", "frontend/src/components/LocationCombobox.jsx", "backend/location_service.py", "backend/main.py"),
    },
    {
        "id": "properties", "route": "properties", "roles": ("citizen", "officer", "admin"),
        "title": "Properties register",
        "aliases": ("property", "properties", "parcel", "land record", "জমির তথ্য", "জমির রেকর্ড", "সম্পত্তি", "plot register", "dag record", "khatian information"),
        "facts": "The Properties Register displays parcel/property information available in Bhumisetu. The page/API is not the official government register. Use the parcel identifiers shown by the page and compare the source deed and official records independently. Open Properties from Services (hash route #/properties).",
        "sources": ("frontend/src/pages/PropertiesRegister.jsx", "backend/main.py:/api/properties", "backend/engine.py"),
    },
    {
        "id": "dashboard", "route": "dashboard", "roles": ("citizen", "officer", "admin"),
        "title": "User dashboard",
        "aliases": ("dashboard", "home page account", "overview", "ড্যাশবোর্ড", "my account", "amar dashboard", "account overview"),
        "facts": "The signed-in Dashboard is the account overview and entry point to available services and account activity. Its figures and record summaries reflect backend data available to that role; ask for a specific private record only through an authenticated, owner-authorized lookup. Open Dashboard from the main navigation (hash route #/dashboard).",
        "sources": ("frontend/src/pages/Dashboard.jsx", "frontend/src/App.jsx", "backend/main.py"),
    },
    {
        "id": "account", "route": "profile", "roles": ("citizen", "officer", "admin"),
        "title": "Profile, registration and account settings",
        "aliases": ("profile", "account settings", "username", "password", "register", "registration", "login", "sign in", "প্রোফাইল", "নিবন্ধন", "লগইন", "ছবি", "profile picture"),
        "facts": "Login and registration are separate public pages. The Profile page is for the authenticated user's own account/profile options, including the profile picture feature. The assistant must not request or expose a password, API key, access token, or another person's account data. Open Profile from the user menu (hash route #/profile).",
        "sources": ("frontend/src/pages/Login.jsx", "frontend/src/pages/Register.jsx", "frontend/src/pages/UserProfile.jsx", "backend/main.py"),
    },
    {
        "id": "notifications_audit", "route": "notifications", "roles": ("citizen", "officer", "admin"),
        "title": "Notifications and audit history",
        "aliases": ("notification", "notifications", "alert", "নোটিফিকেশন", "বিজ্ঞপ্তি", "audit", "audit log", "activity history", "কার্যক্রমের ইতিহাস"),
        "facts": "Notifications show account notifications available to the signed-in user. Audit History is an activity/audit view and may be limited by role; it is not a public land-history or ownership timeline. Open Notifications or Audit History from the account/navigation menu.",
        "sources": ("frontend/src/pages/NotificationsPage.jsx", "frontend/src/pages/AuditHistory.jsx", "backend/main.py:/api/notifications", "backend/main.py:/api/audit-logs"),
    },
    {
        "id": "admin", "route": "admin", "roles": ("admin",),
        "title": "Administration",
        "aliases": ("admin", "administrator", "admin dashboard", "manage users", "অ্যাডমিন", "প্রশাসন", "system setting"),
        "facts": "The Admin page and admin-only actions require the backend-authenticated admin role. The assistant cannot grant roles, bypass authorization, or perform administrative database changes through chat. Authorized administrators should use the Admin dashboard and its existing controls.",
        "sources": ("frontend/src/pages/AdminDashboard.jsx", "frontend/src/App.jsx", "backend/main.py"),
    },
    {
        "id": "help_policy", "route": "help", "roles": ("public", "citizen", "officer", "admin"),
        "title": "Help, methodology and disclaimer",
        "aliases": ("help", "faq", "how it works", "methodology", "disclaimer", "সাহায্য", "প্রশ্ন", "নীতিমালা", "সীমাবদ্ধতা", "official verification"),
        "facts": "Help contains platform guidance and methodology; Disclaimer explains service limits. Bhumisetu AI explanations and app-database comparisons are not official government decisions, legal opinions, or title certification. For authoritative current record, fee, legal or filing requirements, confirm with the responsible government portal or land office.",
        "sources": ("frontend/src/pages/HelpFAQ.jsx", "frontend/src/pages/DisclaimerPolicy.jsx"),
    },
)


TOKEN_RE = re.compile(r"[a-z0-9]+|[\u0980-\u09ff]+", re.IGNORECASE)
DEICTIC_RE = re.compile(
    r"\b(this|that|here|above|current page|this page|this option|this form|this button|it|etar|eta|ekhane|ei|aita|oita|eikhane)\b|"
    r"(এটা|এটি|ওটা|এখানে|এই পৃষ্ঠা|এই পেজ|এই অপশন|এই ফর্ম|এই বাটন|এটার|এখানে কী করব)",
    re.IGNORECASE,
)

_BANGLISH_EXPANSIONS = {
    "bhumisetu": "bhumisetu ভূমিসেতু", "dolil": "deed দলিল", "dalil": "deed দলিল",
    "jachai": "verify verification যাচাই", "jachay": "verify যাচাই", "check": "verify যাচাই",
    "kivabe": "how কীভাবে", "kibhabe": "how কীভাবে", "ki": "what কী", "kaj": "feature কাজ",
    "korbo": "do use করব", "korte": "apply use করতে",
    "namjari": "mutation e-namjari নামজারি", "abedon": "application আবেদন", "abedan": "application আবেদন",
    "amar": "my আমার", "kothay": "where কোথায়", "khuja": "search find খুঁজুন",
    "khujbo": "search খুঁজব", "jomir": "land জমির", "jomi": "land জমি",
    "thana": "upazila thana উপজেলা", "zila": "district জেলা", "mouja": "mouza মৌজা",
    "khotian": "khatian খতিয়ান", "dag": "plot dag দাগ", "ki": "what কী",
}

_RETRIEVAL_STOPWORDS = {
    "a", "an", "the", "i", "we", "you", "my", "me", "to", "for", "of", "and", "or",
    "what", "how", "when", "why", "who", "can", "could", "would", "please",
    "do", "does", "did", "is", "are", "am", "be", "it", "this", "that", "here", "option",
    "ami", "amar", "ki", "kivabe", "kibhabe", "korbo", "korben", "koro", "korte", "kirokom",
    "কী", "কি", "কীভাবে", "কিভাবে", "কেন", "কে", "করব", "করবেন", "করো",
    "আমার", "আমি", "আপনি", "এটা", "এটি", "ওটা", "এখানে", "এই", "টা", "টি", "দিয়ে", "দিয়ে",
}


def _normalise(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(text or "")).casefold().split())


def _tokens(text: str) -> List[str]:
    return TOKEN_RE.findall(_normalise(text))


def _expanded_tokens(text: str) -> List[str]:
    tokens = _tokens(text)
    expanded = list(tokens)
    for token in tokens:
        if token in _BANGLISH_EXPANSIONS:
            expanded.extend(_tokens(_BANGLISH_EXPANSIONS[token]))
    return [token for token in expanded if token not in _RETRIEVAL_STOPWORDS]


def _feature_tokens(feature: Dict[str, Any]) -> set[str]:
    return {token for alias in feature["aliases"] for token in _expanded_tokens(alias)}


_TOKEN_FEATURE_FREQUENCY = {
    token: sum(token in _feature_tokens(feature) for feature in FEATURES)
    for feature in FEATURES
    for token in _feature_tokens(feature)
}


def _score(query: str, feature: Dict[str, Any]) -> float:
    qnorm = _normalise(query)
    query_tokens = set(_expanded_tokens(query))
    if feature["id"] == "overview":
        app_terms = {"bhumisetu", "ভূমিসেতু", "website", "site", "ওয়েবসাইট", "ওয়েবসাইট", "সাইট", "platform", "প্ল্যাটফর্ম"}
        if not (query_tokens & app_terms) and not any(term in qnorm for term in app_terms if len(term) > 2):
            return 0.0
    meaningful_query = " ".join(_expanded_tokens(query))
    aliases = [
        (alias, " ".join(_expanded_tokens(alias)))
        for alias in feature["aliases"]
    ]
    score = 0.0
    for raw_alias, meaning in aliases:
        alias = _normalise(raw_alias)
        if len(meaning.split()) > 1 and meaning in meaningful_query:
            score += 2.5
        elif len(meaning.split()) == 1 and alias == qnorm and _TOKEN_FEATURE_FREQUENCY.get(meaning, 0) == 1:
            score += 1.4
        elif len(meaning.split()) == 1 and alias in qnorm and _TOKEN_FEATURE_FREQUENCY.get(meaning, 0) == 1:
            score += 1.4
    alias_tokens = _feature_tokens(feature)
    score += min(
        3.2,
        sum(0.75 / math.sqrt(max(1, _TOKEN_FEATURE_FREQUENCY.get(token, 1))) for token in query_tokens & alias_tokens),
    )

    # Small typo tolerance supports informal Romanized Bengali without allowing
    # fuzzy matching alone to route ordinary general questions into the KB.
    if query_tokens and alias_tokens:
        fuzzy_hits = 0
        for token in query_tokens:
            if not re.fullmatch(r"[a-z0-9]+", token) or len(token) < 5 or token in alias_tokens:
                continue
            if any(SequenceMatcher(None, token, candidate).ratio() >= 0.83 for candidate in alias_tokens if abs(len(token) - len(candidate)) <= 2):
                fuzzy_hits += 1
        score += min(1.5, fuzzy_hits * 0.8)
    return score


def _allowed(feature: Dict[str, Any], role: Optional[str]) -> bool:
    role = (role or "public").strip().lower()
    allowed = feature["roles"]
    return "public" in allowed or role in allowed


def retrieve_platform_knowledge(
    message: str,
    *,
    current_page: Optional[str] = None,
    history: Optional[Iterable[Dict[str, Any]]] = None,
    role: Optional[str] = None,
    limit: int = 3,
) -> Optional[Dict[str, Any]]:
    """Retrieve a few relevant, role-appropriate facts; return None off-topic."""
    query = str(message or "").strip()
    if not query:
        return None

    # For a terse follow-up, include only the latest prior user turn as retrieval
    # hints. Full conversation history remains separately available to Gemini.
    if DEICTIC_RE.search(query):
        for item in reversed(list(history or [])[-8:]):
            if not isinstance(item, dict):
                continue
            sender = str(item.get("sender") or item.get("role") or "").lower()
            if sender in ("user", "citizen"):
                previous = item.get("text") or item.get("content") or ""
                if isinstance(previous, str) and previous.strip():
                    query = f"{query}\n{previous[:500]}"
                break

    candidates: List[Tuple[float, Dict[str, Any]]] = []
    restricted: List[Tuple[float, Dict[str, Any]]] = []
    for feature in FEATURES:
        score = _score(query, feature)
        if score >= 2.1:
            (candidates if _allowed(feature, role) else restricted).append((score, feature))
    candidates.sort(key=lambda entry: entry[0], reverse=True)

    selected: List[Dict[str, Any]] = []
    threshold = 2.1
    for score, feature in candidates:
        if score < threshold or len(selected) >= max(1, min(limit, 4)):
            break
        if feature["id"] not in {entry["id"] for entry in selected}:
            selected.append(feature)

    safe_page = current_page if current_page in PAGE_LABELS else None
    if safe_page and DEICTIC_RE.search(str(message)):
        page_features = [item for item in FEATURES if item["route"] == safe_page]
        if page_features and _allowed(page_features[0], role):
            page_feature = page_features[0]
            if page_feature["id"] not in {entry["id"] for entry in selected}:
                selected.insert(0, page_feature)
                selected = selected[:max(1, min(limit, 4))]
        elif page_features:
            restricted.append((2.1, page_features[0]))

    if not selected:
        if restricted:
            _, feature = max(restricted, key=lambda entry: entry[0])
            needed_roles = "Officer or Admin" if "officer" in feature["roles"] else "Admin"
            return {
                "context": (
                    f"Access notice: {feature['title']} is restricted to {needed_roles} accounts. "
                    "The authenticated user's role does not grant access. Do not describe private records or "
                    "offer a way to bypass the role check. Direct the user to an authorized administrator if their role is wrong."
                ),
                "feature_ids": [f"{feature['id']}_access"],
                "routes": [],
                "page": safe_page,
            }
        return None

    entries = []
    for feature in selected:
        route = feature["route"]
        entries.append(
            f"Feature: {feature['title']}\n"
            f"Actual in-app location: {feature['title']} (hash route #/{route}).\n"
            f"Verified product facts: {feature['facts']}\n"
            f"Source files: {', '.join(feature['sources'])}"
        )
    return {
        "context": "\n\n---\n\n".join(entries),
        "feature_ids": [item["id"] for item in selected],
        "routes": [item["route"] for item in selected],
        "page": safe_page,
    }

