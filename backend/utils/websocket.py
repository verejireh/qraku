from typing import List, Dict, Tuple
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # Changed: Store customer connections strictly by (store_id, table_number)
        self.active_customer_connections: Dict[Tuple[int, str], List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, store_id: int):
        await websocket.accept()
        if store_id not in self.active_connections:
            self.active_connections[store_id] = []
        self.active_connections[store_id].append(websocket)

    def disconnect(self, websocket: WebSocket, store_id: int):
        if store_id in self.active_connections:
            if websocket in self.active_connections[store_id]:
                self.active_connections[store_id].remove(websocket)

    async def broadcast(self, message: str, store_id: int):
        if store_id in self.active_connections:
            for connection in self.active_connections[store_id]:
                await connection.send_text(message)

    # --- Customer WebSockets ---

    async def connect_customer(self, websocket: WebSocket, store_id: int, table_number: str):
        await websocket.accept()
        key = (store_id, str(table_number))
        if key not in self.active_customer_connections:
            self.active_customer_connections[key] = []
        self.active_customer_connections[key].append(websocket)

    def disconnect_customer(self, websocket: WebSocket, store_id: int, table_number: str):
        key = (store_id, str(table_number))
        if key in self.active_customer_connections:
            if websocket in self.active_customer_connections[key]:
                self.active_customer_connections[key].remove(websocket)

    async def broadcast_to_customer(self, message: str, store_id: int, table_number: str):
        key = (store_id, str(table_number))
        if key in self.active_customer_connections:
            # Broadcast to all devices matching this specific table
            for connection in self.active_customer_connections[key]:
                await connection.send_text(message)

manager = ConnectionManager()
