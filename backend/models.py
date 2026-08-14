import datetime
import uuid
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True, nullable=False)  # Phone number or username
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    messages_sent = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    memberships = relationship("ConversationMember", back_populates="user", cascade="all, delete-orphan")
    receipts = relationship("MessageReceipt", back_populates="user", cascade="all, delete-orphan")
    reactions = relationship("Reaction", back_populates="user", cascade="all, delete-orphan")

class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Helper relationships to load user profiles
    user = relationship("User", foreign_keys=[user_id])
    contact = relationship("User", foreign_keys=[contact_id])

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=True)  # Group name, None for 1-to-1
    is_group = Column(Boolean, default=False)
    avatar_url = Column(String, nullable=True)  # Group avatar
    disappearing_time = Column(Integer, default=0)  # Timer in seconds, 0 = disabled
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

class ConversationMember(Base):
    __tablename__ = "conversation_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_admin = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User", back_populates="memberships")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=True)
    message_type = Column(String, default="text")  # 'text' or 'attachment'
    attachment_url = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
    attachment_size = Column(Integer, nullable=True)
    reply_to_id = Column(String, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", back_populates="messages_sent", foreign_keys=[sender_id])
    receipts = relationship("MessageReceipt", back_populates="message", cascade="all, delete-orphan")
    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")
    
    # Self-referential relationship for replies
    reply_to = relationship("Message", remote_side=[id], post_update=True)

class MessageReceipt(Base):
    __tablename__ = "message_receipts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="sent")  # 'sent', 'delivered', 'read'
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    message = relationship("Message", back_populates="receipts")
    user = relationship("User", back_populates="receipts")

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    message = relationship("Message", back_populates="reactions")
    user = relationship("User", back_populates="reactions")
