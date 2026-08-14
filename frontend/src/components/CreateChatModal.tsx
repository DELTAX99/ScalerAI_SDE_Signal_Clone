import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";

interface User {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

interface CreateChatModalProps {
  currentUser: User;
  onClose: () => void;
  onChatCreated: (conversation: any) => void;
}

export function CreateChatModal({ currentUser, onClose, onChatCreated }: CreateChatModalProps) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [searchUsername, setSearchUsername] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts`, {
        headers: { "X-User-Id": currentUser.id },
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.warn("Failed to load contacts:", err);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [currentUser.id]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchUsername.trim()) return;

    setAddError(null);
    setAddSuccess(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({ contact_username: searchUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not add contact");

      setAddSuccess(`Added ${data.display_name || data.username} successfully!`);
      setSearchUsername("");
      fetchContacts();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleStartChat = async (targetUser?: User) => {
    // If not group mode, start direct chat with targetUser
    if (!isGroupMode && targetUser) {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": currentUser.id,
          },
          body: JSON.stringify({
            is_group: false,
            member_ids: [targetUser.id],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create conversation");

        onChatCreated(data);
        onClose();
      } catch (err: any) {
        setAddError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setAddError("Please specify a group name.");
      return;
    }
    if (selectedUserIds.length === 0) {
      setAddError("Please select at least one contact to add to the group.");
      return;
    }

    setAddError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          is_group: true,
          member_ids: selectedUserIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create group");

      onChatCreated(data);
      onClose();
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isGroupMode ? "New Group Chat" : "New Chat"}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {addError && (
          <div style={{ color: "var(--color-error)", fontSize: "13px", padding: "8px", backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: "6px", marginBottom: "12px" }}>
            {addError}
          </div>
        )}
        {addSuccess && (
          <div style={{ color: "var(--color-success)", fontSize: "13px", padding: "8px", backgroundColor: "rgba(34, 197, 94, 0.1)", borderRadius: "6px", marginBottom: "12px" }}>
            {addSuccess}
          </div>
        )}

        {!isGroupMode ? (
          <>
            {/* Add Contact Form */}
            <form onSubmit={handleAddContact} style={{ marginBottom: "20px" }}>
              <div className="form-group" style={{ marginBottom: "8px" }}>
                <label className="form-label">Add Contact by Phone / Username</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter phone or username"
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button type="submit" className="btn-primary" style={{ width: "auto", flexShrink: 0 }} disabled={loading}>
                    Add
                  </button>
                </div>
              </div>
            </form>

            <div style={{ borderBottom: "1px solid var(--border-color)", margin: "16px 0" }}></div>

            {/* Contacts List */}
            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "10px", color: "var(--text-secondary)" }}>
              Contacts ({contacts.length})
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "250px", overflowY: "auto", marginBottom: "16px" }}>
              {contacts.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "13px", padding: "20px" }}>
                  No contacts found. Use search above to add your first contact!
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => handleStartChat(contact)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease",
                      border: "1px solid transparent"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--hover-color)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <img
                      src={contact.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${contact.username}`}
                      alt={contact.display_name || contact.username}
                      style={{ width: "36px", height: "36px", borderRadius: "50%" }}
                    />
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: "14px" }}>
                        {contact.display_name || contact.username}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {contact.username}
                      </div>
                    </div>
                    {contact.is_online && (
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--color-online)" }} />
                    )}
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsGroupMode(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              👥 Create Group Chat
            </button>
          </>
        ) : (
          /* Group Creation Form */
          <form onSubmit={handleCreateGroup}>
            <div className="form-group">
              <label className="form-label">Group Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "10px", color: "var(--text-secondary)" }}>
              Select Members
            </h3>

            <div className="user-select-list" style={{ marginBottom: "20px", maxHeight: "200px" }}>
              {contacts.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "13px", padding: "20px" }}>
                  No contacts available to add.
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="user-select-item"
                    onClick={() => handleToggleSelect(contact.id)}
                  >
                    <input
                      type="checkbox"
                      className="user-select-checkbox"
                      checked={selectedUserIds.includes(contact.id)}
                      onChange={() => {}} // handled by row click
                    />
                    <img
                      src={contact.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${contact.username}`}
                      alt={contact.display_name || contact.username}
                      style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                    />
                    <div style={{ fontWeight: 500, fontSize: "14px" }}>
                      {contact.display_name || contact.username}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setIsGroupMode(false);
                  setSelectedUserIds([]);
                }}
                disabled={loading}
              >
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Creating..." : "Create Group"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
