"""LandGuard AI / ভূমিসাথী — Conversational AI Chat Service
Supports Gemini API, OpenAI API, and Grounded Bangladesh Land Knowledge Base Fallback.
Handles Bangla, Banglish, and English multi-turn conversations with dynamic application tracking context.
"""

import os
import re
import json
from typing import List, Dict, Any, Optional
import httpx

try:
    import engine
except ImportError:
    from backend import engine


SYSTEM_PROMPT = """You are BhumiSathi AI (ভূমিসাথী), a senior Bangladesh Land Record and Legal Assistant integrated into the LandGuard AI digital land platform.
You communicate fluently in Bengali (বাংলা), English, and Banglish (Bengali written in Latin script), matching the user's language and tone.

Your expertise includes:
1. e-Namjari (ই-নামজারি) Mutation Workflow:
   - 4-stage standard process: Application Submission -> AC (Land) Review -> Field Verification & Hearing -> Order & DCR issuance.
   - Statutory Government Fee: Court Fee ৳20 + Notice Fee ৳50 + Record Correction Fee ৳1000 + DCR Fee ৳100 = Total ৳1,170. (No extra hidden charges).
   - Standard processing timeline: 28 working days (45 days maximum).
   - Mandatory Documents: Registered Sale Deed (মূল সাফ-কবলা বা হেবা দলিল), Chain of deeds (বায়া দলিল), Latest Khatian (খতিয়ান/পর্চা), Land Development Tax (দাখিলা), NID card, and Succession certificate (ওয়ারিশান সনদ, if inherited).
2. Khatian Hierarchy:
   - CS (Cadastral Survey: 1888-1940, base survey during British era)
   - SA (State Acquisition Survey: 1956-1962, post-zamindari abolition)
   - RS (Revisional Survey: 1970-1990, highly authoritative)
   - BS / City Survey (Bangladesh Survey: Current authoritative digital land record)
3. Deed and Ownership Verification:
   - Registry office volume book (বালাম বই), Deed registration under Registration Act 1908.
   - Detecting double-sales, fake power of attorney, ownership chain gaps, and court stay orders.
4. Officer Workflow:
   - AC Land (সহকারী কমিশনার ভূমি), Kanungo, and Union Land Assistant Officer (নায়েব) roles and review decisions (Approved, Correction Required, Rejected, Under Review).

Behavioral Guidelines:
- If real application data is provided in the prompt context, use it accurately to answer the user's inquiry.
- Give structured, polite, and legally accurate answers.
- Always remind citizens that official land mutations must be finalized through the official Land Ministry portal (mutation.land.gov.bd) and AC (Land) office.
"""


