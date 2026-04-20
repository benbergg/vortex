// packages/mcp/src/lib/observe-render.ts

interface CompactElement {
  index: number;
  tag: string;
  role: string;
  name: string;
  state?: { checked?: boolean; selected?: boolean; active?: boolean; disabled?: boolean; required?: boolean };
  frameId: number;
}

interface CompactFrame {
  frameId: number;
  parentFrameId: number;
  url: string;
  offset: { x: number; y: number };
  elementCount: number;
  truncated: boolean;
  scanned: boolean;
}

interface CompactObserve {
  snapshotId: string;
  url: string;
  title?: string;
  viewport?: { width: number; height: number; scrollY: number; scrollHeight: number };
  frames?: CompactFrame[];
  elements: CompactElement[];
}

function refOf(e: CompactElement): string {
  return e.frameId === 0 ? `@e${e.index}` : `@f${e.frameId}e${e.index}`;
}

function stateFlags(state?: CompactElement["state"]): string {
  if (!state) return "";
  const flags: string[] = [];
  if (state.checked) flags.push("checked");
  if (state.selected) flags.push("selected");
  if (state.active) flags.push("active");
  if (state.disabled) flags.push("disabled");
  if (state.required) flags.push("required");
  return flags.length ? " " + flags.map((f) => `[${f}]`).join(" ") : "";
}

function escapeName(s: string): string {
  return s.replace(/\r?\n/g, " ").replace(/"/g, '\\"').slice(0, 80);
}

export function renderObserveCompact(data: CompactObserve): string {
  const lines: string[] = [];
  lines.push(`SnapshotId: ${data.snapshotId}`);
  lines.push(`URL: ${data.url}`);
  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.viewport) {
    const vp = data.viewport;
    lines.push(`Viewport: ${vp.width}x${vp.height}, scrollY=${vp.scrollY}/${vp.scrollHeight}`);
  }
  lines.push("");
  for (const el of data.elements) {
    const name = el.name ? ` "${escapeName(el.name)}"` : "";
    lines.push(`${refOf(el)} [${el.role}]${name}${stateFlags(el.state)}`);
  }
  // 未扫 frame 提示
  const unscanned = (data.frames ?? []).filter((f) => !f.scanned);
  if (unscanned.length > 0) {
    lines.push("");
    for (const f of unscanned) {
      lines.push(`# frame ${f.frameId} not scanned (url=${f.url})`);
    }
  }
  return lines.join("\n");
}
