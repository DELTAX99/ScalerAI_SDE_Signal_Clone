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

interface SettingsModalProps {
  currentUser: User;
  onClose: () => void;
  onLogout: () => void;
  onProfileUpdated: (user: User) => void;
}

export function SettingsModal({ currentUser, onClose, onLogout, onProfileUpdated }: SettingsModalProps) {
  const [displayName, setDisplayName] = useState(currentUser.display_name || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || "");
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Check dark mode state on mount
    const isDark = document.body.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  const handleToggleTheme = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": currentUser.id,
        },
        body: JSON.stringify({
          display_name: displayName.trim() || currentUser.username,
          avatar_url: avatarUrl.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.username}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update profile");

      onProfileUpdated(data);
      setSuccess("Profile updated successfully!");
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
          <h2 className="modal-title">Settings</h2>
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

        <form onSubmit={handleSaveProfile} style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <img
              src={avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.username}`}
              alt="Avatar Preview"
              style={{ width: "80px", height: "80px", borderRadius: "50%", border: "2px solid var(--brand-blue)", objectFit: "cover" }}
            />
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {currentUser.username}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Avatar URL</label>
            <input
              type="text"
              className="form-input"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="Enter avatar URL"
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>

        <div style={{ borderBottom: "1px solid var(--border-color)", margin: "16px 0" }}></div>

        {/* Theme Settings Option */}
        <div className="settings-option">
          <div className="settings-option-left">
            <span className="settings-option-title">Dark Mode</span>
            <span className="settings-option-desc">Switch application appearance</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={darkMode}
              onChange={handleToggleTheme}
            />
            <span className="slider"></span>
          </label>
        </div>

        <div className="settings-option" style={{ borderBottom: "none" }}>
          <div className="settings-option-left">
            <span className="settings-option-title">Account Session</span>
            <span className="settings-option-desc">Sign out of this device</span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onLogout}
            style={{ color: "var(--color-error)", backgroundColor: "rgba(239, 68, 68, 0.08)", width: "auto", padding: "6px 14px" }}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
