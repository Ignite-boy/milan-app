"use client";

import { useState } from "react";
import { api } from "../../lib/api";

export default function SettingsPage() {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveSettings() {
    try {
      setSaving(true);
      setMessage("");

      await api("/profile", {
        method: "PUT",
        body: JSON.stringify({
          settings: {
            language: "en-US",
            privacyDefault: "private",
          },
        }),
      });

      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="milan-page">
      <div className="section-heading">
        <span className="eyebrow">SETTINGS</span>
        <h1>Settings</h1>
        <p>Manage your Milan account preferences.</p>
      </div>

      <div className="settings-grid">
        <div className="milan-card">
          <h3>Language</h3>
          <p>English (United States)</p>
        </div>

        <div className="milan-card">
          <h3>Default privacy</h3>
          <p>Your new posts use Private by default.</p>
        </div>

        <div className="milan-card">
          <h3>Session</h3>
          <p>Your active session is stored securely in the browser.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={saveSettings}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save settings"}
      </button>

      {message && <p className="milan-form-message">{message}</p>}
    </main>
  );
}
