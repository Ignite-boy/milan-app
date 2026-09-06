"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/auth/me")
      .then((data) => {
        setUser(data);
        setName(data?.profile?.display_name || data?.name || "");
        setBio(data?.profile?.bio || "");
        setWebsite(data?.profile?.website || "");
      })
      .catch(() => {});
  }, []);

  async function saveProfile(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");

      const profile = await api("/profile", {
        method: "PUT",
        body: JSON.stringify({
          display_name: name.trim(),
          bio: bio.trim(),
          website: website.trim(),
        }),
      });

      setUser((current) => ({
        ...current,
        profile,
      }));

      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="milan-page">
      <div className="section-heading">
        <span className="eyebrow">PROFILE</span>
        <h1>Your profile</h1>
        <p>Manage the information people see about you.</p>
      </div>

      <form className="milan-card profile-editor" onSubmit={saveProfile}>
        <label>
          Display name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />
        </label>

        <label>
          Bio
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            placeholder="Tell people about yourself"
          />
        </label>

        <label>
          Website
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://"
          />
        </label>

        <div className="profile-identity">
          <span>Email</span>
          <strong>{user?.email || "Loading..."}</strong>
        </div>

        <div className="profile-identity">
          <span>DID</span>
          <strong>{user?.did || "Loading..."}</strong>
        </div>

        {message && <p className="milan-form-message">{message}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </main>
  );
}
