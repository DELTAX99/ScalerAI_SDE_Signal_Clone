import React, { useState } from "react";

interface User {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
}

interface AuthModalProps {
  onAuthSuccess: (user: User) => void;
}

export function AuthModal({ onAuthSuccess }: AuthModalProps) {
  const [step, setStep] = useState<"phone" | "otp" | "profile">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tempUser, setTempUser] = useState<User | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      
      // OTP is fixed at 123456 in backend
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Verification failed");

      setTempUser(data);
      setDisplayName(data.display_name || "");
      setAvatarUrl(data.avatar_url || "");
      
      // If user has a set display name already, log them in straight away
      if (data.display_name && data.display_name !== data.username) {
        onAuthSuccess(data);
      } else {
        setStep("profile");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUser) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": tempUser.id,
        },
        body: JSON.stringify({
          display_name: displayName.trim() || tempUser.username,
          avatar_url: avatarUrl.trim() || `https://api.dicebear.com/7.x/avataaars/svg?seed=${tempUser.username}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Profile update failed");

      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "380px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div className="signal-logo-fallback" style={{ margin: "0 auto 16px auto", width: "70px", height: "70px", fontSize: "30px", borderRadius: "18px" }}>
            💬
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "700" }}>
            {step === "phone" && "Set up Signal"}
            {step === "otp" && "Enter OTP"}
            {step === "profile" && "Profile Info"}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            {step === "phone" && "Enter your phone number or a custom username to start chatting safely."}
            {step === "otp" && "A test verification code (use 123456) was sent to your phone."}
            {step === "profile" && "Set your display name and avatar URL to complete onboarding."}
          </p>
        </div>

        {error && (
          <div style={{ color: "var(--color-error)", fontSize: "13px", padding: "10px", backgroundColor: "rgba(239, 68, 68, 0.1)", borderRadius: "6px", marginBottom: "16px", textAlign: "center" }}>
            {error}
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="form-label">Phone / Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. +15550100 or +15550200"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div style={{ margin: "-8px 0 16px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
              <div style={{ fontWeight: "600", marginBottom: "4px" }}>💡 Test Accounts:</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPhone("+15550100")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color, #e0e0e0)",
                    background: "rgba(44, 107, 237, 0.08)",
                    color: "var(--color-primary, #2c6bed)",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  +15550100 (Alice Smith)
                </button>
                <button
                  type="button"
                  onClick={() => setPhone("+15550200")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color, #e0e0e0)",
                    background: "rgba(44, 107, 237, 0.08)",
                    color: "var(--color-primary, #2c6bed)",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  +15550200 (Bob Jones)
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Sending..." : "Continue"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="form-label">Verification Code (OTP)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Hint: 123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
                disabled={loading}
                style={{ textAlign: "center", fontSize: "20px", letterSpacing: "8px" }}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "8px" }}
              onClick={() => setStep("phone")}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Avatar Image URL (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Leave blank for automatic initials"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Saving..." : "Start Chatting"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
