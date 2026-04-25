from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from utils.websocket import manager

router = APIRouter(prefix="/ws", tags=["websocket"])

@router.websocket("/kitchen/{store_id}")
async def websocket_endpoint(websocket: WebSocket, store_id: int):
    print(f"Attempting WS connection for store {store_id}")
    await manager.connect(websocket, store_id)
    try:
        while True:
            data = await websocket.receive_text()
            # await manager.send_personal_message(f"You wrote: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, store_id)

@router.websocket("/admin/{store_id}")
async def admin_websocket_endpoint(websocket: WebSocket, store_id: int):
    """Staff / Register / Admin views share the same kitchen broadcast channel."""
    print(f"Attempting Admin WS connection for store {store_id}")
    await manager.connect(websocket, store_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, store_id)

@router.websocket("/customer/{store_id}/{table_number}")
async def customer_websocket_endpoint(websocket: WebSocket, store_id: int, table_number: str):
    print(f"Attempting Customer WS connection for store {store_id} table {table_number}")
    await manager.connect_customer(websocket, store_id, table_number)
    try:
        while True:
            data = await websocket.receive_text()
            # currently no incoming messages expected from customer WS
    except WebSocketDisconnect:
        manager.disconnect_customer(websocket, store_id, table_number)
