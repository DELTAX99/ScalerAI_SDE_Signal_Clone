from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# --- User Schemas ---

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserVerify(UserBase):
    otp: str

class UserLogin(UserBase):
    pass

class UserResponse(UserBase):
    id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

# --- Contact Schemas ---

class ContactCreate(BaseModel):
    contact_username: str

class ContactResponse(BaseModel):
    id: int
    user_id: str
    contact: UserResponse
    created_at: datetime

    class Config:
        from_attributes = True

# --- Conversation Member Schemas ---

class ConversationMemberResponse(BaseModel):
    id: int
    conversation_id: str
    user_id: str
    user: UserResponse
    is_admin: bool
    joined_at: datetime

    class Config:
        from_attributes = True

# --- Message Receipt & Reaction Schemas ---

class MessageReceiptResponse(BaseModel):
    id: int
    message_id: str
    user_id: str
    status: str
    updated_at: datetime

    class Config:
        from_attributes = True

class ReactionCreate(BaseModel):
    emoji: str

class ReactionResponse(BaseModel):
    id: int
    message_id: str
    user_id: str
    emoji: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Message Schemas ---

class MessageCreate(BaseModel):
    content: Optional[str] = None
    message_type: str = "text"  # 'text' or 'attachment'
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[str] = None
    reply_to_id: Optional[str] = None

# We define a basic/nested version of message response for quoted replies to avoid infinite recursion
class QuotedMessageResponse(BaseModel):
    id: str
    content: Optional[str] = None
    message_type: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    sender_id: Optional[str] = None

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: Optional[str]
    sender: Optional[UserResponse] = None
    content: Optional[str] = None
    message_type: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_size: Optional[int] = None
    reply_to_id: Optional[str] = None
    reply_to: Optional[QuotedMessageResponse] = None
    created_at: datetime
    receipts: List[MessageReceiptResponse] = []
    reactions: List[ReactionResponse] = []

    class Config:
        from_attributes = True

# --- Conversation Schemas ---

class ConversationCreate(BaseModel):
    name: Optional[str] = None
    is_group: bool = False
    member_ids: List[str]  # List of user IDs to include (excluding sender, who will be added automatically)
    disappearing_time: int = 0  # 0 means disabled

class ConversationResponse(BaseModel):
    id: str
    name: Optional[str] = None
    is_group: bool
    avatar_url: Optional[str] = None
    disappearing_time: int
    created_at: datetime
    members: List[ConversationMemberResponse] = []
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

    class Config:
        from_attributes = True

class ConversationUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    disappearing_time: Optional[int] = None
