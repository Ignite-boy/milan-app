import "../styles/globals.css";

export const metadata = {
  title: "Milan",
  description: "Your Space. Your People.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}
