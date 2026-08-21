"use client";

import { useState } from "react";
import { api } from "../../lib/api";

export default function PostCard({ post }) {
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState(
    post.social?.reactions?.mine || null
  );

  const owner = post.ownerProfile || {};
  const name =
    owner.name ||
    owner.display_name ||
    "Milan User";

  const text =
    typeof post.data === "string"
      ? post.data
      : post.data?.text ||
        post.data?.caption ||
        post.text ||
        post.note ||
        "";

  async function react(type) {
    if (busy || !post.id) return;

    try {
      setBusy(true);

      const result = await api(
        `/social/records/${post.id}/reactions`,
        {
          method: "POST",
          body: JSON.stringify({ type }),
        }
      );

      setReaction(result.mine || null);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadComments() {
    if (!post.id) return;

    try {
      const data = await api(
        `/social/records/${post.id}/comments`
      );

      setComments(Array.isArray(data) ? data : []);
      setShowComments(true);
    } catch (error) {
      alert(error.message);
    }
  }

  async function submitComment(event) {
    event.preventDefault();

    const value = comment.trim();
    if (!value || !post.id) return;

    try {
      setBusy(true);

      const created = await api(
        `/social/records/${post.id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ text: value }),
        }
      );

      setComments((current) => [...current, created]);
      setComment("");
      setShowComments(true);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  const media = post.data?.media || post.media;
  const mediaUrl =
    post.mediaUrl ||
    media?.mediaUrl ||
    post.data?.mediaUrl ||
    "";

  return (
    <article className="milan-card post-card">
      <div className="post-author">
        <div className="milan-avatar">
          {name.charAt(0).toUpperCase()}
        </div>

        <div>
          <strong>{name}</strong>
          <span>{post.accessMode || "private"}</span>
        </div>
      </div>

      {mediaUrl && (
        <div className="post-media">
          {media?.previewCategory === "image" ? (
            <img src={mediaUrl} alt={post.title || "Milan post"} />
          ) : media?.previewCategory === "video" ? (
            <video controls preload="metadata">
              <source
                src={mediaUrl}
                type={media?.mimeType || "video/mp4"}
              />
            </video>
          ) : media?.previewCategory === "audio" ? (
            <audio controls src={mediaUrl} />
          ) : (
            <a
              className="media-link"
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open attachment
            </a>
          )}
        </div>
      )}

      <div className="post-content">
        <h2>{post.title || "Milan Post"}</h2>
        <p>{text}</p>

        {post.tags?.length > 0 && (
          <div className="post-tags">
            {post.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="post-actions">
        <button
          type="button"
          className={reaction === "like" ? "active" : ""}
          onClick={() => react("like")}
          disabled={busy}
        >
          Like
        </button>

        <button
          type="button"
          className={reaction === "love" ? "active" : ""}
          onClick={() => react("love")}
          disabled={busy}
        >
          Love
        </button>

        <button
          type="button"
          onClick={showComments ? () => setShowComments(false) : loadComments}
        >
          Comment
        </button>
      </div>

      {showComments && (
        <div className="comments-panel">
          <div className="comments-list">
            {comments.length === 0 ? (
              <span className="empty-text">
                No comments yet.
              </span>
            ) : (
              comments.map((item) => (
                <div className="comment-row" key={item.id}>
                  <strong>
                    {item.authorProfile?.name ||
                      item.author?.name ||
                      "Milan User"}
                  </strong>
                  <span>{item.text}</span>
                </div>
              ))
            )}
          </div>

          <form onSubmit={submitComment} className="comment-form">
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Write a comment..."
              disabled={busy}
            />
            <button type="submit" disabled={busy || !comment.trim()}>
              Post
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
