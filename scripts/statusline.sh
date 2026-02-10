#!/bin/bash
# =============================================================================
# Claude Code Statusline - Session Summary Plugin
# =============================================================================
# Displays a two-line status bar:
#   Line 1: api-domain │ project │ branch │ context%
#   Line 2: session summary (from scratchpad - permission-free)
#
# API domain extracted from ANTHROPIC_BASE_URL (if set)
# Summary location: {scratchpad}/session-summary.txt
#
# Note: Uses session index file for O(1) lookup of initial directory and scratchpad
# =============================================================================

# Read JSON input from Claude Code (must do this first, before any other commands)
input=$(cat)

# -----------------------------------------------------------------------------
# Line 1: Project info
# -----------------------------------------------------------------------------

# API domain (gray) - if ANTHROPIC_BASE_URL is set, use it; otherwise default
if [ -n "${ANTHROPIC_BASE_URL:-}" ]; then
    # Extract hostname and normalize to root domain
    # Handles: api.example.com → example.com, eu.api.example.co.uk → example.co.uk
    hostname=$(echo "$ANTHROPIC_BASE_URL" | sed -E 's|^https?://||' | sed 's|/.*$||')
    domain=$(echo "$hostname" | awk -F. '{
        if (NF >= 2) {
            # Check if second-to-last part is a known multi-part TLD component
            # Common ones: co, com, ac, gov, edu, org, net (in 2-part TLDs)
            if ($(NF-1) ~ /^(co|com|ac|gov|edu|org|net)$/ && NF >= 3) {
                print $(NF-2)"."$(NF-1)"."$NF
            } else {
                print $(NF-1)"."$NF
            }
        } else {
            print $0
        }
    }')
else
    domain="anthropic.com"
fi
domain_display=$(printf "\033[90m%s\033[0m │ " "$domain")

# Session ID (needed for index file lookup)
# Use Node.js to parse JSON (already required by claude-glance)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_JSON="$SCRIPT_DIR/../lib/parse-json.js"

session_id=$(echo "$input" | node "$PARSE_JSON" session_id)
context_pct=$(echo "$input" | node "$PARSE_JSON" context_window.used_percentage)
current_dir_fallback=$(echo "$input" | node "$PARSE_JSON" workspace.current_dir)
transcript_path=$(echo "$input" | node "$PARSE_JSON" transcript_path)

# Detect tmp base (macOS uses /private/tmp, Linux uses /tmp)
if [ -d "/private/tmp" ]; then
    TMP_BASE="/private/tmp"
else
    TMP_BASE="/tmp"
fi

# Read initial directory and scratchpad path from session index file (O(1) lookup)
initial_dir=""
scratchpad_path=""
if [ -n "$session_id" ]; then
    uid=$(id -u)
    index_file="${TMP_BASE}/claude-${uid}/session-index/${session_id}"
    if [ -f "$index_file" ]; then
        scratchpad_path=$(sed -n '1p' "$index_file")
        initial_dir=$(sed -n '2p' "$index_file")
    fi
fi

# Fallback to current_dir if we couldn't find initial
if [ -z "$initial_dir" ]; then
    initial_dir="$current_dir_fallback"
fi

