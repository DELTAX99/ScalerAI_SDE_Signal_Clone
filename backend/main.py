import os
import json
import shutil
import uuid
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload

# Local imports (running inside /backend directory)
from database import get_db, init_db, SessionLocal
import models
import schemas
from seed import seed_db
from websocket_manager import manager

app = FastAPI(title="Signal Clone API", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize uploads directory
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.on_event("startup")
def on_startup():
    init_db()
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            print("Database empty. Auto-seeding initial users...")
            seed_db()
    except Exception as e:
        print("Error during auto-seeding check:", e)
    finally:
        db.close()

# Helper to verify auth header and get current user
def get_current_user(x_user_id: Optional[str] = Header(None), db: Session = Depends(get_db)) -> models.User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-Id header missing")
    user = db.query(models.User).filter(models.User.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# --- Authentication / Onboarding Endpoints ---

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username/Phone number already registered")
    
    # Create new user
    new_user = models.User(
        username=user_data.username,
        display_name=user_data.display_name or user_data.username,
        avatar_url=user_data.avatar_url or f"https://api.dicebear.com/7.x/initials/svg?seed={user_data.username}"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/auth/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    # For a mocked authentication, if user doesn't exist, we auto-register them
    if not user:
        user = models.User(
            username=user_data.username,
            display_name=user_data.username,
            avatar_url=f"https://api.dicebear.com/7.x/initials/svg?seed={user_data.username}"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    # Mock OTP sent
    return {"message": "OTP sent", "otp": "123456", "username": user.username}

@app.post("/api/auth/verify-otp", response_model=schemas.UserResponse)
def verify_otp(verify_data: schemas.UserVerify, db: Session = Depends(get_db)):
    if verify_data.otp != "123456":
        raise HTTPException(status_code=400, detail="Invalid OTP code")
    
    user = db.query(models.User).filter(models.User.username == verify_data.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user

@app.get("/api/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.put("/api/auth/me", response_model=schemas.UserResponse)
def update_profile(profile_data: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if profile_data.display_name is not None:
        current_user.display_name = profile_data.display_name
    if profile_data.avatar_url is not None:
        current_user.avatar_url = profile_data.avatar_url
    db.commit()
    db.refresh(current_user)
    return current_user

# --- Contacts API Endpoints ---

@app.get("/api/contacts", response_model=List[schemas.UserResponse])
def get_contacts(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    contacts_rows = db.query(models.Contact).filter(models.Contact.user_id == current_user.id).all()
    # Extract the contact user profiles
    contact_ids = [row.contact_id for row in contacts_rows]
    contacts = db.query(models.User).filter(models.User.id.in_(contact_ids)).all()
    return contacts

@app.post("/api/contacts", response_model=schemas.UserResponse)
def add_contact(contact_data: schemas.ContactCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if contact_data.contact_username == current_user.username:
        raise HTTPException(status_code=400, detail="You cannot add yourself as a contact")
    
    # Find contact by username
    contact_user = db.query(models.User).filter(models.User.username == contact_data.contact_username).first()
    if not contact_user:
        raise HTTPException(status_code=404, detail="User not found with this phone number / username")
    
    # Check if contact link already exists
    existing = db.query(models.Contact).filter(
        models.Contact.user_id == current_user.id,
        models.Contact.contact_id == contact_user.id
    ).first()
    
    if not existing:
        # Create bidirectional contact links for ease of communication
        link1 = models.Contact(user_id=current_user.id, contact_id=contact_user.id)
        link2 = models.Contact(user_id=contact_user.id, contact_id=current_user.id)
        db.add(link1)
        db.add(link2)
        db.commit()
    
    return contact_user

# --- Conversations API Endpoints ---

@app.get("/api/conversations", response_model=List[schemas.ConversationResponse])
def get_conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Find all conversation IDs user belongs to
    memberships = db.query(models.ConversationMember).filter(models.ConversationMember.user_id == current_user.id).all()
    conv_ids = [m.conversation_id for m in memberships]
    
    if not conv_ids:
        return []
    
    # Fetch conversations with members and messages loaded
    conversations = db.query(models.Conversation).filter(models.Conversation.id.in_(conv_ids)).all()
    
    response_list = []
    for conv in conversations:
        # Filter expired disappearing messages before computing last message/unread
        active_messages = []
        now = datetime.datetime.utcnow()
        expired_ids = []
        for msg in conv.messages:
            is_expired = False
            if conv.disappearing_time > 0:
                # Find read receipt for other users (excluding sender)
                for receipt in msg.receipts:
                    if receipt.status == "read" and receipt.user_id != msg.sender_id:
                        diff = (now - receipt.updated_at).total_seconds()
                        if diff > conv.disappearing_time:
                            is_expired = True
                            expired_ids.append(msg.id)
                            break
            if not is_expired:
                active_messages.append(msg)
        
        # Async/sync delete expired messages to clean DB
        if expired_ids:
            db.query(models.Message).filter(models.Message.id.in_(expired_ids)).delete(synchronize_session=False)
            db.commit()
            # Reload messages list after delete
            db.refresh(conv)
            active_messages = [m for m in conv.messages]
        
        # Sort messages by creation time
        active_messages.sort(key=lambda m: m.created_at)
        
        # Compute unread count for current user
        unread_count = 0
        if active_messages:
            for msg in active_messages:
                if msg.sender_id != current_user.id:
                    # Find receipt for current user
                    receipt = next((r for r in msg.receipts if r.user_id == current_user.id), None)
                    if not receipt or receipt.status != "read":
                        unread_count += 1
        
        last_msg = active_messages[-1] if active_messages else None
        
        # Build response item
        members_list = []
        for m in conv.members:
            members_list.append(schemas.ConversationMemberResponse.model_validate(m))
            
        conv_res = schemas.ConversationResponse(
            id=conv.id,
            name=conv.name,
            is_group=conv.is_group,
            avatar_url=conv.avatar_url or (f"https://api.dicebear.com/7.x/identicon/svg?seed={conv.id}" if conv.is_group else None),
            disappearing_time=conv.disappearing_time,
            created_at=conv.created_at,
            members=members_list,
            last_message=schemas.MessageResponse.model_validate(last_msg) if last_msg else None,
            unread_count=unread_count
        )
        response_list.append(conv_res)
        
    # Sort conversations by last message timestamp (or creation timestamp if no messages)
    def get_sort_key(c):
        if c.last_message:
            return c.last_message.created_at
        return c.created_at
        
    response_list.sort(key=get_sort_key, reverse=True)
    return response_list

@app.post("/api/conversations", response_model=schemas.ConversationResponse)
def create_conversation(conv_data: schemas.ConversationCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # If 1-on-1, check if conversation already exists
    if not conv_data.is_group:
        if not conv_data.member_ids:
            raise HTTPException(status_code=400, detail="1-on-1 conversation requires exactly 1 member ID")
        other_user_id = conv_data.member_ids[0]
        
        # Query conversations where both current_user and other_user are members
        query = db.query(models.Conversation).filter(models.Conversation.is_group == False)
        for conv in query.all():
            m_ids = [m.user_id for m in conv.members]
            if current_user.id in m_ids and other_user_id in m_ids:
                # Return existing conversation
                return schemas.ConversationResponse.model_validate(conv)
    
    # Create new conversation
    new_conv = models.Conversation(
        id=str(uuid.uuid4()),
        name=conv_data.name if conv_data.is_group else None,
        is_group=conv_data.is_group,
        disappearing_time=conv_data.disappearing_time,
        avatar_url=f"https://api.dicebear.com/7.x/identicon/svg?seed={conv_data.name or str(uuid.uuid4())}" if conv_data.is_group else None
    )
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    
    # Add creator
    creator_member = models.ConversationMember(
        conversation_id=new_conv.id,
        user_id=current_user.id,
        is_admin=True
    )
    db.add(creator_member)
    
    # Add other members
    for uid in conv_data.member_ids:
        # Check if user exists
        exists = db.query(models.User).filter(models.User.id == uid).first()
        if exists:
            member = models.ConversationMember(
                conversation_id=new_conv.id,
                user_id=uid,
                is_admin=False
            )
            db.add(member)
            
    db.commit()
    db.refresh(new_conv)
    
    return schemas.ConversationResponse.model_validate(new_conv)

@app.put("/api/conversations/{conversation_id}", response_model=schemas.ConversationResponse)
def update_conversation(conversation_id: str, update_data: schemas.ConversationUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # Verify user is a member
    is_member = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to edit this conversation")
        
    if update_data.name is not None and conv.is_group:
        conv.name = update_data.name
    if update_data.avatar_url is not None and conv.is_group:
        conv.avatar_url = update_data.avatar_url
    if update_data.disappearing_time is not None:
        conv.disappearing_time = update_data.disappearing_time
        
    db.commit()
    db.refresh(conv)
    return schemas.ConversationResponse.model_validate(conv)

@app.post("/api/conversations/{conversation_id}/members", response_model=schemas.ConversationResponse)
def add_group_member(conversation_id: str, member_data: schemas.ContactCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Adds a user to group by username
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group conversation not found")
        
    # Check if admin
    membership = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == current_user.id
    ).first()
    if not membership or not membership.is_admin:
        raise HTTPException(status_code=403, detail="Only group admins can add members")
        
    new_user = db.query(models.User).filter(models.User.username == member_data.contact_username).first()
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if already a member
    already_member = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == new_user.id
    ).first()
    
    if not already_member:
        new_member = models.ConversationMember(
            conversation_id=conversation_id,
            user_id=new_user.id,
            is_admin=False
        )
        db.add(new_member)
        db.commit()
        db.refresh(conv)
        
    return schemas.ConversationResponse.model_validate(conv)

@app.delete("/api/conversations/{conversation_id}/members/{user_id}", response_model=schemas.ConversationResponse)
def remove_group_member(conversation_id: str, user_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv or not conv.is_group:
        raise HTTPException(status_code=404, detail="Group conversation not found")
        
    # Check admin
    membership = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == current_user.id
    ).first()
    
    # User can remove themselves, or an admin can remove others
    is_self_removal = (user_id == current_user.id)
    if not is_self_removal and (not membership or not membership.is_admin):
        raise HTTPException(status_code=403, detail="Only group admins can remove members")
        
    # Find member to remove
    to_remove = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == user_id
    ).first()
    
    if to_remove:
        db.delete(to_remove)
        db.commit()
        db.refresh(conv)
        
    return schemas.ConversationResponse.model_validate(conv)

# --- Messages API Endpoints ---

@app.get("/api/conversations/{conversation_id}/messages", response_model=List[schemas.MessageResponse])
def get_messages(conversation_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # Verify user is a member
    is_member = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to view messages")
        
    # Fetch messages
    messages = db.query(models.Message).filter(models.Message.conversation_id == conversation_id).all()
    
    # Mark messages from other senders as 'read'
    now = datetime.datetime.utcnow()
    unread_msg_ids = []
    for msg in messages:
        if msg.sender_id != current_user.id:
            receipt = db.query(models.MessageReceipt).filter(
                models.MessageReceipt.message_id == msg.id,
                models.MessageReceipt.user_id == current_user.id
            ).first()
            
            if not receipt:
                receipt = models.MessageReceipt(
                    message_id=msg.id,
                    user_id=current_user.id,
                    status="read",
                    updated_at=now
                )
                db.add(receipt)
                unread_msg_ids.append(msg.id)
            elif receipt.status != "read":
                receipt.status = "read"
                receipt.updated_at = now
                unread_msg_ids.append(msg.id)
                
    if unread_msg_ids:
        db.commit()
        # Broadcast read receipt notifications to conversation members
        member_ids = [m.user_id for m in conv.members]
        for msg_id in unread_msg_ids:
            # We can notify sender about the read status
            # Find the message sender ID
            m_obj = db.query(models.Message).filter(models.Message.id == msg_id).first()
            if m_obj and m_obj.sender_id:
                receipt_payload = {
                    "type": "receipt",
                    "conversation_id": conversation_id,
                    "message_id": msg_id,
                    "user_id": current_user.id,
                    "status": "read",
                    "timestamp": now.isoformat()
                }
                # Broadcast
                app.state.loop_ref = True # Placeholder
                import asyncio
                # Run broadcast asynchronously
                asyncio.create_task(manager.broadcast_to_conversation(member_ids, receipt_payload))

    # Filter out expired disappearing messages on retrieve
    active_messages = []
    expired_ids = []
    for msg in messages:
        is_expired = False
        if conv.disappearing_time > 0:
            for receipt in msg.receipts:
                if receipt.status == "read" and receipt.user_id != msg.sender_id:
                    diff = (now - receipt.updated_at).total_seconds()
                    if diff > conv.disappearing_time:
                        is_expired = True
                        expired_ids.append(msg.id)
                        break
        if not is_expired:
            active_messages.append(msg)
            
    if expired_ids:
        db.query(models.Message).filter(models.Message.id.in_(expired_ids)).delete(synchronize_session=False)
        db.commit()
        
    active_messages.sort(key=lambda m: m.created_at)
    return active_messages

@app.post("/api/conversations/{conversation_id}/messages", response_model=schemas.MessageResponse)
async def send_message(conversation_id: str, msg_data: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # Verify user is member
    is_member = db.query(models.ConversationMember).filter(
        models.ConversationMember.conversation_id == conversation_id,
        models.ConversationMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Not authorized to send messages to this conversation")
        
    # Create message
    new_msg = models.Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=msg_data.content,
        message_type=msg_data.message_type,
        attachment_url=msg_data.attachment_url,
        attachment_name=msg_data.attachment_name,
        attachment_size=msg_data.attachment_size,
        reply_to_id=msg_data.reply_to_id
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    
    # Create message receipts for other members
    member_ids = [m.user_id for m in conv.members]
    for m_id in member_ids:
        if m_id == current_user.id:
            # Sender automatically reads their own message
            receipt = models.MessageReceipt(
                message_id=new_msg.id,
                user_id=current_user.id,
                status="read"
            )
            db.add(receipt)
        else:
            # Others get 'delivered' if online, else 'sent'
            status = "delivered" if manager.is_user_online(m_id) else "sent"
            receipt = models.MessageReceipt(
                message_id=new_msg.id,
                user_id=m_id,
                status=status
            )
            db.add(receipt)
            
    db.commit()
    db.refresh(new_msg)
    
    # Construct response
    res = schemas.MessageResponse.model_validate(new_msg)
    
    # Broadcast to conversation members via WebSocket
    broadcast_payload = {
        "type": "message",
        "conversation_id": conversation_id,
        "message": res.model_dump(mode='json')
    }
    await manager.broadcast_to_conversation(member_ids, broadcast_payload)
    
    return res

@app.post("/api/conversations/{conversation_id}/upload")
def upload_file(conversation_id: str, file: UploadFile = File(...), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    # Save file
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_url = f"/uploads/{unique_filename}"
    file_size = os.path.getsize(file_path)
    
    return {
        "url": file_url,
        "name": file.filename,
        "size": file_size
    }

# --- Reactions Endpoints ---

@app.post("/api/messages/{message_id}/reactions", response_model=List[schemas.ReactionResponse])
async def toggle_reaction(message_id: str, react_data: schemas.ReactionCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    # Check if user already reacted with this emoji
    existing = db.query(models.Reaction).filter(
        models.Reaction.message_id == message_id,
        models.Reaction.user_id == current_user.id,
        models.Reaction.emoji == react_data.emoji
    ).first()
    
    action = "add"
    if existing:
        db.delete(existing)
        action = "remove"
    else:
        new_react = models.Reaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=react_data.emoji
        )
        db.add(new_react)
        
    db.commit()
    db.refresh(message)
    
    # Broadcast to conversation members
    conv_members = [m.user_id for m in message.conversation.members]
    broadcast_payload = {
        "type": "reaction",
        "conversation_id": message.conversation_id,
        "message_id": message_id,
        "user_id": current_user.id,
        "emoji": react_data.emoji,
        "action": action
    }
    await manager.broadcast_to_conversation(conv_members, broadcast_payload)
    
    reactions = db.query(models.Reaction).filter(models.Reaction.message_id == message_id).all()
    return reactions

# --- Real-Time WebSocket Endpoint ---

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, db: Session = Depends(get_db)):
    # Handshake & register user
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        await websocket.close(code=1008, reason="User does not exist")
        return
        
    await manager.connect(user_id, websocket)
    
    # Set user online status
    user.is_online = True
    db.commit()
    
    # Broadcast status change to contacts
    contacts_rows = db.query(models.Contact).filter(models.Contact.user_id == user_id).all()
    contact_ids = [row.contact_id for row in contacts_rows]
    
    status_payload = {
        "type": "status",
        "user_id": user_id,
        "is_online": True,
        "last_seen": user.last_seen.isoformat()
    }
    await manager.broadcast_to_conversation(contact_ids, status_payload)
    
    try:
        while True:
            # Wait for client messages
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            event_type = payload.get("type")
            conv_id = payload.get("conversation_id")
            
            if not conv_id:
                continue
                
            # Fetch member IDs for routing
            memberships = db.query(models.ConversationMember).filter(models.ConversationMember.conversation_id == conv_id).all()
            member_ids = [m.user_id for m in memberships]
            
            if event_type == "typing":
                is_typing = payload.get("is_typing", False)
                broadcast_payload = {
                    "type": "typing",
                    "conversation_id": conv_id,
                    "user_id": user_id,
                    "is_typing": is_typing
                }
                await manager.broadcast_to_conversation(member_ids, broadcast_payload, exclude_user_id=user_id)
                
            elif event_type == "receipt":
                msg_id = payload.get("message_id")
                status = payload.get("status")  # 'read' or 'delivered'
                if msg_id and status:
                    receipt = db.query(models.MessageReceipt).filter(
                        models.MessageReceipt.message_id == msg_id,
                        models.MessageReceipt.user_id == user_id
                    ).first()
                    
                    now = datetime.datetime.utcnow()
                    if not receipt:
                        receipt = models.MessageReceipt(
                            message_id=msg_id,
                            user_id=user_id,
                            status=status,
                            updated_at=now
                        )
                        db.add(receipt)
                    else:
                        receipt.status = status
                        receipt.updated_at = now
                        
                    db.commit()
                    
                    broadcast_payload = {
                        "type": "receipt",
                        "conversation_id": conv_id,
                        "message_id": msg_id,
                        "user_id": user_id,
                        "status": status,
                        "timestamp": now.isoformat()
                    }
                    await manager.broadcast_to_conversation(member_ids, broadcast_payload)
                    
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
        
        # Check if user has other tabs open. If not, set offline
        if not manager.is_user_online(user_id):
            # Fetch user again to avoid session conflicts
            u = db.query(models.User).filter(models.User.id == user_id).first()
            if u:
                u.is_online = False
                u.last_seen = datetime.datetime.utcnow()
                db.commit()
                
                # Broadcast offline status
                offline_payload = {
                    "type": "status",
                    "user_id": user_id,
                    "is_online": False,
                    "last_seen": u.last_seen.isoformat()
                }
                await manager.broadcast_to_conversation(contact_ids, offline_payload)
                
    except Exception as e:
        print(f"Error in websocket for user {user_id}: {e}")
        manager.disconnect(user_id, websocket)
