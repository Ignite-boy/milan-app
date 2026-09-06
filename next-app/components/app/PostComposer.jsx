"use client";

import { useRef, useState } from "react";
import { api } from "../../lib/api";

export default function PostComposer({ onPublished }) {
  const fileRef = useRef(null);

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function publishText() {
    return api("/records", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim() || "Milan Post",
        data: {
          text: text.trim(),
        },
        dataFormat: "application/json",
        accessMode: privacy,
        sharedWithDids: [],
        tags: tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
  }

  async function publishMedia() {
    const form = new FormData();

    form.append(
      "title",
      title.trim() || file.name
    );
    form.append("caption", text.trim());
    form.append("accessMode", privacy);
    form.append(
      "tags",
      tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(",")
    );
    form.append("file", file);

    const response = await fetch("/api/records/media", {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${localStorage.getItem("milanToken") || ""}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to upload media."
      );
    }

    return data;
  }

  async function submit(event) {
    event.preventDefault();

    if (publishing || (!text.trim() && !file)) return;

    try {
      setPublishing(true);
      setError("");

      const post = file
        ? await publishMedia()
        : await publishText();

      setTitle("");
      setText("");
      setTags("");
      setFile(null);

      if (fileRef.current) {
        fileRef.current.value = "";
      }

      onPublished?.(post);
    } catch (err) {
      setError(err.message || "Unable to publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <form className="milan-card composer" onSubmit={submit}>
      <div className="composer-title">
        Create a post
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        disabled={publishing}
      />

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Share something with your people..."
        rows={5}
        disabled={publishing}
      />

      <div className="composer-controls">
        <select
          value={privacy}
          onChange={(event) => setPrivacy(event.target.value)}
          disabled={publishing}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>

        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="Tags, comma separated"
          disabled={publishing}
        />

        <input
          ref={fileRef}
          type="file"
          onChange={(event) =>
            setFile(event.target.files?.[0] || null)
          }
          disabled={publishing}
        />
      </div>

      {file && (
        <div className="selected-file">
          Selected: {file.name}
        </div>
      )}

      {error && (
        <div className="milan-error">
          {error}
        </div>
      )}

      <div className="composer-footer">
        <span className="composer-hint">
          Private by default
        </span>

        <button
          type="submit"
          disabled={
            publishing ||
            (!text.trim() && !file)
          }
        >
          {publishing ? "Publishing..." : "Publish"}
        </button>
      </div>
    </form>
  );
}
