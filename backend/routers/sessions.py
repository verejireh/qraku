from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_session
from models import Table, DeviceSession, Store
from pydantic import BaseModel
import uuid

router = APIRouter(prefix="/sessions", tags=["sessions"])

class SessionRegisterRequest(BaseModel):
    shop_id: int
    table_number: str
    qr_token: str

@router.post("/register")
async def register_device_session(payload: SessionRegisterRequest, session: AsyncSession = Depends(get_session)):
    # 1. Validate Table and QR Token
    statement = select(Table).where(
        Table.store_id == payload.shop_id, 
        Table.table_number == payload.table_number,
        Table.qr_token == payload.qr_token
    )
    result = await session.execute(statement)
    table = result.scalar_one_or_none()
    
    if not table:
        raise HTTPException(status_code=403, detail="Invalid QR code or table information.")
    
    # 2. Create New Device Session
    device_session = DeviceSession(
        table_id=table.id,
        is_active=True
    )
    session.add(device_session)
    await session.commit()
    await session.refresh(device_session)
    
    return {
        "device_token": device_session.id,
        "table_id": table.id,
        "store_id": table.store_id
    }

@router.get("/validate/{device_token}")
async def validate_session(device_token: str, session: AsyncSession = Depends(get_session)):
    device_session = await session.get(DeviceSession, device_token)
    if not device_session or not device_session.is_active:
        return {"valid": False}
    
    return {"valid": True, "table_id": device_session.table_id}