class LandAIChatService:
    def __init__(self):
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self.openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    def is_ai_configured(self) -> bool:
        return bool(self.gemini_key or self.openai_key)

    def get_provider_name(self) -> str:
        if self.gemini_key:
            return "Google Gemini AI (Live)"
        if self.openai_key:
            return "OpenAI GPT-4o (Live)"
        return "BhumiSathi Domain Knowledge Engine"

    def extract_tracking_numbers(self, text: str) -> List[str]:
        """Finds any MUT tracking patterns like MUT-2026-DHK-4829 or DHK-4829 or numbers."""
        found = re.findall(r"MUT-[A-Za-z0-9\-]+", text, re.IGNORECASE)
        if not found:
            # Check for pattern like DHK-1234
            alt = re.findall(r"(?:[A-Z]{3}-\d{4,})", text)
            found.extend(alt)
        return list(set(found))

    def fetch_user_context(self, user_id: Optional[int], user_message: str, explicit_tracking_no: Optional[str] = None) -> Dict[str, Any]:
        """Gathers dynamic database context if user is inquiring about their application or a deed."""
        context = {
            "has_context": False,
            "applications": [],
            "referenced_application": None
        }

        # 1. Check explicit tracking number or extracted from message
        tracking_candidates = []
        if explicit_tracking_no:
            tracking_candidates.append(explicit_tracking_no.strip())
        
        extracted = self.extract_tracking_numbers(user_message)
        tracking_candidates.extend(extracted)

        for track_no in tracking_candidates:
            app = engine.get_mutation_application(track_no)
            if app:
                context["referenced_application"] = app
                context["has_context"] = True
                break

        # 2. Check if user asks about "my application" / "আমার আবেদন" and user_id is given
        asks_my_app = any(w in user_message.lower() for w in [
            "আমার আবেদন", "আমার নামজারি", "আবেদনের অবস্থা", "আবেদনের স্ট্যাটাস", 
            "my application", "my mutation", "status", "amar abedon", "obostha"
        ])

        if asks_my_app and user_id:
            user_apps = engine.list_mutation_applications(user_id=user_id, role="citizen")
            if user_apps:
                context["applications"] = user_apps[:3]
                context["has_context"] = True
                if not context["referenced_application"] and len(user_apps) > 0:
                    context["referenced_application"] = user_apps[0]

        return context

    async def generate_response(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        user_name: Optional[str] = None,
        tracking_no: Optional[str] = None
    ) -> Dict[str, Any]:
        """Main chat generation handler. Tries live LLM if key available, else grounded local engine."""
        history = history or []
        db_context = self.fetch_user_context(user_id, message, tracking_no)

        # Build context prompt addendum
        context_str = ""
        if db_context["referenced_application"]:
            rapp = db_context["referenced_application"]
            context_str += f"\n[User Live Application Context from Database]:\n"
            context_str += f"- Tracking Number: {rapp.get('tracking_no')}\n"
            context_str += f"- Status: {rapp.get('status')} ({rapp.get('status_bn', '')})\n"
            context_str += f"- Applicant: {rapp.get('applicant_name')} (Phone: {rapp.get('applicant_phone')})\n"
            context_str += f"- Land: {rapp.get('land_area')} শতক, দাগ: {rapp.get('plot_no')}, খতিয়ান: {rapp.get('khatian_no')}, মৌজা: {rapp.get('mouza')}, {rapp.get('upazila')}, {rapp.get('district')}\n"
            context_str += f"- Submission Date: {rapp.get('created_at')}\n"
            if rapp.get('rejection_reason'):
                context_str += f"- Rejection Reason: {rapp.get('rejection_reason')}\n"
            if rapp.get('correction_details'):
                context_str += f"- Required Corrections: {rapp.get('correction_details')}\n"
            if rapp.get('timeline'):
                latest_t = rapp['timeline'][-1]
                context_str += f"- Latest Activity: {latest_t.get('title')} ({latest_t.get('status')}) - {latest_t.get('remarks')}\n"
        elif db_context["applications"]:
            context_str += f"\n[User's Active Applications ({len(db_context['applications'])} found)]:\n"
            for a in db_context["applications"]:
                context_str += f"- {a.get('tracking_no')}: {a.get('status')} ({a.get('mouza')}, দাগ {a.get('plot_no')})\n"

        # 1. If Gemini API key is configured, call Gemini
        if self.gemini_key:
            try:
                res_text = await self._call_gemini(message, history, context_str)
                return {
                    "reply": res_text,
                    "ai_configured": True,
                    "provider": "Google Gemini 1.5 Flash",
                    "referenced_application": db_context.get("referenced_application"),
                    "context_used": db_context["has_context"]
                }
            except Exception as e:
                # Log error and gracefully fall back to local knowledge engine
                print(f"Gemini API call failed: {e}. Falling back to knowledge engine.")

        # 2. If OpenAI API key is configured, call OpenAI
        if self.openai_key:
            try:
                res_text = await self._call_openai(message, history, context_str)
                return {
                    "reply": res_text,
                    "ai_configured": True,
                    "provider": "OpenAI GPT-4o-mini",
                    "referenced_application": db_context.get("referenced_application"),
                    "context_used": db_context["has_context"]
                }
            except Exception as e:
                print(f"OpenAI API call failed: {e}. Falling back to knowledge engine.")

        # 3. Grounded Local Bangladesh Land Knowledge Engine
        fallback_text = self._generate_grounded_fallback(message, history, db_context, user_name)
        return {
            "reply": fallback_text,
            "ai_configured": False,
            "provider": "BhumiSathi Grounded Knowledge Engine",
            "referenced_application": db_context.get("referenced_application"),
            "context_used": db_context["has_context"],
            "setup_hint": "To enable real-time Gemini LLM, set GEMINI_API_KEY environment variable in backend."
        }

    async def _call_gemini(self, message: str, history: List[Dict[str, str]], context_str: str) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_key}"
        
        contents = []
        # Convert history
        for h in history[-8:]:
            role = "user" if h.get("sender") in ("user", "citizen") else "model"
            contents.append({"role": role, "parts": [{"text": h.get("text", "")}]})
        
        user_msg = message
        if context_str:
            user_msg = f"{message}\n\n[System Database Records]:\n{context_str}"
        
        contents.append({"role": "user", "parts": [{"text": user_msg}]})

        payload = {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 1000
            }
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    async def _call_openai(self, message: str, history: List[Dict[str, str]], context_str: str) -> str:
        url = "https://api.openai.com/v1/chat/completions"
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        for h in history[-8:]:
            role = "user" if h.get("sender") in ("user", "citizen") else "assistant"
            messages.append({"role": role, "content": h.get("text", "")})
        
        user_msg = message
        if context_str:
            user_msg = f"{message}\n\n[Database Context]:\n{context_str}"
        
        messages.append({"role": "user", "content": user_msg})

        headers = {
            "Authorization": f"Bearer {self.openai_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 1000
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"OpenAI error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()

    def _generate_grounded_fallback(
        self,
        message: str,
        history: List[Dict[str, str]],
        db_context: Dict[str, Any],
        user_name: Optional[str]
    ) -> str:
        """Rich grounded domain response generator tailored to Bangladesh land administration."""
        msg_lower = message.lower().strip()
        name_prefix = f"সম্মানিত {user_name}, " if user_name else ""

        # 1. Dynamic Application Lookup
        if db_context["referenced_application"]:
            app = db_context["referenced_application"]
            tno = app.get("tracking_no")
            status_en = app.get("status")
            status_bn = app.get("status_bn") or status_en
            mouza = app.get("mouza")
            plot = app.get("plot_no")
            area = app.get("land_area")
            created_at = app.get("created_at")

            lines = [
                f"{name_prefix}আপনার **{tno}** ট্র্যাকিং নম্বরের আবেদনের বিস্তারিত তথ্য নিচে দেওয়া হলো:",
                f"",
                f"• **বর্তমান স্ট্যাটাস:** {status_bn} ({status_en})",
                f"• **আবেদনের তারিখ:** {created_at}",
                f"• **জমির বিবরণ:** মৌজা: {mouza}, দাগ নং: {plot}, জমির পরিমাণ: {area} শতক",
                f"• **আবেদনকারীর নাম:** {app.get('applicant_name')} (ফোন: {app.get('applicant_phone')})",
            ]

            if status_en == "Correction Required" or status_en == "Additional Information Required":
                lines.append(f"")
                lines.append(f"⚠️ **সংশোধনের বিবরণ:** {app.get('correction_details') or 'কর্মকর্তার মন্তব্য অনুযায়ী প্রয়োজনীয় তথ্য বা ফাইল সংশোধন করুন।'}")
                lines.append(f"👉 আপনি ট্র্যাকিং পেজ থেকে 'সংশোধিত তথ্য দাখিল করুন' বাটনে ক্লিক করে তথ্য আপডেট করতে পারেন।")
            elif status_en == "Approved":
                lines.append(f"")
                lines.append(f"✅ **মঞ্জুরির তথ্য:** আপনার নামজারি আবেদন সফলভাবে মঞ্জুর হয়েছে। ডিসিআর ও নতুন খতিয়ান সংগ্রহের জন্য নির্ধারিত ফি পরিশোধ সম্পন্ন করুন।")
            elif status_en == "Rejected":
                lines.append(f"")
                lines.append(f"❌ **বাতিলের কারণ:** {app.get('rejection_reason') or 'কাগজপত্রে গরমিল বা মালিকানা বিরোধ।'}")
            elif status_en == "Under Review":
                lines.append(f"")
                lines.append(f"🔍 সহকারী কমিশনার (ভূমি) কার্যালয়ে আপনার নথি ও বালাম যাচাই চলমান রয়েছে।")

            lines.append(f"\n💡 *আবেদনের বিস্তারিত টাইমলাইন দেখতে উপরের 'আবেদন ট্র্যাকিং' মেনু ব্যবহার করুন।*")
            return "\n".join(lines)

        # 2. Inquiring about multiple applications of current user
        if db_context["applications"]:
            apps = db_context["applications"]
            lines = [
                f"{name_prefix}সিস্টেমে আপনার {len(apps)}টি নামজারি আবেদন পাওয়া গেছে:",
                ""
            ]
            for a in apps:
                s_bn = a.get("status_bn") or a.get("status")
                lines.append(f"• **{a.get('tracking_no')}** — স্ট্যাটাস: `{s_bn}` (মৌজা: {a.get('mouza')}, দাগ: {a.get('plot_no')})")
            lines.append("")
            lines.append("যেকোনো আবেদনের বিস্তারিত দেখতে আমাকে ট্র্যাকিং নম্বরটি লিখে পাঠাতে পারেন।")
            return "\n".join(lines)

        # 3. Fees / খরচ / টাকা / Fee Structure
        if any(w in msg_lower for w in ["খরচ", "ফি", "টাকা", "fee", "cost", "taka", "khoroch", "price"]):
            return (
                f"{name_prefix}ভূমি মন্ত্রণালয়ের সরকারি বিধি অনুযায়ী ই-নামজারির মোট নির্ধারিত ফি **১,১৭০/- (এক হাজার একশত সত্তর) টাকা**।\n\n"
                f"**সরকারি ফির পূর্ণাঙ্গ বিভাজন:**\n"
                f"১. কোর্ট ফি (আবেদন ফি): **২০ টাকা**\n"
                f"২. নোটিশ জারি ফি: **৫০ টাকা**\n"
                f"৩. রেকর্ড সংশোধন ফি: **১,০০০ টাকা**\n"
                f"৪. প্রতিকপি খতিয়ান/ডিসিআর ফি: **১০০ টাকা**\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"**সর্বমোট সরকারি ফি:** **১,১৭০ টাকা**\n\n"
                f"⚠️ *সতর্কতা: সরকার নির্ধারিত ফি ব্যতীত অতিরিক্ত কোনো ফি বা দালাল চক্রের সাথে আর্থিক লেনদেন সম্পূর্ণ বেআইনি।* "
                f"সকল ফি সোনালী ব্যাংক বা মোবাইল ফিনান্সিয়াল সার্ভিস (বিকাশ/নগদ/রকেট)-এর মাধ্যমে অনলাইনে পরিশোধযোগ্য।"
            )

        # 4. Required Documents / প্রয়োজনীয় কাগজপত্র / কাগজ
        if any(w in msg_lower for w in ["কাগজ", "ডকুমেন্ট", "document", "kagoj", "proyojon", "দরকার", "lagbe"]):
            return (
                f"{name_prefix}ই-নামজারি (e-Namjari) আবেদনের জন্য নিম্নোক্ত কাগজপত্র স্ক্যান কপি আকারে দাখিল করতে হবে:\n\n"
                f"১. **মূল দলিল:** রেজিস্ট্রিকৃত সাফ-কবলা, হেবা, হেবা-বিল-এওয়াজ বা বণ্টননামা দলিলের কপি।\n"
                f"২. **বায়া দলিল:** পূর্ববর্তী মালিকানাসূত্রের বায়া দলিলের ধারাবাহিক কপি (প্রযোজ্য ক্ষেত্রে)।\n"
                f"৩. **খতিয়ান/পর্চা:** সর্বশেষ খতিয়ান (CS / SA / RS / BS) এর কপি।\n"
                f"৪. **ভূমি উন্নয়ন কর:** হালনাগাদ দাখিলা (খাজনা পরিশোধের রসিদ)।\n"
                f"৫. **ওয়ারিশান সনদ:** উত্তরাধিকারসূত্রে প্রাপ্ত হলে সংশ্লিষ্ট ইউপি চেয়ারম্যান/মেয়র/কাউন্সিলর প্রদত্ত সনদ।\n"
                f"৬. **এনআইডি ও ছবি:** আবেদনকারী ও গ্রহীতার জাতীয় পরিচয়পত্র এবং পাসপোর্ট সাইজের ছবি।\n\n"
                f"💡 *টিপস: আমাদের 'স্মার্ট ই-নামজারি' পেজে গিয়ে আপনি সরাসরি ড্রাফট তৈরি ও আবেদন জমা দিতে পারবেন।* "
            )

        # 5. Khatian Types / CS / SA / RS / BS / খতিয়ান
        if any(w in msg_lower for w in ["খতিয়ান", "khatian", "porcha", "পর্চা", "cs", "sa", "rs", "bs", "city survey"]):
            return (
                f"{name_prefix}বাংলাদেশে জমি ব্যবস্থাপনায় ৪টি প্রধান জরিপ ও খতিয়ান প্রচলিত রয়েছে:\n\n"
                f"• **CS খতিয়ান (Cadastral Survey):** ১৮৮৮–১৯৪০ সালে ব্রিটিশ আমলে প্রস্তুতকৃত প্রথম পূর্ণাঙ্গ জরিপ। এটি জমির মৌলিক বা আদি খতিয়ান হিসেবে গণ্য হয়।\n"
                f"• **SA খতিয়ান (State Acquisition Survey):** ১৯৫০ সালের জমিদারি অধিগ্রহণ আইনের পর ১৯৫৬–১৯৬২ সালে জমিদারদের নাম বাদ দিয়ে প্রস্তুত হয়।\n"
                f"• **RS খতিয়ান (Revisional Survey):** CS ও SA-এর ভুলত্রুটি সংশোধন করে প্রস্তুতকৃত অত্যন্ত নির্ভরযোগ্য সংশোধিত জরিপ।\n"
                f"• **BS / City Survey (Bangladesh Survey):** ১৯৯৮ থেকে চলমান বাংলাদেশের আধুনিকতম ডিজিটাল ভূমি জরিপ। বর্তমানে এটি সবচেয়ে কার্যকর রেকর্ড।\n\n"
                f"🔍 *যেকোনো জমি ক্রয়ের পূর্বে CS থেকে BS পর্যন্ত ধারাবাহিক মালিকানার বায়া দলিল ও খতিয়ান মিলিয়ে দেখা বাধ্যতামূলক।*"
            )

        # 6. Timeline / সময় কত দিন লাগে / Duration
        if any(w in msg_lower for w in ["সময়", "দিন", "time", "duration", "koto din", "kotodin"]):
            return (
                f"{name_prefix}ই-নামজারি সম্পন্ন হওয়ার সরকারি স্ট্যান্ডার্ড সময়সীমা:\n\n"
                f"• **সাধারণ আবেদনের ক্ষেত্রে:** সর্বোচ্চ **২৮ কার্যদিবস**।\n"
                f"• **উত্তরাধিকার ও সহজ যাচাইয়ের ক্ষেত্রে:** প্রায় **৭ থেকে ১৫ কার্যদিবস**।\n"
                f"• **জটিল বা আপত্তি থাকলে:** সর্বোচ্চ ৪৫ কার্যদিবস।\n\n"
                f"আবেদনের প্রতিটি ধাপ (নায়েব প্রতিবেদন, কানুনগো যাচাই, এসি ল্যান্ড শুনানি) এসএমএস ও আমাদের পোর্টালের ট্র্যাকিং সেকশনে দেখা যায়।"
            )

        # 7. Greetings / হাই / হ্যালো / কেমন আছেন
        if any(w in msg_lower for w in ["হ্যালো", "হাই", "সালাম", "hello", "hi", "hey", "assalamu", "kemon"]):
            return (
                f"আসসালামু আলাইকুম {name_prefix}! আমি ভূমিসাথী (BhumiSathi AI) — আপনার ডিজিটাল ভূমি সহকারী।\n\n"
                f"আমি আপনাকে যেভাবে সাহায্য করতে পারি:\n"
                f"১. 📝 **ই-নামজারি আবেদন প্রক্রিয়া ও সরকারি ফি (৳১,১৭০/-)** সংক্রান্ত তথ্য\n"
                f"২. 🔍 **লাইভ আবেদন স্ট্যাটাস যাচাই** (ট্র্যাকিং নম্বর দিলে সাথে সাথে ট্র্যাক করে দেব)\n"
                f"৩. 📜 **খতিয়ান (CS, SA, RS, BS) ও বায়া দলিলের বিধিবিধান**\n"
                f"৪. ⚖️ **ভূমি রেজিস্ট্রেশন আইন, জাল দলিল রোধ ও সতর্কতা**\n\n"
                f"আপনার ভূমি বা আবেদন সম্পর্কিত যেকোনো প্রশ্ন লিখুন!"
            )

        # 8. English / Banglish Query Catch-All
        if re.search(r"^[a-zA-Z0-9\s\?.,!\-']+$", message):
            return (
                f"Greetings! I am BhumiSathi AI, your LandGuard Assistant.\n\n"
                f"• **Official e-Mutation Fee:** Exactly BDT 1,170 (Court Fee ৳20 + Notice ৳50 + Record ৳1000 + DCR ৳100).\n"
                f"• **Application Tracking:** Enter your tracking number (e.g., `MUT-2026-DHK-4829`) to inspect live real-time status.\n"
                f"• **Required Documents:** Original registered deed, chain deeds (Baya Dalil), recent Khatian (BS/RS), updated Dakhila, and NID.\n"
                f"• **Processing Time:** Standard 28 working days under AC (Land) jurisdiction.\n\n"
                f"How may I assist you with your land records today?"
            )

        # Default Bengali Assistant Response
        return (
            f"{name_prefix}আপনার প্রশ্নের জন্য ধন্যবাদ।\n\n"
            f"ভূমি ব্যবস্থাপনা, নামজারি আবেদন, দলিল যাচায় বা আইনি প্রক্রিয়া সংক্রান্ত যেকোনো বিষয়ে আমি আপনাকে তথ্য দিয়ে সহায়তা করতে পারি।\n\n"
            f"• আপনার কোনো নির্দিষ্ট আবেদন থাকলে তার **ট্র্যাকিং নম্বর** (যেমন: `MUT-2026-DHK-4829`) এখানে লিখুন।\n"
            f"• অথবা নামজারি প্রক্রিয়া, সরকারি ফি (৳১,১৭০/-), প্রয়োজনীয় কাগজপত্র, বা খতিয়ান (CS/SA/RS/BS) সম্পর্কে প্রশ্ন করুন।"
        )


# Singleton instance
chat_service = LandAIChatService()
