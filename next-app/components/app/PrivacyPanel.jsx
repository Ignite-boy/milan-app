"use client";

import { useState } from "react";
import { api } from "../../lib/api";

export default function PrivacyPanel({ recordId, initialMode = "private" }) {
  const [mode, setMode] = useState(initialMode);
  const [dids, setDids] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function updatePrivacy() {
    if (!recordId) return;

    try {
      setSaving(true);
      setMessage("");

      const sharedWithDids = dids
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.startsWith("did:"));

      await api(`/records/${recordId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({
          accessMode: mode,
          sharedWithDids,
        }),
      });

      setMessage("Privacy updated.");
    } catch (error) {
      setMessage(error.message || "Unable to update privacy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="milan-card privacy-panel">
      <span className="eyebrow">PRIVACY</span>
      <h3>Who can access this post?</h3>

      <select
        value={mode}
        onChange={(event) => setMode(event.target.value)}
      >
        <option value="private">Private</option>
        <option value="public">Public</option>
        <option value="shared_did">Share with DID</option>
      </select>

      {mode === "shared_did" && (
        <textarea
          value={dids}
          onChange={(event) => setDids(event.target.value)}
          placeholder="Paste DIDs separated by commas"
          rows={4}
        />
      )}

      <button
        type="button"
        onClick={updatePrivacy}
        disabled={saving}
      >
        {saving ? "Updating..." : "Update access"}
      </button>

      {message && <p className="milan-form-message">{message}</p>}
    </div>
  );
}
