import os
import json
from google import genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def translate_batch_with_gemini(name_ja: str, description_ja: str, target_langs: list, api_key: str = None) -> dict:
    """
    Translates text to target languages using Gemini API.
    Also returns a mouth-watering rewritten version for the Japanese original.
    Returns a dict with lang codes as keys.
    """
    key = api_key or GEMINI_API_KEY
    if not key:
        print("Warning: Gemini API key not found.")
        raise Exception("Gemini API key is missing.")

    client = genai.Client(api_key=key)

    lang_list_str = ", ".join(target_langs)
    
    prompt = f"""
You are an expert culinary translator and restaurant menu copywriter.
Given the menu item name "{name_ja}" and description "{description_ja}" in Japanese:
1. If the description exists, rewrite it into a "mouth-watering" (감칠맛 나는) and appetizing Japanese description. If the description is empty, create a short appetizing one based on the name.
2. Keep the original menu name in Japanese as is or optionally refine it slightly to sound natural.
3. Translate the *menu name* accurately into the following target languages: {lang_list_str}.
4. Translate the *newly rewritten appetizing Japanese description* into the following target languages: {lang_list_str}.

IMPORTANT: Return the result STRICTLY as a JSON object with this exact structure:
{{
  "ja": {{"name": "...", "description": "..."}},
  "en": {{"name": "...", "description": "..."}},
  ... (include all requested target languages: {lang_list_str})
}}
Output MUST be valid JSON only, without any markdown formatting like ```json.
"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
        )
        
        result_text = response.text.strip()
        # Clean markdown code block if present
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        elif result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
            
        result_json = json.loads(result_text.strip())
        return result_json
    except Exception as e:
        print(f"Gemini Translation Error: {e}")
        raise e


def translate_menu_fields_batch(
    name_ja: str,
    description_ja: str,
    target_langs: list,
    api_key: str = None,
    strict: bool = False,
) -> dict:
    """Worker 전용 배치 — name + description 을 1번의 Gemini call 로 다국어 번역.

    [PG-CAP-05d] translate_menu worker 가 lang × field 마다 별도 호출하던 패턴
    (3 langs × 2 fields = 6 calls) 을 1 call 로 축소. options 처럼 구조가 복잡한
    필드는 호출자에서 별도 처리.

    translate_batch_with_gemini 와의 차이:
      - JA 원문 rewrite 없음 (admin 입력 description 그대로 보존)
      - JA 새 description 생성 없음
      - 응답에 ja 키 없음 — target_langs 만 반환
      - strict=True 시 Gemini 실패 → raise (worker retry trigger)

    Returns:
        {lang: {"name": str, "description": str}, ...} for each lang in target_langs.
        description_ja 가 빈 문자열이면 각 lang 의 description 도 빈 문자열.
    """
    if not name_ja:
        return {lang: {"name": "", "description": ""} for lang in target_langs}

    key = api_key or GEMINI_API_KEY
    if not key:
        print("Warning: Gemini API key not found.")
        if strict:
            raise Exception("Gemini API key is missing.")
        return {lang: {"name": name_ja, "description": description_ja or ""} for lang in target_langs}

    lang_list_str = ", ".join(target_langs)
    has_desc = bool(description_ja)

    prompt = f"""You are an expert culinary translator for a Japanese restaurant menu.

Translate the menu item below from Japanese into the following target languages: {lang_list_str}.

Menu name (Japanese): {name_ja}
Menu description (Japanese): {description_ja if has_desc else "(none)"}

Rules:
- Return ONLY a JSON object. No markdown, no commentary.
- Translate the *original* Japanese text as-is. Do NOT rewrite or refine the Japanese.
- {"Translate the description literally; do not invent new descriptions." if has_desc else "If there is no description, set the description field to an empty string."}
- Each target language must have both a 'name' and 'description' field.

Output structure (exactly this shape):
{{
{', '.join([f'  "{lang}": {{"name": "...", "description": "..."}}' for lang in target_langs])}
}}
"""

    client = genai.Client(api_key=key)
    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
        )
        result_text = response.text.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        elif result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]

        result_json = json.loads(result_text.strip())

        # 응답 형식 가드 — 모든 lang 키 + name/description 필드 존재 확인
        for lang in target_langs:
            if lang not in result_json:
                raise ValueError(f"Missing lang '{lang}' in Gemini batch response")
            entry = result_json[lang]
            if not isinstance(entry, dict) or "name" not in entry or "description" not in entry:
                raise ValueError(f"Malformed entry for lang '{lang}': {entry}")
        return result_json
    except Exception as e:
        print(f"Gemini translate_menu_fields_batch Error: {e}")
        if strict:
            raise
        # non-strict fallback — 옛 동작 (원본 반환)
        return {lang: {"name": name_ja, "description": description_ja or ""} for lang in target_langs}


def translate_text(text: str, dest: str = 'en', api_key: str = None, strict: bool = False) -> str:
    """
    Backward-compatible single-text translation using Gemini.
    Used by menus.py for auto-translating menu names/descriptions/options.

    Args:
        strict: True 시 Gemini API 실패 → exception raise. False (기본) 시
                원본 text 반환 (옛 동작). Dramatiq worker 는 strict=True 사용
                권장 — silent fail 차단 + retry trigger ([PG-CAP-05c]).
    """
    if not text:
        return ""

    key = api_key or GEMINI_API_KEY
    if not key:
        print("Warning: Gemini API key not found.")
        return text

    # Map language codes for the prompt
    lang_names = {
        'en': 'English', 'ko': 'Korean', 'zh': 'Chinese (Simplified)',
        'ja': 'Japanese', 'vi': 'Vietnamese', 'fr': 'French',
        'es': 'Spanish', 'de': 'German', 'it': 'Italian',
        'pt': 'Portuguese', 'ru': 'Russian', 'id': 'Indonesian',
    }
    target_name = lang_names.get(dest.lower(), dest)

    client = genai.Client(api_key=key)
    prompt = f"""Translate the following Japanese text into {target_name}.
Return ONLY the translated text, nothing else. No quotes, no explanation.

Text: {text}"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        print(f"Gemini translate_text Error ({dest}): {e}")
        if strict:
            raise
        return text
