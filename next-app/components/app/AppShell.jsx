"use client";

import { useEffect, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Feed from "./Feed";
import RightPanel from "./RightPanel";
import { api } from "../../lib/api";

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const token = localStorage.getItem("milanToken");

      if (!token) {
        window.location.href = "/";
        return;
      }

      try {
        const me = await api("/auth/me");

        if (active) {
          setUser(me);
          setLoading(false);
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("milanToken");
          localStorage.removeItem("milanBootCache");
          window.location.href = "/";
          return;
        }

        if (active) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
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
        <Feed user={user} />
        <RightPanel user={user} />
      </div>
    </div>
  );
}
