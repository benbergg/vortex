// L3 Reasoning 层类型定义。spec: vortex重构-L3-spec.md §1

export interface AXNode {
  ref: string;
  role: string;
  name: string;
  description?: string;
  value?: string;
  textHash: string;
  properties: {
    focused?: boolean;
    checked?: boolean | "mixed";
    disabled?: boolean;
    expanded?: boolean;
    selected?: boolean;
    required?: boolean;
    readonly?: boolean;
    level?: number;
  };
  bounds?: { x: number; y: number; w: number; h: number };
  parentRef?: string;
  childRefs?: string[];
  backendDOMNodeId?: number;
}

export interface AXSnapshot {
  snapshotId: string;
  tabId: number;
  frameId: number;
  capturedAt: number;
  nodes: AXNode[];
}

export interface Descriptor {
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
  near?: { ref: string; relation: "parent" | "sibling" | "child" };
  strict?: false;
}

export interface RefEntry {
  ref: string;
  snapshotId: string;
  descriptor: Descriptor;
  backendDOMNodeId?: number;
  lastValid: number;
}

// CDP raw shape from Accessibility.getFullAXTree
export interface CDPAXNode {
  nodeId: string;
  parentId?: string;
  childIds?: string[];
  role?: { value: string };
  name?: { value: string };
  description?: { value: string };
  value?: { value: string };
  properties?: Array<{ name: string; value: { value: unknown } }>;
  ignored?: boolean;
  backendDOMNodeId?: number;
}
