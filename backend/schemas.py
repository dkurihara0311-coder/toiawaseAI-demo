from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

class ChatMessage(BaseModel):
    role: str # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    session_id: Optional[UUID] = None

class ChatResponse(BaseModel):
    answer: str
    references: List[dict]
