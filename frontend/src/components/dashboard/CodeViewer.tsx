import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

const EXT_TO_SHIKI_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  py: 'python',
  php: 'php',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cxx: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  sql: 'sql',
  sh: 'bash', bash: 'bash',
  html: 'html', htm: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml',
  md: 'markdown', markdown: 'markdown',
};

export function extToShikiLang(ext: string): string {
  return EXT_TO_SHIKI_LANG[ext.toLowerCase()] || 'text';
}

interface CodeViewerProps {
  code: string;
  ext: string;
  fontSizeRem: number;
}

/** Resaltado de sintaxis con Shiki (MIT, corre 100% en el navegador). Si el
 * lenguaje no tiene gramática soportada, cae a texto plano sin resaltar. */
export default function CodeViewer({ code, ext, fontSizeRem }: CodeViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const theme = isDark ? 'github-dark' : 'github-light';
    const lang = extToShikiLang(ext);

    codeToHtml(code, { lang, theme })
      .catch(() => codeToHtml(code, { lang: 'text', theme }))
      .then(result => {
        if (!cancelled) setHtml(result);
      });

    return () => {
      cancelled = true;
    };
  }, [code, ext, isDark]);

  if (!html) {
    return (
      <pre className="doc-code-plain">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="doc-code-shiki"
      style={{ fontSize: `${fontSizeRem}rem` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
