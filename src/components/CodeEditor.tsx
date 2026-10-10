"use client";

import dynamic from "next/dynamic";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">加载编辑器...</div>,
});

export function CodeEditor({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  return (
    <Monaco
      height="100%"
      language="html"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
