import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }) {
  return <div className="review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
    img: ({ alt, src }) => <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />,
  }}>{children || "No description provided."}</ReactMarkdown></div>;
}
