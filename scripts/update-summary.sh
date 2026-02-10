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

# Construct scratchpad path
uid=$(id -u)
escaped_cwd=$(echo "$PWD" | sed 's|^/||; s|/|-|g')
scratchpad="${TMP_BASE}/claude-${uid}/-${escaped_cwd}/${SESSION_ID}/scratchpad"

mkdir -p "$scratchpad" 2>/dev/null
echo "$SUMMARY" > "${scratchpad}/session-summary.txt"

echo "📝 Summary updated"
