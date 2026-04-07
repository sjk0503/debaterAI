import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownMessage({ content, isStreaming }: Props) {
  return (
    <div className="debate-message text-sm text-gray-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className="bg-[#2d2d2d] text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group my-2">
                <div className="flex items-center justify-between bg-[#1a1a1a] border border-[#333] rounded-t-lg px-3 py-1.5">
                  <span className="text-[10px] text-gray-500 font-mono">{match[1]}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
                    }}
                    className="text-[10px] text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition"
                  >
                    📋 Copy
                  </button>
                </div>
                <SyntaxHighlighter
                  style={oneDark as any}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    borderBottomLeftRadius: '0.5rem',
                    borderBottomRightRadius: '0.5rem',
                    border: '1px solid #333',
                    borderTop: 'none',
                    fontSize: '12px',
                  }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          },
          // 테이블 스타일링
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="text-xs border-collapse border border-[#383838] w-full">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-[#383838] bg-[#2d2d2d] px-3 py-1.5 text-left text-gray-300">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-[#383838] px-3 py-1.5 text-gray-400">{children}</td>
            );
          },
          // 리스트 스타일링
          ul({ children }) {
            return <ul className="list-disc list-inside space-y-1 my-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-1">{children}</ol>;
          },
          // 링크
          a({ href, children }) {
            return (
              <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          // 볼드
          strong({ children }) {
            return <strong className="text-white font-semibold">{children}</strong>;
          },
          // 헤딩
          h1({ children }) {
            return <h1 className="text-lg font-bold text-white mt-3 mb-1">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold text-white mt-2 mb-1">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold text-gray-200 mt-2 mb-1">{children}</h3>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="typing-cursor" />}
    </div>
  );
}
