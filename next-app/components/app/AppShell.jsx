"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { FadeIn } from "../ui/Motion";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Feed from "./Feed";
import { api } from "../../lib/api";

const People = dynamic(() => import("./People"), {
  loading: () => <div className="milan-card">Loading people...</div>,
});

const Notifications = dynamic(() => import("./Notifications"), {
  loading: () => <div className="milan-card">Loading notifications...</div>,
});

const Saved = dynamic(() => import("./Saved"), {
  loading: () => <div className="milan-card">Loading saved posts...</div>,
});

const Profile = dynamic(() => import("./Profile"), {
  loading: () => <div className="milan-card">Loading profile...</div>,
});

const Settings = dynamic(() => import("./Settings"), {
  loading: () => <div className="milan-card">Loading settings...</div>,
});

const RightPanel = dynamic(() => import("./RightPanel"));

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const token = localStorage.getItem("milanToken");

      if (!token) {
        window.location.replace("/");
        return;
      }

      try {
        const me = await api("/auth/me");

        if (mounted) {
          setUser(me);
          setLoading(false);
        }
      } catch (error) {
        if ((error.status === 401 || error.status === 403) && mounted) {
          localStorage.removeItem("milanToken");
          localStorage.removeItem("milanBootCache");
          window.location.replace("/");
          return;
        }

        if (mounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  function logout() {
    localStorage.removeItem("milanToken");
    localStorage.removeItem("milanBootCache");
    window.location.replace("/");
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
    <FadeIn className="milan-app-shell">
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
    </FadeIn>
  );
}
