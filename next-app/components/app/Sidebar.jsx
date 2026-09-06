"use client";

const navigation = [
  ["Home", "/"],
  ["People", "/people"],
  ["Notifications", "/notifications"],
  ["Saved", "/saved"],
  ["Profile", "/profile"],
  ["Settings", "/settings"],
];

export default function Sidebar() {
  return (
    <aside className="milan-sidebar">
      <nav aria-label="Primary navigation">
        {navigation.map(([label, id], index) => (
          <a
            href={id}
            className={index === 0 ? "active" : ""}
            key={id}
          >
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
