"use client";

export default function Header({ user, onLogout }) {
  const profileName =
    user?.profile?.display_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Milan User";

  return (
    <header className="milan-header">
      <div className="milan-brand">
        <img src="/assets/milan-logo.png" alt="Milan" />
        <div>
          <strong>Milan</strong>
          <span>Your Space. Your People.</span>
        </div>
      </div>

      <div className="milan-search">
        <input
          type="search"
          placeholder="Search Milan"
          aria-label="Search Milan"
        />
      </div>

      <div className="milan-header-actions">
        <span className="milan-status">Online</span>

        <span className="milan-user-name">{profileName}</span>

        <button
          className="milan-avatar"
          type="button"
          aria-label="Account"
        >
          {profileName.charAt(0).toUpperCase()}
        </button>

        <button className="milan-ghost" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
