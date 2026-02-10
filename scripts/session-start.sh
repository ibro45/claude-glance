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
Keep the statusline updated with the topic you're working on. Users see this in real-time.

Only update when the **topic changes** — not when your approach or phase within a topic changes. One update per topic is enough.

Format: 3-5 words describing the topic, gerund form
✓ "Adding auth middleware"
✓ "Fixing login race condition"
✓ "Refactoring database queries"
✗ "Exploring auth middleware" then "Implementing auth middleware" (don't update twice for the same topic)
✗ "Working on code" (too vague)
✗ "Starting to look at tests" (don't narrate your process)

**Command:** ${UPDATE_COMMAND} "summary" ${session_id}
</session-summary>
EOF
