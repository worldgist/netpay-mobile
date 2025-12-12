import React from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  // Simple markdown parser for basic formatting
  const parseMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let inList = false;

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-2 mb-4 ml-4">
            {currentList.map((item, idx) => (
              <li key={idx} className="text-gray-700 leading-relaxed">{item.trim()}</li>
            ))}
          </ul>
        );
        currentList = [];
      }
      inList = false;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        return;
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={index} className="text-3xl font-bold mb-4 mt-6 text-gray-900">
            {trimmed.substring(2)}
          </h1>
        );
      } else if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={index} className="text-2xl font-semibold mb-3 mt-5 text-gray-900">
            {trimmed.substring(3)}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={index} className="text-xl font-semibold mb-2 mt-4 text-gray-900">
            {trimmed.substring(4)}
          </h3>
        );
      } else if (trimmed.startsWith('#### ')) {
        flushList();
        elements.push(
          <h4 key={index} className="text-lg font-semibold mb-2 mt-3 text-gray-900">
            {trimmed.substring(5)}
          </h4>
        );
      }
      // Lists
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        inList = true;
        currentList.push(trimmed.substring(2));
      }
      // Bold text
      else if (trimmed.includes('**')) {
        flushList();
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
        elements.push(
          <p key={index} className="text-gray-700 leading-relaxed mb-4">
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pIdx} className="font-semibold">{part.slice(2, -2)}</strong>;
              }
              return <span key={pIdx}>{part}</span>;
            })}
          </p>
        );
      }
      // Regular paragraphs
      else {
        flushList();
        elements.push(
          <p key={index} className="text-gray-700 leading-relaxed mb-4">
            {trimmed}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className={`prose prose-lg max-w-none ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
}





