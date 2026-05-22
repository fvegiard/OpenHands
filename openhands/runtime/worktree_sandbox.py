import os
import shutil
import subprocess
from typing import Optional
from openhands.core.logger import openhands_logger as logger

class WorktreeSandboxService:
    """
    Manages isolated Git worktrees for OpenHands Agents.
    This enables parallel agent execution on the same repository without branch conflicts,
    which is essential for hybrid Antigravity/OpenHands swarm architectures.
    """
    def __init__(self, base_repo_path: str):
        self.base_repo_path = base_repo_path
        
    def _run_git_command(self, cmd: list[str], cwd: str) -> str:
        try:
            result = subprocess.run(
                ["git"] + cmd,
                cwd=cwd,
                check=True,
                capture_output=True,
                text=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            logger.error(f"Git command failed: git {' '.join(cmd)}\n{e.stderr}")
            raise RuntimeError(f"Git command failed: {e.stderr}")
            
    def create_worktree(self, branch_name: str, target_dir: Optional[str] = None) -> str:
        """
        Creates a new git worktree for a specific task.
        """
        if not target_dir:
            # Default to a sibling directory
            base_dir = os.path.dirname(os.path.abspath(self.base_repo_path))
            target_dir = os.path.join(base_dir, f"worktree_{branch_name}")
            
        logger.info(f"Creating git worktree for branch '{branch_name}' at {target_dir}")
        
        # Check if branch exists, if not, create it
        branches = self._run_git_command(["branch", "--list", branch_name], cwd=self.base_repo_path)
        if branch_name not in branches:
            self._run_git_command(["branch", branch_name], cwd=self.base_repo_path)
            
        self._run_git_command(["worktree", "add", target_dir, branch_name], cwd=self.base_repo_path)
        return target_dir
        
    def remove_worktree(self, target_dir: str):
        """
        Removes an existing git worktree and cleans up.
        """
        logger.info(f"Removing git worktree at {target_dir}")
        self._run_git_command(["worktree", "remove", "--force", target_dir], cwd=self.base_repo_path)
