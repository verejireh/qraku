from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
import os
import stripe
from database import get_session
from models import Order, Table, Store

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

@router.post("/stripe")
async def stripe_webhook(request: Request, session: AsyncSession = Depends(get_session)):
    if not endpoint_secret:
        raise HTTPException(
            status_code=503,
            detail="Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in environment."
        )
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError as e:
        # Invalid payload
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the checkout.session.completed event
    if event['type'] == 'checkout.session.completed':
        session_obj = event['data']['object']
        
        # Fulfill the purchase...
        await fulfill_checkout(session_obj, session)

    # Passed signature verification
    return {"status": "success"}


async def fulfill_checkout(session_obj, db_session: AsyncSession):
    metadata = session_obj.get("metadata", {})
    order_id_str = metadata.get("order_id")
    shop_id = metadata.get("shop_id")
    table_number_str = metadata.get("table_number")
    
    if not order_id_str:
        print("Webhook Warning: No order_id found in metadata")
        return

    order_id = int(order_id_str)
    
    # 1. Update Order Status
    order = await db_session.get(Order, order_id)
    if order:
        order.payment_status = "paid"
        order.status = "paid"
        db_session.add(order)
        print(f"Webhook Success: Order {order_id} marked as paid.")
    
    # 2. Seamless Table Turnover Automation
    if shop_id and table_number_str:
        # First find the store id using the shop_id slug
        store_result = await db_session.execute(select(Store).where(Store.slug == shop_id))
        store = store_result.scalar_one_or_none()
        
        if not store and shop_id.isdigit():
            store = await db_session.get(Store, int(shop_id))
            
        if store:
            # Find the table based on store_id and table_number
            table_result = await db_session.execute(
                select(Table).where(
                    Table.store_id == store.id, 
                    Table.table_number == table_number_str
                )
            )
            table = table_result.scalar_one_or_none()
            
            if table:
                # AUTO-CLEAR THE TABLE for the next guest
                table.status = "ready"
                table.session_token = None
                table.join_window_end = None
                db_session.add(table)
                print(f"Seamless Turnover: Table {table_number_str} at Store {shop_id} cleared for next guest.")

    # Commit all changes atomically
    await db_session.commit()
    
    # Broadcast to Kitchen and POS WebSocket
    try:
        if store:
            from utils.websocket import manager
            import json
            msg = json.dumps({
                "type": "NEW_ORDER", 
                "order_id": order_id, 
                "table_number": table_number_str
            })
            await manager.broadcast(msg, store.id)
            print(f"WS Broadcast NEW_ORDER sent for Store {store.id}")
    except Exception as e:
        print("WS Broadcast exception in webhook:", e)
