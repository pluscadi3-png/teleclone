import asyncio
import hashlib
import json
import os
import urllib.parse
import urllib.request
from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth import get_current_user, make_initials, serialize_user

router = APIRouter(prefix="/api", tags=["translate"])

LANG_NAMES = {
    "auto": "Auto-detect",
    "en": "English",
    "ur": "Urdu (in Urdu script)",
    "ur-Latn": "Roman Urdu (Pakistani Urdu written in natural English/Latin alphabet)",
    "hi": "Hindi",
    "pa": "Punjabi",
    "ar": "Arabic",
    "tr": "Turkish",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "zh-CN": "Chinese (Simplified)",
    "ru": "Russian",
    "ps": "Pashto",
    "fa": "Persian",
    "id": "Indonesian",
    "pt": "Portuguese",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

_TR_CACHE = OrderedDict()
_TR_CACHE_MAX = 1200


class TranslateReq(BaseModel):
    text: str
    sourceLang: str = "auto"
    targetLang: str = "en"


def _get_groq_key() -> str:
    return (os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_KEY") or "").strip()


def _get_gemini_key() -> str:
    return (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GEMINI_KEY")
        or ""
    ).strip()


def _cache_get(key: str):
    val = _TR_CACHE.get(key)
    if val is not None:
        _TR_CACHE.move_to_end(key)
    return val


def _cache_put(key: str, val: tuple):
    _TR_CACHE[key] = val
    _TR_CACHE.move_to_end(key)
    while len(_TR_CACHE) > _TR_CACHE_MAX:
        _TR_CACHE.popitem(last=False)


def _clean_ai_output(raw: str, fallback: str) -> str:
    txt = (raw or "").strip()
    if len(txt) >= 2 and ((txt[0] == '"' and txt[-1] == '"') or (txt[0] == "'" and txt[-1] == "'")):
        txt = txt[1:-1].strip()
    return txt or fallback


def _build_prompt(text: str, src_code: str, tgt_code: str) -> tuple:
    src_name = LANG_NAMES.get(src_code, src_code or "Auto-detect")
    tgt_name = LANG_NAMES.get(tgt_code, tgt_code or "English")
    sys_msg = (
        "You are an expert real-time chat translator. "
        f"Translate the user's chat message into {tgt_name}. "
        f"Source language hint: {src_name}. "
        "Understand casual chat slang, abbreviations, and Roman Urdu / Hinglish naturally. "
        "Keep emojis, @usernames, URLs, and tone intact. "
        "If the message is already clearly in the target language, return it naturally as-is. "
        "Return ONLY the translated message text with no quotes, no labels, and no explanation."
    )
    return sys_msg, text


def _call_groq(text: str, src_code: str, tgt_code: str) -> str:
    api_key = _get_groq_key()
    if not api_key:
        return ""
    primary = (os.environ.get("GROQ_MODEL") or "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
    models = [primary]
    if primary != "llama-3.1-8b-instant":
        models.append("llama-3.1-8b-instant")

    sys_msg, user_msg = _build_prompt(text, src_code, tgt_code)
    last_err = None

    for model in models:
        try:
            payload = json.dumps(
                {
                    "model": model,
                    "temperature": 0.2,
                    "max_tokens": 512,
                    "messages": [
                        {"role": "system", "content": sys_msg},
                        {"role": "user", "content": user_msg},
                    ],
                }
            ).encode("utf-8")

            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": BROWSER_UA,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                out = data["choices"][0]["message"]["content"]
                cleaned = _clean_ai_output(out, text)
                if cleaned:
                    return cleaned
        except Exception as e:
            last_err = e
            print(f"[translate] Groq ({model}) error:", e)
            continue

    if last_err:
        raise last_err
    return ""


def _call_gemini(text: str, src_code: str, tgt_code: str) -> str:
    api_key = _get_gemini_key()
    if not api_key:
        return ""
    primary = (os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    models = [primary]
    if primary != "gemini-2.0-flash":
        models.append("gemini-2.0-flash")

    sys_msg, user_msg = _build_prompt(text, src_code, tgt_code)
    last_err = None

    for model in models:
        try:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{urllib.parse.quote(model)}:generateContent?key={urllib.parse.quote(api_key)}"
            )
            gen_cfg = {"temperature": 0.2, "maxOutputTokens": 512}
            if "2.5" in model:
                gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}

            payload = json.dumps(
                {
                    "systemInstruction": {"parts": [{"text": sys_msg}]},
                    "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
                    "generationConfig": gen_cfg,
                }
            ).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": BROWSER_UA,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                out = "".join(p.get("text", "") for p in parts if not p.get("thought"))
                cleaned = _clean_ai_output(out, text)
                if cleaned:
                    return cleaned
        except Exception as e:
            last_err = e
            print(f"[translate] Gemini ({model}) error:", e)
            continue

    if last_err:
        raise last_err
    return ""


def _call_google_fallback(text: str, src_code: str, tgt_code: str) -> str:
    sl = "auto" if src_code in ("", "auto", "ur-Latn") else src_code
    tl = "ur" if tgt_code == "ur-Latn" else (tgt_code or "en")
    q = urllib.parse.urlencode(
        {"client": "gtx", "sl": sl, "tl": tl, "dt": "t", "q": text}
    )
    req = urllib.request.Request(
        f"https://translate.googleapis.com/translate_a/single?{q}",
        headers={"User-Agent": BROWSER_UA},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        if isinstance(data, list) and data and isinstance(data[0], list):
            translated = "".join(seg[0] for seg in data[0] if isinstance(seg, list) and seg and seg[0])
            return translated.strip() or text
    return text


def _translate_sync(text: str, src_code: str, tgt_code: str) -> tuple:
    cache_key = hashlib.sha1(f"{src_code}|{tgt_code}|{text}".encode("utf-8")).hexdigest()
    cached = _cache_get(cache_key)
    if cached:
        return cached

    if _get_groq_key():
        try:
            out = _call_groq(text, src_code, tgt_code)
            if out:
                res = (out, "groq")
                _cache_put(cache_key, res)
                return res
        except Exception as e:
            print("[translate] Groq error:", e)

    if _get_gemini_key():
        try:
            out = _call_gemini(text, src_code, tgt_code)
            if out:
                res = (out, "gemini")
                _cache_put(cache_key, res)
                return res
        except Exception as e:
            print("[translate] Gemini error:", e)

    try:
        out = _call_google_fallback(text, src_code, tgt_code)
        res = (out or text, "fallback")
        _cache_put(cache_key, res)
        return res
    except Exception as e:
        print("[translate] Fallback error:", e)
        return (text, "none")


@router.get("/translate/status")
def translate_status(user: dict = Depends(get_current_user)):
    if _get_groq_key():
        engine = "groq"
    elif _get_gemini_key():
        engine = "gemini"
    else:
        engine = "fallback"
    return {"ok": True, "engine": engine}


@router.post("/translate")
async def translate_text(body: TranslateReq, user: dict = Depends(get_current_user)):
    raw = (body.text or "").strip()
    if not raw:
        return {"ok": True, "translatedText": "", "engine": "none"}
    if len(raw) > 2000:
        raise HTTPException(status_code=400, detail="Message too long to translate")

    src = (body.sourceLang or "auto").strip()
    tgt = (body.targetLang or "en").strip()
    if src == tgt and src != "auto":
        return {"ok": True, "translatedText": raw, "engine": "same"}

    translated, engine = await asyncio.to_thread(_translate_sync, raw, src, tgt)
    return {"ok": True, "translatedText": translated, "engine": engine}
