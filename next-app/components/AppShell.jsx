"use client";

import { useEffect, useState } from "react";
import Header from "./app/Header";
import Sidebar from "./app/Sidebar";
import Feed from "./app/Feed";
import RightPanel from "./app/RightPanel";
import People from "./app/People";
import Notifications from "./app/Notifications";
import Profile from "./app/Profile";
import Settings from "./app/Settings";
import Saved from "./app/Saved";
import { api } from "../lib/api";

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      const token = localStorage.getItem("milanToken");

      if (!token) {
        window.location.href = "/";
        return;
      }

      try {
        const me = await api("/auth/me");
        setUser(me);
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("milanToken");
          localStorage.removeItem("milanBootCache");
          window.location.href = "/";
          return;
        }
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  function logout() {
    localStorage.removeItem("milanToken");
    localStorage.removeItem("milanBootCache");
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="milan-loading">
        <div className="milan-loading-card">
          <strong>Milan</strong>
          <span>Opening your space...</span>
        </div>
      </main>
    );
  }

  return (
    <div className="milan-app-shell">
      <Header user={user} onLogout={logout} />

      <div className="milan-layout">
        <Sidebar />

        <main className="milan-main">
          <Feed user={user} />
          <People />
          <Notifications />
          <Saved />
          <Profile user={user} />
          <Settings />
        </main>

        <RightPanel user={user} />
      </div>
    </div>
  );
}
