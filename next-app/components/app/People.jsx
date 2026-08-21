"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function People() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadPeople(value = query) {
    try {
      setLoading(true);

      const data = await api(
        `/social/people?q=${encodeURIComponent(value)}`
      );

      setPeople(Array.isArray(data) ? data : []);
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }

  async function connect(person) {
    try {
      await api("/connections", {
        method: "POST",
        body: JSON.stringify({
          toDid: person.did,
          message:
            "I would like to connect with you on Milan.",
        }),
      });

      await loadPeople();
    } catch (error) {
      alert(error.message);
    }
  }

  async function approve(person) {
    try {
      await api(
        `/connections/${person.connectionId}/approve`,
        { method: "PATCH" }
      );

      await loadPeople();
    } catch (error) {
      alert(error.message);
    }
  }

  async function reject(person) {
    try {
      await api(
        `/connections/${person.connectionId}/reject`,
        { method: "PATCH" }
      );

      await loadPeople();
    } catch (error) {
      alert(error.message);
    }
  }

  useEffect(() => {
    loadPeople("");
  }, []);

  return (
    <section className="milan-section" id="people">
      <div className="section-heading">
        <span className="eyebrow">PEOPLE</span>
        <h2>People</h2>
        <p>
          Discover people and manage your connections.
        </p>
      </div>

      <div className="milan-card people-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              loadPeople(query);
            }
          }}
          placeholder="Search people"
        />

        <button
          type="button"
          onClick={() => loadPeople(query)}
        >
          Search
        </button>
      </div>

      {loading ? (
        <div className="milan-card">
          Loading people...
        </div>
      ) : (
        <div className="people-grid">
          {people.map((person) => (
            <article
              className="milan-card person-card"
              key={person.did}
            >
              <div className="milan-avatar">
                {(person.name || "M")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <strong>
                {person.name || "Milan User"}
              </strong>

              <span className="person-did">
                {person.did}
              </span>

              <span className="person-status">
                {person.connectionStatus || "none"}
              </span>

              {person.connectionStatus === "received" && (
                <div className="person-actions">
                  <button
                    type="button"
                    onClick={() => approve(person)}
                  >
                    Accept
                  </button>

                  <button
                    type="button"
                    className="milan-ghost"
                    onClick={() => reject(person)}
                  >
                    Reject
                  </button>
                </div>
              )}

              {(!person.connectionStatus ||
                person.connectionStatus === "none" ||
                person.connectionStatus === "rejected") && (
                <button
                  type="button"
                  onClick={() => connect(person)}
                >
                  Connect
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
