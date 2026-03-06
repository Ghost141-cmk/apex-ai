# app/api/ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.connection_manager import ConnectionManager
import json

router = APIRouter()
manager = ConnectionManager()

@router.websocket("/market")
async def ws_market(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("action") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
