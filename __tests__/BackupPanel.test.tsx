import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BackupPanel } from '../components/BackupPanel';
import type { BackupInspectResult } from '../services/backupService';

const inspectParleBackup = vi.fn();
const applyParleBackupImport = vi.fn();
const exportParleBackup = vi.fn();
const downloadParleBackup = vi.fn();
const readBackupFile = vi.fn();

vi.mock('../services/backupService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/backupService')>();
  return {
    ...actual,
    inspectParleBackup: (...args: unknown[]) => inspectParleBackup(...args),
    applyParleBackupImport: (...args: unknown[]) => applyParleBackupImport(...args),
    exportParleBackup: (...args: unknown[]) => exportParleBackup(...args),
    downloadParleBackup: (...args: unknown[]) => downloadParleBackup(...args),
    readBackupFile: (...args: unknown[]) => readBackupFile(...args),
  };
});

const inspected: BackupInspectResult = {
  preview: {
    mode: 'merge',
    additions: { ads: 1, archives: 1, scenarios: 0 },
    skips: { ads: 0, archives: 0, scenarios: 1 },
    conflicts: [],
    warnings: [],
  },
  replacePreview: {
    mode: 'replace',
    additions: { ads: 1, archives: 1, scenarios: 1 },
    skips: { ads: 0, archives: 0, scenarios: 0 },
    conflicts: [],
    warnings: ['Replace local data will delete existing saved ads, topic archives, and role-play scenarios.'],
  },
  packageBytes: new Uint8Array([1, 2, 3]),
  plannedMerge: { adsToPut: [], archivesToPut: [], scenariosToPut: [] },
  plannedReplace: { adsToPut: [], archivesToPut: [], scenariosToPut: [] },
};

describe('BackupPanel', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    inspectParleBackup.mockReset().mockResolvedValue(inspected);
    applyParleBackupImport.mockReset().mockResolvedValue({
      ads: [],
      archives: [],
      scenarios: [],
      bridgeFailures: [],
      preview: inspected.preview,
    });
    exportParleBackup.mockReset().mockResolvedValue({
      filename: 'parle-backup-2026-08-28.parle',
      bytes: new Uint8Array([1]),
      diagnostics: { orphanedArchiveIds: [], savedAdCount: 0, topicArchiveCount: 0, scenarioCount: 0 },
    });
    downloadParleBackup.mockReset();
    readBackupFile.mockReset().mockResolvedValue(new Uint8Array([9]));
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('shows a preview before writing and does not import on cancel', async () => {
    const { container } = render(<BackupPanel />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'demo.parle', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Preview of demo.parle/)).toBeInTheDocument();
    expect(screen.getByText(/1 advertisement will be added/)).toBeInTheDocument();
    expect(applyParleBackupImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(applyParleBackupImport).not.toHaveBeenCalled();
    expect(screen.queryByText(/Preview of demo.parle/)).not.toBeInTheDocument();
  });

  it('imports only after merge confirmation and requires a checkbox for replace', async () => {
    const onImported = vi.fn();
    const { container } = render(<BackupPanel onImported={onImported} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'demo.parle')] },
    });
    expect(await screen.findByRole('button', { name: 'Import (merge)' })).toBeInTheDocument();

    const replaceButton = screen.getByRole('button', { name: 'Replace local data' });
    expect(replaceButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Import (merge)' }));
    await waitFor(() => {
      expect(applyParleBackupImport).toHaveBeenCalledWith(inspected, { mode: 'merge', confirmReplace: undefined });
    });
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
  });

  it('scrolls the import preview into view after a file is inspected', async () => {
    const { container } = render(<BackupPanel />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'demo.parle')] },
    });

    expect(await screen.findByText(/Preview of demo.parle/)).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });
});
