#!/bin/bash
# =============================================================================
# Session Summary Protocol - SessionStart Hook
# =============================================================================
# Injects protocol teaching Claude how to maintain session summaries.
# Outputs plain text which becomes additionalContext (like AgentVibes).
# =============================================================================

set -euo pipefail

# Read hook payload
input=$(cat)

# Extract session_id using Node.js
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_JSON="$SCRIPT_DIR/../lib/parse-json.js"
session_id=$(echo "$input" | node "$PARSE_JSON" session_id)

[ -z "$session_id" ] && exit 0

# Get plugin root (this script is in scripts/, so go up one level)
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Detect tmp base (macOS uses /private/tmp, Linux uses /tmp)
if [ -d "/private/tmp" ]; then
    TMP_BASE="/private/tmp"
else
    TMP_BASE="/tmp"
fi

# Write session index file for O(1) lookup by statusline and other scripts
uid=$(id -u)
index_dir="${TMP_BASE}/claude-${uid}/session-index"
mkdir -p "$index_dir" 2>/dev/null
escaped_cwd=$(echo "$PWD" | sed 's|^/||; s|/|-|g')
scratchpad="${TMP_BASE}/claude-${uid}/-${escaped_cwd}/${session_id}/scratchpad"
printf '%s\n%s\n' "$scratchpad" "$PWD" > "${index_dir}/${session_id}"

# Set initial default summary (empty space)
"${PLUGIN_ROOT}/scripts/update-summary.sh" " " "${session_id}" >/dev/null 2>&1 || true

# Determine which command to show in protocol (prefer short command if available)
UPDATE_COMMAND="claude-glance update"
if ! command -v claude-glance &>/dev/null; then
  UPDATE_COMMAND="${PLUGIN_ROOT}/scripts/update-summary.sh"
fi

# Output protocol as plain text (becomes additionalContext)
cat <<EOF
<session-summary>
## REQUIRED: Update Statusline

You MUST update the statusline when you begin working on a NEW TOPIC.
Users see this summary in real-time in their terminal.

### When to Update
- When the user gives you a new task or question (new topic)
- NOT when your approach changes within the same task
- One update per topic is sufficient

### Format
3-5 words, gerund form (ending in -ing):
- "Adding auth middleware"
- "Fixing login race condition"
- "Refactoring database queries"

Avoid: "Working on code" (too vague) or multiple updates for the same task.

### Action
Execute this bash command when the topic changes:
${UPDATE_COMMAND} "your-summary-here" ${session_id}
</session-summary>
EOF
