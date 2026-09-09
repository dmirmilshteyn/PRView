export function getFileAnchor(index) {
  return `changed-file-${index + 1}`;
}

export default function FileNavigator({ files, reviewedFiles }) {
  return (
    <nav aria-label="Changed files" className="file-navigator">
      <p>Jump to file</p>
      <ol>
        {files.map((file, index) => (
          <li key={file.path}>
            <a href={`#${getFileAnchor(index)}`}>
              <span className="file-navigator-status" aria-hidden="true">
                {reviewedFiles[file.path] ? "✓" : "○"}
              </span>
              <span>{file.path}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
