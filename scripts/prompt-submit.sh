#!/bin/bash
# =============================================================================
# Session Summary Nudge - UserPromptSubmit Hook
# =============================================================================
# Injects a brief reminder if the summary hasn't been updated recently.
# This keeps the SessionStart prompt lean while ensuring freshness.
# =============================================================================

set -euo pipefail

# Read hook payload
input=$(cat)

# Extract session_id using Node.js
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_JSON="$SCRIPT_DIR/../lib/parse-json.js"
session_id=$(echo "$input" | node "$PARSE_JSON" session_id)

[ -z "$session_id" ] && exit 0

# Detect tmp base
if [ -d "/private/tmp" ]; then
    TMP_BASE="/private/tmp"
else
    TMP_BASE="/tmp"
fi

# Get plugin root
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Find summary file via session index
uid=$(id -u)
index_file="${TMP_BASE}/claude-${uid}/session-index/${session_id}"

if [ ! -f "$index_file" ]; then
    exit 0
fi

# Read scratchpad path from index (first line)
scratchpad=$(head -n 1 "$index_file")
summary_file="${scratchpad}/session-summary.txt"

# Check if summary file exists and get modification time
if [ ! -f "$summary_file" ]; then
    # No summary yet - remind to set initial one
    cat <<EOF
<session-summary-nudge>
📍 **Statusline Summary:** Set your initial task summary.
Command: ${PLUGIN_ROOT}/scripts/update-summary.sh "your task here" ${session_id}
</session-summary-nudge>
EOF
    exit 0
fi

# Get file modification time (seconds since epoch)
# Works on both macOS (stat -f %m) and Linux (stat -c %Y)
if stat -f %m "$summary_file" >/dev/null 2>&1; then
    # macOS
    last_update=$(stat -f %m "$summary_file")
else
    # Linux
    last_update=$(stat -c %Y "$summary_file")
fi

current_time=$(date +%s)
age_seconds=$((current_time - last_update))

# Only nudge if summary is older than 5 minutes (300 seconds)
STALE_THRESHOLD=300

if [ $age_seconds -gt $STALE_THRESHOLD ]; then
    age_minutes=$((age_seconds / 60))
    cat <<EOF
<session-summary-nudge>
⚠️ **Statusline Summary:** Last updated ${age_minutes} minutes ago. Is it still accurate?
Update: ${PLUGIN_ROOT}/scripts/update-summary.sh "current task" ${session_id}
</session-summary-nudge>
EOF
fi

exit 0
