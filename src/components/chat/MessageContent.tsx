import React from "react";

const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

interface MessageContentProps {
  content: string;
}

/** Renders message text with clickable links */
const MessageContent = ({ content }: MessageContentProps) => {
  const parts = content.split(URL_REGEX);

  if (parts.length === 1) {
    return <span>{content}</span>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          // Reset regex lastIndex
          URL_REGEX.lastIndex = 0;
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 decoration-current/30 hover:decoration-current/60 transition-all break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

export default MessageContent;