# Project folder (green) - always show the initial project root
folder=$(basename "${initial_dir:-$HOME}")
# Truncate to 18 chars if longer
if [ ${#folder} -gt 18 ]; then
    folder="${folder:0:17}…"
fi
folder_display=$(printf "\033[32m%s\033[0m" "$folder")

# Git branch (purple) - still uses initial directory for consistency
branch_display=""
if [ -n "$initial_dir" ] && [ -d "$initial_dir/.git" ]; then
    branch=$(cd "$initial_dir" && git symbolic-ref --short HEAD 2>/dev/null || echo "")
    if [ -n "$branch" ]; then
        # Truncate to 18 chars if longer
        if [ ${#branch} -gt 18 ]; then
            branch="${branch:0:17}…"
        fi
        branch_display=$(printf " │ \033[35m%s\033[0m" "$branch")
    fi
fi

# Context percentage (cyan, red when ≥70%)
context_display=""
if [ -n "$context_pct" ]; then
    context_int=$(printf "%.0f" "$context_pct" 2>/dev/null || echo "$context_pct")
    # Use red if 70% or higher, otherwise cyan
    if [ "$context_int" -ge 70 ]; then
        context_display=$(printf " │ \033[31m⚠️ %s%%\033[0m" "$context_int")
    else
        context_display=$(printf " │ \033[36m%s%%\033[0m" "$context_int")
    fi
fi

# Last activity timestamp (dim) - based on transcript file mtime
timestamp_display=""
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
    # Get mtime - handle macOS vs Linux
    if stat -f %m "$transcript_path" &>/dev/null; then
        mtime=$(stat -f %m "$transcript_path")  # macOS
    else
        mtime=$(stat -c %Y "$transcript_path")  # Linux
    fi

    # Detect system time format preference (12-hour with AM/PM vs 24-hour)
    use_12_hour=""
    if locale -k time 2>/dev/null | grep -q "am_pm"; then
        # System uses AM/PM format
        use_12_hour=1
    fi

    # Format based on system preference
    if [ -n "$use_12_hour" ]; then
        # 12-hour format: @ 3:42pm Feb 5
        formatted=$(date -r "$mtime" "+%-l:%M%p %b %-d" 2>/dev/null | sed 's/AM/am/g; s/PM/pm/g' || date -d "@$mtime" "+%-l:%M%p %b %-d" 2>/dev/null | sed 's/AM/am/g; s/PM/pm/g')
    else
        # 24-hour format: @ 15:42 Feb 5
        formatted=$(date -r "$mtime" "+%-H:%M %b %-d" 2>/dev/null || date -d "@$mtime" "+%-H:%M %b %-d" 2>/dev/null)
    fi
    [ -n "$formatted" ] && timestamp_display=$(printf " │ \033[38;5;242m%s\033[0m" "$formatted")
fi

# Git diff stats (green for additions, red for deletions)
diff_display=""
if [ -n "$initial_dir" ] && [ -d "$initial_dir/.git" ]; then
    diff_stats=$(cd "$initial_dir" && git diff --shortstat 2>/dev/null)
    if [ -n "$diff_stats" ]; then
        # Parse: "X file(s) changed, Y insertions(+), Z deletions(-)"
        added=$(echo "$diff_stats" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "")
        deleted=$(echo "$diff_stats" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "")

        if [ -n "$added" ] && [ -n "$deleted" ]; then
            diff_display=$(printf " │ \033[32m+%s\033[0m \033[31m-%s\033[0m" "$added" "$deleted")
        elif [ -n "$added" ]; then
            diff_display=$(printf " │ \033[32m+%s\033[0m" "$added")
        elif [ -n "$deleted" ]; then
            diff_display=$(printf " │ \033[31m-%s\033[0m" "$deleted")
        fi
    fi
fi

# Summary file path (still needed for line 2)
summary_file=""
if [ -n "$scratchpad_path" ]; then
    summary_file="${scratchpad_path}/session-summary.txt"
fi

line1="${domain_display}${folder_display}${branch_display}${context_display}${timestamp_display}${diff_display}"

# -----------------------------------------------------------------------------
# Line 2: Session summary (from scratchpad)
# -----------------------------------------------------------------------------

summary=""
if [ -n "$summary_file" ] && [ -f "$summary_file" ]; then
    summary=$(head -1 "$summary_file" 2>/dev/null | cut -c1-45)
fi

# Output
if [ -n "$summary" ]; then
    line2=$(printf "\033[33m▸ %s\033[0m" "$summary")
    printf "%s\n%s" "$line1" "$line2"
else
    printf "%s" "$line1"
fi
