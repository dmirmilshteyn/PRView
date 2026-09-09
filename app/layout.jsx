import "../src/styles.css";

export const metadata = {
  title: "PRView",
  description: "A focused view of pull requests that need your attention.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
