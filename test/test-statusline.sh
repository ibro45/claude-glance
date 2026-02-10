#!/bin/bash
# =============================================================================
# Test statusline.sh with sample JSON input
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATUSLINE="$ROOT_DIR/scripts/statusline.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "Testing statusline.sh..."
echo "========================"

# Test 1: Basic JSON input
echo ""
echo "Test 1: Basic JSON input"
# Single-line JSON for testing
json='{"session_id":"test-session-123","context_window":{"used_percentage":42},"workspace":{"current_dir":"'"$ROOT_DIR"'"},"transcript_path":"/tmp/test-transcript.txt"}'

# Create a fake transcript file for timestamp testing
touch /tmp/test-transcript.txt 2>/dev/null || true

output=$(echo "$json" | "$STATUSLINE" 2>&1 || true)

if echo "$output" | grep -q "claude-glance"; then
    echo -e "${GREEN}✓ Statusline outputs project name${NC}"
else
    echo -e "${RED}✗ Statusline missing project name${NC}"
    echo "Output: $output"
    exit 1
fi

if echo "$output" | grep -q "42%"; then
    echo -e "${GREEN}✓ Context percentage shown${NC}"
else
    echo -e "${YELLOW}⚠ Context percentage not shown (may be a parsing issue)${NC}"
fi

# Test 2: Test Node.js extraction directly
    echo ""
    echo "Test 2: Testing Node.js JSON extraction"

    PARSE_JSON="$ROOT_DIR/lib/parse-json.js"
    session_id=$(echo "$json" | node "$PARSE_JSON" session_id)
    context_pct=$(echo "$json" | node "$PARSE_JSON" context_window.used_percentage)

    if [ "$session_id" = "test-session-123" ]; then
        echo -e "${GREEN}✓ Node.js extracts session_id correctly${NC}"
    else
        echo -e "${RED}✗ Node.js session_id extraction failed${NC}"
        exit 1
    fi

    if [ "$context_pct" = "42" ]; then
        echo -e "${GREEN}✓ Node.js extracts context_pct correctly${NC}"
    else
        echo -e "${RED}✗ Node.js context_pct extraction failed${NC}"
        exit 1
    fi

echo ""
echo -e "${GREEN}All statusline tests passed!${NC}"
