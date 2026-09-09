import { createContext, useContext } from "react";

export const ChatAttachmentsContext = createContext(null);

export function useChatAttachments() {
  return useContext(ChatAttachmentsContext);
}
