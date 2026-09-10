import { useEffect, useRef } from "react";

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);
  return <dialog ref={ref} className="pr-confirm-dialog review-modal" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
    <div className="context-heading"><h2>{title}</h2><button type="button" className="pr-pin" onClick={onClose} aria-label="Close dialog">Close <kbd>⎋</kbd></button></div>
    {children}
  </dialog>;
}
