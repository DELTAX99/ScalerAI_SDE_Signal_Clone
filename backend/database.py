from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from models import Base

DATABASE_URL = "sqlite:///./signal_clone.db"

# check_same_thread=False is needed only for SQLite. It's not needed for other databases.
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
