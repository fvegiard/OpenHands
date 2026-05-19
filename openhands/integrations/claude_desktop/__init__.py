"""Claude Desktop integration for OpenHands.

Exposes OpenHands as a stdio MCP server that Claude Desktop can launch via
``claude_desktop_config.json``. The shim proxies the existing HTTP MCP server
(forge tools) and adds two REST-backed tools for running and inspecting
agent tasks.
"""
