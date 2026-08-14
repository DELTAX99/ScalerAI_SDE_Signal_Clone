import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app, get_current_user
from database import get_db
from models import Base, User

import os

# Setup a test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_signal.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override the database dependency
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Clean up file
    if os.path.exists("./test_signal.db"):
        try:
            os.remove("./test_signal.db")
        except Exception:
            pass

def test_register_user():
    response = client.post(
        "/api/auth/register",
        json={"username": "+12223334444", "display_name": "Test User"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "+12223334444"
    assert data["display_name"] == "Test User"
    assert "id" in data

def test_login_and_verify():
    # Login initiates OTP
    response = client.post(
        "/api/auth/login",
        json={"username": "+12223334444"}
    )
    assert response.status_code == 200
    assert response.json()["otp"] == "123456"

    # Verify OTP
    response_verify = client.post(
        "/api/auth/verify-otp",
        json={"username": "+12223334444", "otp": "123456"}
    )
    assert response_verify.status_code == 200
    assert response_verify.json()["username"] == "+12223334444"

def test_add_contact():
    # Setup two users
    u1_resp = client.post("/api/auth/register", json={"username": "+1111", "display_name": "User 1"})
    u2_resp = client.post("/api/auth/register", json={"username": "+2222", "display_name": "User 2"})
    
    u1_id = u1_resp.json()["id"]
    
    # User 1 adds User 2 as contact
    headers = {"X-User-Id": u1_id}
    response = client.post(
        "/api/contacts",
        json={"contact_username": "+2222"},
        headers=headers
    )
    assert response.status_code == 200
    assert response.json()["username"] == "+2222"

    # Fetch contacts
    response_get = client.get("/api/contacts", headers=headers)
    assert response_get.status_code == 200
    assert len(response_get.json()) == 1
    assert response_get.json()[0]["username"] == "+2222"
