import { useState } from "react";
import { useDrive } from "../hooks/useAgentIPC";
import type { DriveNode } from "../types";

function TreeNode({ node, depth = 0 }: { node: DriveNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "dir";
  const hasChildren = isDir && node.children && node.children.length > 0;

  const handleOpen = () => {
    if (isDir) setExpanded(!expanded);
    else window.quantumAPI.file.open(node.path);
  };

  const handleGoto = () => {
    if (!isDir) window.quantumAPI.file.openInEditor(node.path);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="drive-tree-node">
      <div className="drive-tree-row" style={{ paddingLeft: depth * 16 + 4 }}>
        <button type="button" className="drive-toggle" onClick={() => setExpanded(!expanded)}>
          {isDir ? (expanded ? "▼" : "▶") : "  "}
        </button>
        <span className={`drive-icon ${isDir ? "dir-icon" : "file-icon"}`}>
          {isDir ? "📁" : "📄"}
        </span>
        <button type="button" className="drive-name" onClick={handleOpen}>
          {node.name}
        </button>
        <span className="drive-size">{formatSize(node.size)}</span>
        {!isDir && (
          <button type="button" className="drive-goto" onClick={handleGoto} title="Open in editor">
            ✏️
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="drive-children">
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildTree(nodes: DriveNode[]): DriveNode[] {
  const root: DriveNode[] = [];
  const dirs: DriveNode[] = [];
  const files: DriveNode[] = [];

  for (const node of nodes) {
    if (node.type === "dir") dirs.push(node);
    else files.push(node);
  }

  for (const dir of dirs) {
    dir.children = files
      .filter((f) => f.path.startsWith(`${dir.path}/`) || f.path.startsWith(`${dir.path}\\`))
      .map((f) => ({ ...f, children: undefined }));
    root.push(dir);
  }

  for (const file of files) {
    const inDir = dirs.some(
      (d) => file.path.startsWith(`${d.path}/`) || file.path.startsWith(`${d.path}\\`),
    );
    if (!inDir) root.push(file);
  }

  return root;
}

export default function DriveMap() {
  const { nodes, refresh } = useDrive();
  const tree = buildTree(nodes);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🗂️ Drive Map</h2>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      <div className="drive-map">
        {tree.length === 0 && <div className="empty-state">No files loaded</div>}
        {tree.map((node) => (
          <TreeNode key={node.path} node={node} />
        ))}
      </div>
    </div>
  );
}
