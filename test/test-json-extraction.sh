#!/bin/bash
# =============================================================================
# Test JSON extraction via Node.js
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_JSON="$SCRIPT_DIR/../lib/parse-json.js"

# Test cases with expected values
declare -a test_cases=(
    # Normal case
    '{"session_id":"abc-123","context_window":{"used_percentage":45},"workspace":{"current_dir":"/home/user/project"},"transcript_path":"/tmp/transcript.txt"}'
    # Empty/edge values
    '{"session_id":"","context_window":{"used_percentage":0},"workspace":{"current_dir":""},"transcript_path":""}'
    # Special characters in paths
    '{"session_id":"test-456","context_window":{"used_percentage":99},"workspace":{"current_dir":"/path/with spaces/project"},"transcript_path":"/tmp/file with spaces.txt"}'
    # Nested objects (should still find values at correct path)
    '{"session_id":"nested-789","context_window":{"used_percentage":12,"total":100000},"workspace":{"current_dir":"/deeply/nested/path","other":"value"},"transcript_path":"/var/log/transcript.log"}'
    # Values with special regex chars
    '{"session_id":"test-[abc]","context_window":{"used_percentage":55},"workspace":{"current_dir":"/path/with.dots.and-dashes"},"transcript_path":"/tmp/test.json"}'
)

declare -a expected_session_ids=("abc-123" "" "test-456" "nested-789" "test-[abc]")
declare -a expected_context_pcts=("45" "0" "99" "12" "55")
declare -a expected_dirs=("/home/user/project" "" "/path/with spaces/project" "/deeply/nested/path" "/path/with.dots.and-dashes")
declare -a expected_transcripts=("/tmp/transcript.txt" "" "/tmp/file with spaces.txt" "/var/log/transcript.log" "/tmp/test.json")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Counters
passed=0
failed=0

echo "Testing JSON extraction via Node.js..."
echo "======================================"

# Check if Node.js is available
if ! command -v node &>/dev/null; then
    echo -e "${RED}✗ Node.js not found - cannot run tests${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js is available${NC}"
echo ""

# Extract function using Node.js
extract_node() {
    local input=$1
    local field=$2
    echo "$input" | node "$PARSE_JSON" "$field"
}

# Test a single field
test_field() {
    local test_num=$1
    local json=$2
    local field=$3
    local expected=$4
    local description=$5

    local result
    result=$(extract_node "$json" "$field")

    # Check against expected
    if [ "$result" != "$expected" ]; then
        echo -e "${RED}✗ Test $test_num ($description): unexpected result${NC}"
        echo "  expected: '$expected'"
        echo "  got:      '$result'"
        failed=$((failed + 1))
        return
    fi

    echo -e "${GREEN}✓ Test $test_num ($description)${NC}"
    passed=$((passed + 1))
}

# Run all tests
for i in "${!test_cases[@]}"; do
    json="${test_cases[$i]}"
    idx=$((i + 1))

    echo ""
    echo "Test case $idx: ${json:0:60}..."

    test_field $idx "$json" "session_id" "${expected_session_ids[$i]}" "session_id"
    test_field $idx "$json" "context_window.used_percentage" "${expected_context_pcts[$i]}" "context_pct"
    test_field $idx "$json" "workspace.current_dir" "${expected_dirs[$i]}" "current_dir"
    test_field $idx "$json" "transcript_path" "${expected_transcripts[$i]}" "transcript_path"
done

# Summary
echo ""
echo "======================================"
echo -e "${GREEN}Passed: $passed${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed: $failed${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
