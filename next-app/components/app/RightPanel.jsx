"use client";

export default function RightPanel({ user }) {
  return (
    <aside className="milan-right-panel">
      <div className="milan-card">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h2>
          {user?.profile?.display_name ||
            user?.email?.split("@")[0] ||
            "Milan User"}
        </h2>
        <p>{user?.email || ""}</p>
        {user?.did && <p className="milan-did">{user.did}</p>}
      </div>

      <div className="milan-card">
        <span className="eyebrow">PRIVACY</span>
        <h2>Your data stays yours.</h2>
        <p>
          Milan is built around user-owned data and private-by-default
          social sharing.
        </p>
      </div>
    </aside>
  );
}
