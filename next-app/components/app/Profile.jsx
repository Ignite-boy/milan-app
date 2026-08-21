"use client";

export default function Profile({ user }) {
  const profile = user?.profile || {};
  const name =
    profile.display_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Milan User";

  return (
    <section className="milan-section" id="profile">
      <div className="milan-card profile-card">
        <div className="profile-avatar">
          {name.charAt(0).toUpperCase()}
        </div>

        <span className="eyebrow">PROFILE</span>
        <h2>{name}</h2>
        <p>{profile.bio || "Welcome to Milan."}</p>

        <div className="profile-meta">
          <div>
            <span>Email</span>
            <strong>{user?.email || "—"}</strong>
          </div>

          <div>
            <span>DID</span>
            <strong>{user?.did || "—"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
