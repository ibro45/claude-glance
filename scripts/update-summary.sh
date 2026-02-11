#!/bin/bash
# =============================================================================
# Update Session Summary
# =============================================================================
# Usage: /path/to/update-summary.sh "summary" <session_id>
#
# Simple, stateless wrapper. Session ID passed directly - no tracking files.
# Writes to the scratchpad directory which requires no permissions.
# =============================================================================

SUMMARY="$1"
SESSION_ID="$2"

if [[ -z "$SUMMARY" ]] || [[ -z "$SESSION_ID" ]]; then
    echo "Usage: update-summary.sh \"summary\" <session_id>"
    exit 1
fi

# Detect tmp base (macOS uses /private/tmp, Linux uses /tmp)
if [ -d "/private/tmp" ]; then
    TMP_BASE="/private/tmp"
else
    TMP_BASE="/tmp"
fi

# Read scratchpad path from session index (written by session-start.sh)
uid=$(id -u)
index_file="${TMP_BASE}/claude-${uid}/session-index/${SESSION_ID}"

if [ -f "$index_file" ]; then
    scratchpad=$(head -n 1 "$index_file")
else
    # Fallback: derive from $PWD (may diverge if CWD changed since session start)
    escaped_cwd=$(echo "$PWD" | sed 's|^/||; s|/|-|g')
    scratchpad="${TMP_BASE}/claude-${uid}/-${escaped_cwd}/${SESSION_ID}/scratchpad"
fi

mkdir -p "$scratchpad" 2>/dev/null
echo "$SUMMARY" > "${scratchpad}/session-summary.txt"

echo "📝 Summary updated"
