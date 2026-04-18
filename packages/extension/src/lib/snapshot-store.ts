/**
 * Snapshot 存储：由 observe handler 写入，由 dom.* handler 按 index 读出。
 *
 * 设计：
 * - Map<snapshotId, SnapshotEntry>
 * - 60s TTL，每次 newSnapshotId 前做一次被动 GC
 * - MV3 service worker 休眠会清空内存——这是 MV3 的固有限制，
 *   实际影响小（LLM 一般在 60s 内使用 snapshot）
 */

export interface SnapshotElement {
  index: number;
  selector: string;
}

export interface SnapshotEntry {
  tabId: number;
  frameId?: number;
  capturedAt: number;
  elements: SnapshotElement[];
}

const snapshots = new Map<string, SnapshotEntry>();
const SNAPSHOT_TTL_MS = 60_000;
let counter = 0;

export function newSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${++counter}`;
}

export function gcSnapshots(): void {
  const now = Date.now();
  for (const [id, entry] of snapshots) {
    if (now - entry.capturedAt > SNAPSHOT_TTL_MS) snapshots.delete(id);
  }
}

export function setSnapshot(id: string, entry: SnapshotEntry): void {
  snapshots.set(id, entry);
}

export function getSnapshotEntry(snapshotId: string): SnapshotEntry | undefined {
  return snapshots.get(snapshotId);
}
