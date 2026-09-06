"use client";

export default function Settings() {
  return (
    <section className="milan-section" id="settings">
      <div className="section-heading">
        <span className="eyebrow">SETTINGS</span>
        <h2>Settings</h2>
        <p>Manage your Milan experience.</p>
      </div>

      <div className="settings-grid">
        <div className="milan-card">
          <h3>Privacy</h3>
          <p>Your posts are private by default.</p>
        </div>

        <div className="milan-card">
          <h3>Account</h3>
          <p>Your identity is managed through your Milan DID.</p>
        </div>

        <div className="milan-card">
          <h3>Language</h3>
          <p>English (United States)</p>
        </div>
      </div>
    </section>
  );
}
