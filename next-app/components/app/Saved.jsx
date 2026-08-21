"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Saved() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const data = await api("/social/feed?scope=all");
        const rows = Array.isArray(data) ? data : data.records || [];
        const saved = JSON.parse(
          localStorage.getItem("milanSavedIds") || "[]"
        );
        setItems(rows.filter((row) => saved.includes(row.id)));
      } catch {
        setItems([]);
      }
    }

    load();
  }, []);

  return (
    <section className="milan-section" id="saved">
      <div className="section-heading">
        <span className="eyebrow">SAVED</span>
        <h2>Saved posts</h2>
      </div>

      {items.length === 0 ? (
        <div className="milan-card">No saved posts yet.</div>
      ) : (
        <div className="feed-list">
          {items.map((item) => (
            <article className="milan-card" key={item.id}>
              <h3>{item.title || "Milan Post"}</h3>
              <p>
                {item.data?.text ||
                  item.data?.caption ||
                  ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
