// import React, { useState } from "react";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

// export default function MarkdownRenderer({ text }) {
//   // ✅ Copy button component
//   const CopyButton = ({ code }) => {
//     const [copied, setCopied] = useState(false);

//     const handleCopy = async () => {
//       try {
//         await navigator.clipboard.writeText(code);
//         setCopied(true);
//         setTimeout(() => setCopied(false), 1500);
//       } catch (err) {
//         console.error("Copy failed:", err);
//       }
//     };

//     return (
//       <button
//         onClick={handleCopy}
//         className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-md transition-all duration-200 ${
//           copied
//             ? "bg-green-500 text-white"
//             : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
//         }`}
//       >
//         {copied ? "Copied!" : "Copy"}
//       </button>
//     );
//   };

//   return (
//     <>
//     <ReactMarkdown
//       remarkPlugins={[remarkGfm]}
//       components={{
//         // Headers
//         h1: ({ ...props }) => (
//           <h1
//             className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-3"
//             {...props}
//           />
//         ),
//         h2: ({ ...props }) => (
//           <h2
//             className="text-xl font-semibold text-indigo-500 dark:text-indigo-300 mt-4 mb-2"
//             {...props}
//           />
//         ),
//         h3: ({ ...props }) => (
//           <h3
//             className="text-lg font-semibold text-indigo-400 dark:text-indigo-200 mt-3 mb-2"
//             {...props}
//           />
//         ),

//         // Paragraphs
//         p: ({ ...props }) => (
//           <p
//             className="mb-2 leading-relaxed text-gray-800 dark:text-gray-200"
//             {...props}
//           />
//         ),

//         // Lists (fixed spacing)
//         ul: ({ ...props }) => (
//           <ul
//             className="list-disc list-inside pl-3 text-gray-800 dark:text-gray-200 space-y-0"
//             {...props}
//           />
//         ),
//         ol: ({ ...props }) => (
//           <ol
//             className="list-decimal list-inside pl-3 text-gray-800 dark:text-gray-200 space-y-0"
//             {...props}
//           />
//         ),
//         li: ({ ...props }) => (
//           <li className="ml-3 text-gray-800 dark:text-gray-200" {...props} />
//         ),

//         strong: ({ ...props }) => (
//           <strong
//             className="text-indigo-700 dark:text-indigo-300 font-semibold"
//             {...props}
//           />
//         ),

//         // ✅ Code block with copy button
//         code: ({ inline, children, ...props }) => {
//           if (inline) {
//             return (
//               <code
//                 className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-purple-600 dark:text-purple-300 text-sm font-mono"
//                 {...props}
//               >
//                 {children}
//               </code>
//             );
//           }

//           const codeText = String(children).trim();

//           return (
//             <div className="relative my-3">
//               <CopyButton code={codeText} />
//               <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-xl overflow-x-auto text-purple-700 dark:text-purple-300 text-sm font-mono">
//                 <code {...props}>{children}</code>
//               </pre>
//             </div>
//           );
//         },

//         blockquote: ({ ...props }) => (
//           <blockquote
//             className="border-l-4 border-indigo-400 dark:border-indigo-500 pl-4 italic text-gray-700 dark:text-gray-300"
//             {...props}
//           />
//         ),

//         // Tables
//         table: ({ ...props }) => (
//           <div className="overflow-x-auto my-3">
//             <table
//               className="border-collapse border border-gray-300 dark:border-gray-600 w-full text-sm text-gray-800 dark:text-gray-200"
//               {...props}
//             />
//           </div>
//         ),
//         th: ({ ...props }) => (
//           <th
//             className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-200 dark:bg-gray-800 font-semibold"
//             {...props}
//           />
//         ),
//         td: ({ ...props }) => (
//           <td
//             className="border border-gray-300 dark:border-gray-600 px-3 py-2"
//             {...props}
//           />
//         ),

//         // ✅ Image styling
//         img: ({ src, alt, ...props }) => (
//           <img
//             src={src}
//             alt={alt}
//             className="rounded-xl my-3 max-w-full h-auto border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
//             style={{
//               display: "block",
//               marginLeft: "auto",
//               marginRight: "auto",
//               objectFit: "contain",
//             }}
//             {...props}
//           />
//         ),
//       }}
//     >
//       {text}
//     </ReactMarkdown>
//     </>
    
//   );
// }


import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownRenderer({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ ...props }) => (
          <h1
            className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-3"
            {...props}
          />
        ),
        h2: ({ ...props }) => (
          <h2
            className="text-xl font-semibold text-indigo-500 dark:text-indigo-300 mt-4 mb-2"
            {...props}
          />
        ),
        h3: ({ ...props }) => (
          <h3
            className="text-lg font-semibold text-indigo-400 dark:text-indigo-200 mt-3 mb-2"
            {...props}
          />
        ),

        // 🧠 FIX: Prevent <p> wrapping around block elements
        p: ({ node, children, ...props }) => {
          const hasBlockElement = node?.children?.some(
            (child) =>
              child.tagName === "code" ||
              child.tagName === "pre" ||
              child.tagName === "div" ||
              (child.children &&
                child.children.some(
                  (sub) =>
                    sub.tagName === "code" ||
                    sub.tagName === "pre" ||
                    sub.tagName === "div"
                ))
          );

          if (hasBlockElement) {
            return <>{children}</>; // no <p>
          }

          return (
            <p
              className="mb-2 leading-relaxed text-gray-800 dark:text-gray-200"
              {...props}
            >
              {children}
            </p>
          );
        },

        ul: ({ ...props }) => (
          <ul
            className="list-disc list-inside space-y-1 pl-3 text-gray-800 dark:text-gray-200"
            {...props}
          />
        ),
        ol: ({ ...props }) => (
          <ol
            className="list-decimal list-inside space-y-1 pl-3 text-gray-800 dark:text-gray-200"
            {...props}
          />
        ),
        li: ({ ...props }) => (
          <li className="ml-3 text-gray-800 dark:text-gray-200" {...props} />
        ),
        strong: ({ ...props }) => (
          <strong
            className="text-indigo-700 dark:text-indigo-300 font-semibold"
            {...props}
          />
        ),

        // ✅ Hydration-safe code block renderer
        code: ({ inline, children, ...props }) => {
          if (inline) {
            return (
              <code
                className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-purple-600 dark:text-purple-300 text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <div className="relative my-3">
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-xl overflow-x-auto text-purple-700 dark:text-purple-300 text-sm font-mono">
                <code {...props}>{children}</code>
              </pre>
            </div>
          );
        },

        blockquote: ({ ...props }) => (
          <blockquote
            className="border-l-4 border-indigo-400 dark:border-indigo-500 pl-4 italic text-gray-700 dark:text-gray-300"
            {...props}
          />
        ),

        table: ({ ...props }) => (
          <div className="overflow-x-auto my-3">
            <table
              className="border-collapse border border-gray-300 dark:border-gray-600 w-full text-sm text-gray-800 dark:text-gray-200"
              {...props}
            />
          </div>
        ),
        th: ({ ...props }) => (
          <th
            className="border border-gray-300 dark:border-gray-600 px-3 py-2 bg-gray-200 dark:bg-gray-800 font-semibold"
            {...props}
          />
        ),
        td: ({ ...props }) => (
          <td
            className="border border-gray-300 dark:border-gray-600 px-3 py-2"
            {...props}
          />
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
