import type { WorkspaceInfo } from "workspace-tools";
import { getWorkspaces } from "workspace-tools";

const workspaces: WorkspaceInfo = getWorkspaces(process.cwd());
console.log(workspaces);
