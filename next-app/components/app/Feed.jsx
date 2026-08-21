"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";

export default function Feed({ user }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadFeed() {
    try {
      setError("");
      const data = await api("/social/feed?scope=all");
      setPosts(Array.isArray(data) ? data : data.records || []);
    } catch (err) {
      setError(err.message || "Unable to load your feed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  function handlePublished(post) {
    if (post) {
      setPosts((current) => [post, ...current]);
    } else {
      loadFeed();
    }
  }

  return (
    <section className="milan-feed" id="home">
      <div className="feed-heading">
        <div>
          <span className="eyebrow">HOME</span>
          <h1>Your space</h1>
          <p>
            Welcome back,{" "}
            {user?.profile?.display_name ||
              user?.email?.split("@")[0] ||
              "Milan User"}.
          </p>
        </div>
      </div>

      <PostComposer onPublished={handlePublished} />

      {loading && (
        <div className="milan-card">
          <p>Loading your feed...</p>
        </div>
      )}

      {error && (
        <div className="milan-card milan-error">
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="milan-card">
          <h2>Your feed is empty</h2>
          <p>Create your first post to get started.</p>
        </div>
      )}

      <div className="feed-list">
        {posts.map((post, index) => (
          <PostCard
            key={post.id || `${post.title}-${index}`}
            post={post}
          />
        ))}
      </div>
    </section>
  );
}
