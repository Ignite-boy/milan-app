"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    try {
      const data = await api("/social/notifications");
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id) {
    try {
      await api(`/social/notifications/${id}/read`, {
        method: "PATCH",
      });

      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read: true } : item
        )
      );
    } catch {}
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  return (
    <section className="milan-section" id="notifications">
      <div className="section-heading">
        <span className="eyebrow">NOTIFICATIONS</span>
        <h2>Notifications</h2>
        <p>Stay up to date with activity around your account.</p>
      </div>

      <div className="notification-list">
        {loading && (
          <div className="milan-card">Loading notifications...</div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="milan-card">No notifications yet.</div>
        )}

        {notifications.map((item) => (
          <article
            className={`milan-card notification-card ${
              item.read ? "" : "unread"
            }`}
            key={item.id}
          >
            <div>
              <strong>{item.type || "Activity"}</strong>
              <p>
                {item.message ||
                  `Activity from ${item.actorDid || "a Milan user"}.`}
              </p>
              <span>{item.createdAt || ""}</span>
            </div>

            {!item.read && (
              <button
                className="milan-ghost"
                type="button"
                onClick={() => markRead(item.id)}
              >
                Mark read
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
