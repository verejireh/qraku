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


def translate_text(text: str, dest: str = 'en', api_key: str = None) -> str:
    """
    Backward-compatible single-text translation using Gemini.
    Used by menus.py for auto-translating menu names/descriptions/options.
    Returns translated text, or original text on failure.
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
        return text
