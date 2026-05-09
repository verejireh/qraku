from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from utils.websocket import manager
from routers.ws_token import validate_ws_token

router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/kitchen/{store_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    store_id: int,
    token: str = Query(...),
):
    info = await validate_ws_token(token, expected_audience="kitchen", expected_store_id=store_id)
    if not info:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, store_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, store_id)


@router.websocket("/admin/{store_id}")
async def admin_websocket_endpoint(
    websocket: WebSocket,
    store_id: int,
    token: str = Query(...),
):
    """Staff / Register / Admin views share the same kitchen broadcast channel."""
    info = await validate_ws_token(token, expected_audience="admin", expected_store_id=store_id)
    if not info:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, store_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, store_id)


@router.websocket("/customer/{store_id}/{table_number}")
async def customer_websocket_endpoint(
    websocket: WebSocket,
    store_id: int,
    table_number: str,
    token: str = Query(...),
):
    info = await validate_ws_token(token, expected_audience="customer", expected_store_id=store_id)
    if not info:
        await websocket.close(code=1008)
        return
    await manager.connect_customer(websocket, store_id, table_number)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_customer(websocket, store_id, table_number)
