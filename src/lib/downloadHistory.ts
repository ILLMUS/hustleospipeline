export interface DownloadEntry {
  type: 'pdf' | 'jpeg';
  filename: string;
  timestamp: string; // ISO
}

const KEY = (docId: string) => `download_history_${docId}`;
const MAX_ENTRIES = 5;

export function getDownloadHistory(docId: string): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(KEY(docId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordDownload(docId: string, entry: Omit<DownloadEntry, 'timestamp'>) {
  const list = getDownloadHistory(docId);
  const next: DownloadEntry[] = [{ ...entry, timestamp: new Date().toISOString() }, ...list].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY(docId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('download-history-updated', { detail: { docId } }));
  } catch {
    // ignore quota errors
  }
}