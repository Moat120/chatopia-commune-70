import { useEffect } from "react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

/** Updates browser tab title with unread message count */
export const useTabTitle = () => {
  const { totalUnread } = useUnreadMessages();

  useEffect(() => {
    const baseTitle = "Chatopia";
    if (totalUnread > 0) {
      document.title = `(${totalUnread > 99 ? "99+" : totalUnread}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    return () => {
      document.title = baseTitle;
    };
  }, [totalUnread]);
};
