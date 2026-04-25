from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import GlobalReview, Store
import json

router = APIRouter(prefix="/ai", tags=["ai"])

@router.get("/reviews-summary")
async def get_reviews_for_ai(area: str = None, session: AsyncSession = Depends(get_session)):
    """
    Extracts all review data for a specific area (or all) in a format 
    optimized for AI summarization.
    """
    statement = select(GlobalReview, Store.name, Store.category).join(Store, GlobalReview.store_id == Store.id)
    
    # Optional area filtering logic would go here if Store had an 'area' field
    # For now we return all to stay AI-ready
    
    results = await session.execute(statement)
    records = results.all()
    
    data_for_ai = []
    for review, store_name, store_cat in records:
        data_for_ai.append({
            "store": store_name,
            "category": store_cat,
            "rating": review.rating,
            "tags": json.loads(review.tags),
            "comment": review.comment,
            "date": review.created_at.isoformat()
        })
        
    return {
        "total_reviews": len(data_for_ai),
        "area_context": area or "Global",
        "data": data_for_ai
    }
