import datetime
import uuid
from database import SessionLocal, engine
import models

def seed_db():
    print("Dropping tables...")
    models.Base.metadata.drop_all(bind=engine)
    
    print("Creating tables...")
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        print("Seeding users...")
        users = [
            models.User(
                id=str(uuid.uuid4()),
                username="+15550100",
                display_name="Alice Smith",
                avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=Alice",
                is_online=False,
                last_seen=datetime.datetime.utcnow() - datetime.timedelta(minutes=15)
            ),
            models.User(
                id=str(uuid.uuid4()),
                username="+15550200",
                display_name="Bob Jones",
                avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=Bob",
                is_online=False,
                last_seen=datetime.datetime.utcnow() - datetime.timedelta(hours=2)
            ),
            models.User(
                id=str(uuid.uuid4()),
                username="+15550300",
                display_name="Charlie Brown",
                avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
                is_online=False,
                last_seen=datetime.datetime.utcnow() - datetime.timedelta(days=1)
            ),
            models.User(
                id=str(uuid.uuid4()),
                username="+15550400",
                display_name="Diana Prince",
                avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=Diana",
                is_online=False,
                last_seen=datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
            )
        ]
        
        for u in users:
            db.add(u)
        db.commit()
        
        # Make them all contacts of Alice
        print("Seeding contacts...")
        alice = users[0]
        bob = users[1]
        charlie = users[2]
        diana = users[3]
        
        contacts = [
            # Alice & Bob
            models.Contact(user_id=alice.id, contact_id=bob.id),
            models.Contact(user_id=bob.id, contact_id=alice.id),
            # Alice & Charlie
            models.Contact(user_id=alice.id, contact_id=charlie.id),
            models.Contact(user_id=charlie.id, contact_id=alice.id),
            # Alice & Diana
            models.Contact(user_id=alice.id, contact_id=diana.id),
            models.Contact(user_id=diana.id, contact_id=alice.id),
            # Bob & Charlie
            models.Contact(user_id=bob.id, contact_id=charlie.id),
            models.Contact(user_id=charlie.id, contact_id=bob.id)
        ]
        for c in contacts:
            db.add(c)
        db.commit()
        
        # Create 1-on-1 Conversation between Alice & Bob
        print("Seeding 1-on-1 conversation...")
        conv_ab = models.Conversation(
            id=str(uuid.uuid4()),
            name=None,
            is_group=False,
            disappearing_time=0
        )
        db.add(conv_ab)
        db.commit()
        
        member_a = models.ConversationMember(conversation_id=conv_ab.id, user_id=alice.id, is_admin=False)
        member_b = models.ConversationMember(conversation_id=conv_ab.id, user_id=bob.id, is_admin=False)
        db.add(member_a)
        db.add(member_b)
        db.commit()
        
        # Add messages between Alice & Bob
        messages_ab = [
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=conv_ab.id,
                sender_id=bob.id,
                content="Hey Alice, are we still meeting today?",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=1)
            ),
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=conv_ab.id,
                sender_id=alice.id,
                content="Yes! At 3 PM in the conference room. Does that work?",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=45)
            ),
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=conv_ab.id,
                sender_id=bob.id,
                content="Perfect, see you there! 👍",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=40)
            )
        ]
        for msg in messages_ab:
            db.add(msg)
        db.commit()
        
        # Create receipts and reactions
        # Bob's last message has read receipts from Alice
        for msg in messages_ab:
            receipt_a = models.MessageReceipt(message_id=msg.id, user_id=alice.id, status="read")
            receipt_b = models.MessageReceipt(message_id=msg.id, user_id=bob.id, status="read")
            db.add(receipt_a)
            db.add(receipt_b)
            
        # Add a reaction to Bob's last message
        react = models.Reaction(message_id=messages_ab[2].id, user_id=alice.id, emoji="❤️")
        db.add(react)
        db.commit()
        
        # Create Group Conversation (Signal Devs)
        print("Seeding group conversation...")
        group_conv = models.Conversation(
            id=str(uuid.uuid4()),
            name="Signal Development Team",
            is_group=True,
            avatar_url="https://api.dicebear.com/7.x/identicon/svg?seed=SignalDevs",
            disappearing_time=0
        )
        db.add(group_conv)
        db.commit()
        
        members_group = [
            models.ConversationMember(conversation_id=group_conv.id, user_id=alice.id, is_admin=True),
            models.ConversationMember(conversation_id=group_conv.id, user_id=bob.id, is_admin=False),
            models.ConversationMember(conversation_id=group_conv.id, user_id=charlie.id, is_admin=False)
        ]
        for m in members_group:
            db.add(m)
        db.commit()
        
        # Messages in Group
        messages_group = [
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=group_conv.id,
                sender_id=alice.id,
                content="Welcome to the Signal Clone team chat! Let's get started.",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(days=2)
            ),
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=group_conv.id,
                sender_id=bob.id,
                content="Hi Alice! Excited to build this project.",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(days=2, hours=1)
            ),
            models.Message(
                id=str(uuid.uuid4()),
                conversation_id=group_conv.id,
                sender_id=charlie.id,
                content="Hey everyone! I'll be working on the real-time Websocket endpoints.",
                created_at=datetime.datetime.utcnow() - datetime.timedelta(days=1)
            )
        ]
        for msg in messages_group:
            db.add(msg)
        db.commit()
        
        # Receipts for group messages
        for msg in messages_group:
            for u in [alice, bob, charlie]:
                receipt = models.MessageReceipt(message_id=msg.id, user_id=u.id, status="read")
                db.add(receipt)
        db.commit()
        
        print("Database seeded successfully!")
    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
