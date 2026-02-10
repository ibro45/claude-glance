# claude-glance task runner

default: check

# Run all checks (lint + smoke test)
check: lint smoke

# Lint shell scripts and JS files
lint:
    @echo "==> shellcheck"
    shellcheck scripts/*.sh
    @echo "==> node --check"
    node --check bin/cli.js
    node --check src/installer.js
    node --check src/uninstaller.js
    node --check src/utils.js
    @echo "All checks passed."

# Verify CLI --help exits 0 and outputs expected text
smoke:
    @echo "==> smoke test: --help"
    node bin/cli.js --help | grep -q "claude-glance"
    @echo "Smoke test passed."

# Install pre-commit hook and configure git hooks path
setup:
    git config core.hooksPath githooks
    @echo "Git hooks path set to githooks/"

# npm link for local testing
install-local:
    npm link
    @echo "Linked. Run: claude-glance --help"

# npm unlink
uninstall-local:
    npm unlink
    @echo "Unlinked."

# Format shell scripts with shfmt (if installed)
fmt:
    @command -v shfmt >/dev/null 2>&1 || { echo "shfmt not found, skipping."; exit 0; }
    shfmt -w -i 2 scripts/*.sh
    @echo "Formatted."

# Bump version, commit, tag, and push
release VERSION:
    #!/usr/bin/env bash
    set -euo pipefail
    version="{{VERSION}}"
    # Validate semver-ish format
    if ! echo "$version" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
        echo "Error: VERSION must be semver (e.g. 1.2.3)" >&2
        exit 1
    fi
    # Update package.json version
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$version';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    # Add CHANGELOG entry placeholder
    today=$(date +%Y-%m-%d)
    node -e "
        const fs = require('fs');
        let cl = fs.readFileSync('CHANGELOG.md', 'utf8');
        const entry = '## [$version] - $today\n\n### Changed\n\n- TODO: describe changes\n\n';
        cl = cl.replace(/^(## \[)/m, entry + '\$1');
        fs.writeFileSync('CHANGELOG.md', cl);
    "
    git add package.json CHANGELOG.md
    git commit -m "Release v$version"
    git tag "v$version"
    echo "Tagged v$version. Pushing..."
    git push && git push --tags
    echo "Done. CI will publish to npm on tag."

# Publish to npm (guards: clean tree + on a tag)
publish:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "$(git status --porcelain)" ]; then
        echo "Error: working tree is not clean" >&2
        exit 1
    fi
    tag=$(git describe --tags --exact-match 2>/dev/null || true)
    if [ -z "$tag" ]; then
        echo "Error: HEAD is not on a tag. Use 'just release VERSION' first." >&2
        exit 1
    fi
    echo "Publishing $tag to npm..."
    npm publish
    echo "Published."
