import React, { useState } from 'react';
import { Check, Copy, Download, FileCode } from 'lucide-react';
import { FLUTTER_SOURCE_FILES } from '../data/flutterFiles';

export const DartSourceWorkspace: React.FC = () => {
  const [selectedId, setSelectedId] = useState(FLUTTER_SOURCE_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile =
    FLUTTER_SOURCE_FILES.find((f) => f.id === selectedId) ??
    FLUTTER_SOURCE_FILES[0];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeFile.content);
    setCopiedId(activeFile.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path.split('/').pop() || 'source.dart';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* File Tree */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Flutter &amp; SQLite Architecture
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Complete Dart 3 / Flutter 3 source modules ready for Android, iOS, and
          Windows/macOS desktop builds.
        </p>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {FLUTTER_SOURCE_FILES.map((file) => {
            const active = file.id === activeFile.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedId(file.id)}
                className={`flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors ${
                  active
                    ? 'rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <FileCode className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{file.title}</p>
                  <p className="truncate font-mono-tabular text-[11px] opacity-80">
                    {file.path}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Code Viewer */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0">
            <p className="font-mono-tabular text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeFile.path}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeFile.summary}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {copiedId === activeFile.id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#0D7A5F] dark:text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadFile}
              className="flex items-center gap-1.5 rounded-lg bg-[#0D7A5F] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#0A634D]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>

        <div className="max-h-[680px] overflow-auto bg-[#0F172A] p-5 dark:bg-slate-950">
          <pre className="font-mono-tabular text-xs leading-relaxed text-slate-100">
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
