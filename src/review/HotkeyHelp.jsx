import Modal from "./Modal.jsx";

export default function HotkeyHelp({ onClose }) {
  return <Modal title="Keyboard shortcuts" onClose={onClose}>
    <dl className="hotkey-list">
      <div><dt><kbd>?</kbd></dt><dd>Show keyboard shortcuts</dd></div>
      <div><dt><kbd>C</kbd> + <kbd>G</kbd></dt><dd>Copy the GitHub PR link</dd></div>
      <div><dt><kbd>E</kbd> + <kbd>A</kbd></dt><dd>Assign yourself to the PR</dd></div>
      <div><dt><kbd>E</kbd> + <kbd>R</kbd></dt><dd>Request a reviewer</dd></div>
      <div><dt><kbd>N</kbd></dt><dd>Next unreviewed file in Code</dd></div>
      <div><dt><kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>Choose a reviewer in the picker</dd></div>
      <div><dt><kbd>Enter ↵</kbd></dt><dd>Confirm assignment, request the selected reviewer, or send a chat message</dd></div>
      <div><dt><kbd>Shift</kbd> + <kbd>Enter</kbd></dt><dd>New line in chat</dd></div>
      <div><dt><kbd>Esc ⎋</kbd></dt><dd>Close a dialog before submission</dd></div>
    </dl>
    <p className="review-muted">Press two-key shortcuts in order within 750 ms, or hold both keys together. PR shortcuts are paused while typing or while a dialog is open.</p>
  </Modal>;
}
