import json
from typing import Dict, List
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Maps user_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    def is_user_online(self, user_id: str) -> bool:
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    # Connection might be dead, it will be cleaned up on disconnect
                    pass

    async def broadcast_to_conversation(self, conversation_members: List[str], message: dict, exclude_user_id: str = None):
        """
        Sends message payload to all online conversation members.
        """
        for member_id in conversation_members:
            if exclude_user_id and member_id == exclude_user_id:
                continue
            await self.send_personal_message(message, member_id)

manager = ConnectionManager()
