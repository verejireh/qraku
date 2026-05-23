from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import GlobalReview, ReviewCreate, Customer, Store, CustomerPoint, PointHistory, PointTransactionType
import json
from datetime import datetime
from utils.time_helpers import now_utc_naive

router = APIRouter(prefix="/reviews", tags=["reviews"])

@router.post("/")
async def create_review(review_in: ReviewCreate, session: AsyncSession = Depends(get_session)):
    # 1. Fetch Store to check settings
    store = await session.get(Store, review_in.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # 2. Create GlobalReview
    db_review = GlobalReview(
        store_id=review_in.store_id,
        order_id=review_in.order_id,
        customer_id=review_in.customer_id,
        rating=review_in.rating,
        tags=json.dumps(review_in.tags),
        comment=review_in.comment
    )
    session.add(db_review)
    
    # 3. Add Review Points if enabled
    points_earned = 0
    if store.points_enabled:
        points_earned = store.point_review_bonus
        
        # Get or create point record for this store
        statement = select(CustomerPoint).where(
            CustomerPoint.customer_id == review_in.customer_id,
            CustomerPoint.store_id == review_in.store_id
        )
        res = await session.execute(statement)
        pt_record = res.scalar_one_or_none()
        
        if not pt_record:
            pt_record = CustomerPoint(
                customer_id=review_in.customer_id,
                store_id=review_in.store_id,
                balance=0
            )
        
        pt_record.balance += points_earned
        pt_record.updated_at = now_utc_naive()
        session.add(pt_record)
        
        # Log History
        history = PointHistory(
            customer_id=review_in.customer_id,
            store_id=review_in.store_id,
            amount=points_earned,
            tx_type=PointTransactionType.EARNED,
            description=f"Review Bonus for Store: {store.name}"
        )
        session.add(history)
    
    await session.commit()
    await session.refresh(db_review)
    return {
        "message": "Review submitted successfully", 
        "points_earned": points_earned
    }

@router.get("/stats/{store_id}")
async def get_store_reviews(store_id: int, session: AsyncSession = Depends(get_session)):
    # Average Rating
    statement = select(func.avg(GlobalReview.rating)).where(GlobalReview.store_id == store_id)
    res = await session.execute(statement)
    avg_rating = res.scalar() or 0.0
    
    # Tag Cloud
    statement = select(GlobalReview.tags).where(GlobalReview.store_id == store_id)
    res = await session.execute(statement)
    tags_list = res.scalars().all()
    
    tag_counts = {}
    for t_str in tags_list:
        try:
            tags = json.loads(t_str)
            for k, v in tags.items():
                if v:
                    label = v # Use label directly
                    tag_counts[label] = tag_counts.get(label, 0) + 1
        except: continue
        
    return {
        "average_rating": round(avg_rating, 1),
        "tag_cloud": tag_counts
    }

@router.get("/customer-points/{customer_id}")
async def get_points(
    customer_id: str, 
    store_id: int = Query(...), 
    session: AsyncSession = Depends(get_session)
):
    """
    Isolated point check for specific store.
    """
    statement = select(CustomerPoint).where(
        CustomerPoint.customer_id == customer_id,
        CustomerPoint.store_id == store_id
    )
    res = await session.execute(statement)
    pt_record = res.scalar_one_or_none()
    
    return {"points": pt_record.balance if pt_record else 0}
