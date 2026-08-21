self.onmessage = (event) => {
  const { type, payload } = event.data || {};

  if (type === "filterPosts") {
    const query = String(payload?.query || "").toLowerCase().trim();
    const posts = Array.isArray(payload?.posts) ? payload.posts : [];

    const result = query
      ? posts.filter((post) =>
          JSON.stringify(post).toLowerCase().includes(query)
        )
      : posts;

    self.postMessage({
      type: "filterPostsResult",
      payload: result,
    });
  }
};
