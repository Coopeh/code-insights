import ReactMarkdown from 'react-markdown';
import { preprocessUserContent } from '../preprocess';
import { highlightText } from './HighlightText';

interface UserMarkdownProps {
  content: string;
  searchQuery?: string;
}

export function UserMarkdown({ content, searchQuery }: UserMarkdownProps) {
  const hl = (children: React.ReactNode) =>
    searchQuery ? highlightText(children, searchQuery) : children;

  return (
    <div className="prose prose-sm max-w-none [&_p]:my-1 dark:prose-invert">
      <ReactMarkdown
        components={searchQuery ? {
          p({ children }) {
            return <p>{hl(children)}</p>;
          },
          li({ children }) {
            return <li>{hl(children)}</li>;
          },
        } : undefined}
      >
        {preprocessUserContent(content)}
      </ReactMarkdown>
    </div>
  );
}
