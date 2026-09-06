"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { FadeIn } from "../ui/Motion";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Feed from "./Feed";
import { api } from "../../lib/api";

const People = dynamic(() => import("./People"), { ssr: false });
const Notifications = dynamic(() => import("./Notifications"), { ssr: false });
const Saved = dynamic(() => import("./Saved"), { ssr: false });
const Profile = dynamic(() => import("./Profile"), { ssr: false });
const Settings = dynamic(() => import("./Settings"), { ssr: false });
const RightPanel = dynamic(() => import("./RightPanel"), { ssr: false });

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("milanToken");

    if (!token) {
      window.location.replace("/");
      return;
    }

    api("/auth/me")
      .then((me) => {
        setUser(me);
        setAuthChecked(true);
      })
      .catch((error) => {
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("milanToken");
          localStorage.removeItem("milanBootCache");
          window.location.replace("/");
          return;
        }

        // Keep the already-rendered app alive on transient network/API errors.
        setAuthChecked(true);
      });
  }, []);

  function logout() {
    localStorage.removeItem("milanToken");
    localStorage.removeItem("milanBootCache");
    window.location.replace("/");
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

      {!authChecked && (
        <div className="milan-session-indicator" aria-live="polite">
          <span />
        </div>
      )}
    </FadeIn>
  );
}
