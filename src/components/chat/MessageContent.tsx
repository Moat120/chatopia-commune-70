import React from "react";

const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;
const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const ITALIC_REGEX = /\*(.+?)\*/g;
const CODE_REGEX = /`(.+?)`/g;
const STRIKETHROUGH_REGEX = /~~(.+?)~~/g;

interface MessageContentProps {
  content: string;
}

/** Renders message text with clickable links and basic markdown */
const MessageContent = ({ content }: MessageContentProps) => {
  // First split by URLs
  const urlParts = content.split(URL_REGEX);

  if (urlParts.length === 1 && !BOLD_REGEX.test(content) && !CODE_REGEX.test(content)) {
    return <span>{content}</span>;
  }

  return (
    <>
      {urlParts.map((part, i) => {
        URL_REGEX.lastIndex = 0;
        if (URL_REGEX.test(part)) {
          URL_REGEX.lastIndex = 0;
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary/70 text-primary/90 hover:text-primary transition-all break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        // Apply inline markdown formatting
        return <FormattedText key={i} text={part} />;
      })}
    </>
  );
};

/** Applies bold, italic, code, strikethrough formatting */
const FormattedText = ({ text }: { text: string }) => {
  // Process in order: code first (to avoid nested formatting inside code)
  const segments: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Simple regex-based formatting
  const formattedHtml = remaining
    .replace(CODE_REGEX, '§CODE§$1§/CODE§')
    .replace(BOLD_REGEX, '§BOLD§$1§/BOLD§')
    .replace(STRIKETHROUGH_REGEX, '§STRIKE§$1§/STRIKE§')
    .replace(ITALIC_REGEX, '§ITALIC§$1§/ITALIC§');

  const tokenRegex = /§(CODE|BOLD|ITALIC|STRIKE)§(.*?)§\/\1§/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(formattedHtml)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      segments.push(<span key={key++}>{formattedHtml.slice(lastIndex, match.index)}</span>);
    }

    const [, type, content] = match;
    switch (type) {
      case "CODE":
        segments.push(
          <code key={key++} className="px-1.5 py-0.5 rounded-md bg-secondary/60 text-[12.5px] font-mono text-primary/80 border border-white/[0.04]">
            {content}
          </code>
        );
        break;
      case "BOLD":
        segments.push(<strong key={key++} className="font-bold">{content}</strong>);
        break;
      case "ITALIC":
        segments.push(<em key={key++} className="italic">{content}</em>);
        break;
      case "STRIKE":
        segments.push(<del key={key++} className="line-through opacity-60">{content}</del>);
        break;
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < formattedHtml.length) {
    segments.push(<span key={key++}>{formattedHtml.slice(lastIndex)}</span>);
  }

  return <>{segments.length > 0 ? segments : text}</>;
};

export default MessageContent;
