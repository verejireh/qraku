from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from typing import List, Dict, Optional
import hashlib
from database import get_session
import os
from models import SystemConfig, TranslationCache, Store
from utils.translation import translate_batch_with_gemini
from utils.jwt import require_admin

router = APIRouter(prefix="/translate", tags=["translation"])

class BatchTranslationRequest(BaseModel):
    name_ja: str
    description_ja: Optional[str] = ""
    target_langs: List[str]

# We need to compute hash quickly for text caching
def get_text_hash(text: str) -> str:
    return hashlib.md5(text.encode('utf-8')).hexdigest()

@router.post("/")
async def translate_batch(request: BatchTranslationRequest, admin_store: Store = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    if not request.name_ja and not request.description_ja:
        return {}
        
    try:
        # Fetch Gemini API Key from DB or ENV
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            config = await session.get(SystemConfig, "GEMINI_API_KEY")
            api_key = config.value if config else None
            
        if not api_key:
            print("WARNING: No Gemini API Key found in .env or SystemConfig.")
            raise HTTPException(status_code=500, detail="번역 서버 설정이 누락되었습니다.")
            
        # Batch translation using Gemini
        result = translate_batch_with_gemini(
            name_ja=request.name_ja,
            description_ja=request.description_ja,
            target_langs=request.target_langs,
            api_key=api_key
        )

        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Batch Translation Error: {e}")
        raise HTTPException(status_code=500, detail="번역 서버 통신 실패")
