import React, { useState, useEffect } from "react";

interface User {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

interface Member {
  id: number;
  user_id: string;
  is_admin: boolean;
  user: User;
}

interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  disappearing_time: number;
  members: Member[];
  last_message: any;
  unread_count: number;
}

interface ConversationInfoModalProps {
  currentUser: User;
  conversation: Conversation;
  onClose: () => void;
  onConversationUpdated: (updatedConv: Conversation) => void;
}

export function ConversationInfoModal({
  currentUser,
  conversation,
  onClose,
  onConversationUpdated,
}: ConversationInfoModalProps) {
  const [disappearingTime, setDisappearingTime] = useState(conversation.disappearing_time);
  const [newMemberUsername, setNewMemberUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check if current user is admin
  const currentMember = conversation.members.find((m) => m.user_id === currentUser.id);
  const isAdmin = currentMember?.is_admin || !conversation.is_group;

  const handleTimerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const time = parseInt(e.target.value, 10);
    setDisappearingTime(time);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversation.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({ disappearing_time: time }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update disappearing messages");

      onConversationUpdated(data);
      setSuccess("Disappearing message timer updated!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberUsername.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`http://localhost:8000/api/conversations/${conversation.id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({ contact_username: newMemberUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add member");

      onConversationUpdated(data);
      setSuccess("Member added successfully!");
      setNewMemberUsername("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `http://localhost:8000/api/conversations/${conversation.id}/members/${userId}`,
        {
          method: "DELETE",
          headers: {
            "X-User-Id": currentUser.id,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to remove member");

      onConversationUpdated(data);
      setSuccess("Member removed successfully!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {conversation.is_group ? "Group Details" : "Chat Details"}
          </h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ color: "var(--color-error)", fontSize: "13px", padding: "8px", backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: "6px", marginBottom: "12px" }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ color: "var(--color-success)", fontSize: "13px", padding: "8px", backgroundColor: "rgba(34, 197, 94, 0.1)", borderRadius: "6px", marginBottom: "12px" }}>
            {success}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          {conversation.is_group ? (
            <div className="avatar avatar-large">
              {conversation.name ? conversation.name.substring(0, 2).toUpperCase() : "G"}
            </div>
          ) : (
            <img
              src={
                conversation.members.find((m) => m.user_id !== currentUser.id)?.user.avatar_url ||
                `https://api.dicebear.com/7.x/initials/svg?seed=Direct`
              }
              alt="Avatar Preview"
              style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover" }}
            />
          )}
          <span style={{ fontSize: "18px", fontWeight: "700" }}>
            {conversation.name ||
              conversation.members.find((m) => m.user_id !== currentUser.id)?.user.display_name}
          </span>
        </div>

        {/* Disappearing Messages Config */}
        <div className="form-group" style={{ marginBottom: "20px" }}>
          <label className="form-label">⏱️ Disappearing Messages</label>
          <select
            className="form-input"
            value={disappearingTime}
            onChange={handleTimerChange}
            disabled={loading}
            style={{ appearance: "auto" }}
          >
            <option value={0}>Off</option>
            <option value={10}>10 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={300}>5 minutes</option>
            <option value={3600}>1 hour</option>
            <option value={86400}>1 day</option>
          </select>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            When enabled, messages disappear after they have been read.
          </span>
        </div>

        <div style={{ borderBottom: "1px solid var(--border-color)", margin: "20px 0" }}></div>

        {/* Group Members Administration */}
        {conversation.is_group && (
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "var(--text-secondary)" }}>
              Group Members ({conversation.members.length})
            </h3>

            {isAdmin && (
              <form onSubmit={handleAddMember} style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter phone or username to add"
                    value={newMemberUsername}
                    onChange={(e) => setNewMemberUsername(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button type="submit" className="btn-primary" style={{ width: "auto" }} disabled={loading}>
                    Add
                  </button>
                </div>
              </form>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
              {conversation.members.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "6px 8px",
                    borderRadius: "6px",
                  }}
                >
                  <img
                    src={member.user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${member.user.username}`}
                    alt={member.user.display_name || member.user.username}
                    style={{ width: "30px", height: "30px", borderRadius: "50%" }}
                  />
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "13.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {member.user.display_name || member.user.username}
                      {member.is_admin && (
                        <span
                          style={{
                            fontSize: "10px",
                            backgroundColor: "var(--brand-blue-light)",
                            color: "var(--brand-blue)",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            marginLeft: "6px",
                            fontWeight: 600,
                          }}
                        >
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && member.user_id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={loading}
                      style={{ color: "var(--color-error)", fontSize: "12px", padding: "4px 8px", borderRadius: "4px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
