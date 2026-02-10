---
name: setup
description: |
  Configure the session-summary plugin for your Claude Code installation.

  **USE WHEN:**
  - User says "setup session summary", "configure statusline"
  - User says "enable session tracking", "setup the plugin"
  - User asks how to configure the session summary

  **DON'T USE WHEN:**
  - User is just asking what the plugin does (answer directly)
  - User wants to manually update the summary (use update-summary.sh)
tags: [setup, configuration, statusline]
---

# Session Summary Setup

This skill helps you configure the session-summary plugin.

## What This Does

The session-summary plugin adds a two-line statusline to Claude Code:
- **Line 1:** API domain │ project │ git branch │ context %
- **Line 2:** Your current task summary (yellow)

## Configuration Steps

### 1. Enable the Statusline

Add this to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/plugins/cache/claude-session-summary/scripts/statusline.sh"
  }
}
```

## Verification

After setup, start a new Claude Code session. You should see:
1. A two-line statusline at the bottom
2. A prompt asking you to update the summary with your initial task

## Troubleshooting

**Statusline not showing?**
- Verify the path in settings.json matches your plugin installation
- Check that the script is executable: `chmod +x ~/.claude/plugins/cache/claude-session-summary/scripts/statusline.sh`

**Summary not updating?**
- Check the scratchpad path exists: `/private/tmp/claude-{uid}/...`

**Want to check the current summary?**
```bash
cat /private/tmp/claude-$(id -u)/-$(pwd | sed 's|^/||; s|/|-|g')/{session_id}/scratchpad/session-summary.txt
```
