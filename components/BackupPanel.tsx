import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyParleBackupImport,
  downloadParleBackup,
  exportParleBackup,
  inspectParleBackup,
  readBackupFile,
  type BackupInspectResult,
} from '../services/backupService';
import { BackupValidationError } from '../services/backupFormat';

function errorMessage(error: unknown): string {
  if (error instanceof BackupValidationError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Backup failed. Please try again.';
}

function summarizePreview(inspected: BackupInspectResult, replace: boolean): string[] {
  const preview = replace ? inspected.replacePreview : inspected.preview;
  const lines = [
    `${preview.additions.ads} advertisement${preview.additions.ads === 1 ? '' : 's'} will be added`,
    `${preview.additions.archives} topic archive${preview.additions.archives === 1 ? '' : 's'} will be added`,
    `${preview.additions.scenarios} role-play scenario${preview.additions.scenarios === 1 ? '' : 's'} will be added`,
  ];
  if (!replace) {
    const skipTotal = preview.skips.ads + preview.skips.archives + preview.skips.scenarios;
    if (skipTotal > 0) {
      lines.push(`${skipTotal} matching item${skipTotal === 1 ? '' : 's'} already present and will be skipped`);
    }
    if (preview.conflicts.length > 0) {
      lines.push(
        `${preview.conflicts.length} conflict${preview.conflicts.length === 1 ? '' : 's'} will be imported with new ids`
      );
    }
  }
  return lines;
}

interface BackupPanelProps {
  onImported?: () => void;
}

function scrollNodeIntoView(node: HTMLElement | null): void {
  node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export const BackupPanel: React.FC<BackupPanelProps> = ({ onImported }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const operationTokenRef = useRef(0);
  const [busy, setBusy] = useState<'export' | 'inspect' | 'import' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<BackupInspectResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const resetPreview = useCallback(() => {
    setInspected(null);
    setFileName(null);
    setReplaceConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  useEffect(() => {
    scrollNodeIntoView(inspected ? previewRef.current : statusRef.current);
  }, [inspected, message, error]);

  const handleExport = async () => {
    const token = ++operationTokenRef.current;
    setBusy('export');
    setError(null);
    setMessage(null);
    try {
      const result = await exportParleBackup();
      if (token !== operationTokenRef.current) return;
      downloadParleBackup(result.filename, result.bytes);
      const orphanNote = result.diagnostics.orphanedArchiveIds.length > 0
        ? ` ${result.diagnostics.orphanedArchiveIds.length} orphaned topic archive(s) were reported and not exported.`
        : '';
      setMessage(`Exported ${result.filename}.${orphanNote}`);
    } catch (caught) {
      if (token !== operationTokenRef.current) return;
      setError(errorMessage(caught));
    } finally {
      if (token === operationTokenRef.current) setBusy(null);
    }
  };

  const inspectFile = async (file: File) => {
    const token = ++operationTokenRef.current;
    setBusy('inspect');
    setError(null);
    setMessage(null);
    setReplaceConfirmed(false);
    try {
      const bytes = await readBackupFile(file);
      const next = await inspectParleBackup(bytes);
      if (token !== operationTokenRef.current) return;
      setInspected(next);
      setFileName(file.name);
    } catch (caught) {
      if (token !== operationTokenRef.current) return;
      setInspected(null);
      setFileName(null);
      setError(errorMessage(caught));
    } finally {
      if (token === operationTokenRef.current) setBusy(null);
    }
  };

  const handleApply = async (mode: 'merge' | 'replace') => {
    if (!inspected) return;
    const token = ++operationTokenRef.current;
    setBusy('import');
    setError(null);
    setMessage(null);
    try {
      const result = await applyParleBackupImport(inspected, {
        mode,
        confirmReplace: mode === 'replace' ? replaceConfirmed : undefined,
      });
      if (token !== operationTokenRef.current) return;
      const added = result.preview.additions;
      setMessage(
        mode === 'replace'
          ? 'Local data was replaced with the imported backup.'
          : `Imported ${added.ads} ads, ${added.archives} topic archives, and ${added.scenarios} scenarios.`
      );
      resetPreview();
      onImported?.();
    } catch (caught) {
      if (token !== operationTokenRef.current) return;
      setError(errorMessage(caught));
    } finally {
      if (token === operationTokenRef.current) setBusy(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-parle-navy-900">Backup</h3>
        <p className="text-xs text-parle-navy-500 mt-1">
          Export or import saved ads, topic history, and role-play scenarios as a <code>.parle</code> file.
          Conversations, audio, and API keys are never included.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
        className="w-full px-4 py-2 bg-parle-navy-100 hover:bg-parle-navy-200 text-parle-navy-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {busy === 'export' ? 'Exporting…' : 'Export backup'}
      </button>

      <div
        className={`rounded-lg border border-dashed p-4 text-center ${
          isDragging ? 'border-parle-blue-500 bg-parle-blue-50' : 'border-parle-navy-200 bg-parle-navy-50'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (busy !== null) return;
          const file = event.dataTransfer.files[0];
          if (file) void inspectFile(file);
        }}
      >
        <p className="text-xs text-parle-navy-600 mb-2">Drop a .parle file here or choose one to preview.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".parle,application/zip"
          className="hidden"
          aria-label="Choose a Parle backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspectFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null}
          className="px-3 py-1.5 bg-white border border-parle-navy-200 rounded-lg text-xs font-medium text-parle-navy-800 hover:bg-parle-blue-50 disabled:opacity-50"
        >
          {busy === 'inspect' ? 'Reading backup…' : 'Choose backup file'}
        </button>
      </div>

      {inspected && (
        <div
          ref={previewRef}
          className="space-y-3 rounded-lg border border-parle-navy-100 bg-white p-3"
        >
          <p className="text-xs font-medium text-parle-navy-800">
            Preview{fileName ? ` of ${fileName}` : ''}
          </p>
          <ul className="text-xs text-parle-navy-600 space-y-1 list-disc pl-4">
            {summarizePreview(inspected, false).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {inspected.preview.conflicts.length > 0 && (
            <ul className="text-[11px] text-parle-navy-500 space-y-1">
              {inspected.preview.conflicts.map((conflict) => (
                <li key={`${conflict.collection}-${conflict.incomingId}`}>
                  {conflict.collection}: {conflict.incomingId} → {conflict.assignedId}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetPreview}
              disabled={busy !== null}
              className="flex-1 px-3 py-2 bg-parle-navy-100 hover:bg-parle-navy-200 text-parle-navy-900 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply('merge')}
              disabled={busy !== null}
              className="flex-1 px-3 py-2 bg-parle-blue-500 hover:bg-parle-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {busy === 'import' ? 'Importing…' : 'Import (merge)'}
            </button>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-parle-navy-600">
            <input
              type="checkbox"
              checked={replaceConfirmed}
              onChange={(event) => setReplaceConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            Replace local data instead. This deletes existing saved ads, topic archives, and scenarios.
          </label>
          <button
            type="button"
            onClick={() => void handleApply('replace')}
            disabled={busy !== null || !replaceConfirmed}
            className="w-full px-3 py-2 border border-parle-red-300 text-parle-red-700 rounded-lg text-xs font-medium hover:bg-parle-red-50 disabled:opacity-50"
          >
            Replace local data
          </button>
        </div>
      )}

      {(message || error) && (
        <div ref={statusRef} className="space-y-2">
          {message && (
            <p className="text-xs text-parle-navy-700 bg-parle-blue-50 border border-parle-navy-100 rounded-lg p-3">
              {message}
            </p>
          )}
          {error && (
            <p className="text-xs text-parle-red-700 bg-parle-red-50 border border-parle-red-300 rounded-lg p-3">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
