#!/usr/bin/env node
// =============================================================================
// claude-glance CLI
// =============================================================================

// Handle enquirer's readline cleanup crash on Ctrl+C (Node 20+)
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_USE_AFTER_CLOSE') process.exit(0);
  console.error(err);
  process.exit(1);
});

const command = process.argv[2];
const flags = process.argv.slice(3);

const HELP = `
claude-glance - At-a-glance session summary for Claude Code

Usage:
  npx claude-glance <command>

Commands:
  install       Interactive installer (walks you through each option)
  uninstall     Remove hooks, scripts, and settings
  status        Check current installation status
  update        Update session summary (called by Claude automatically)
`;

async function main() {
  switch (command) {
    case 'install': {
      const { install } = require('../src/installer');
      await install(flags);
      break;
    }
    case 'uninstall': {
      const { uninstall } = require('../src/uninstaller');
      await uninstall(flags);
      break;
    }
    case 'status': {
      const { status } = require('../src/installer');
      await status(flags);
      break;
    }
    case 'update': {
      // update <summary> <session_id>
      // Called by Claude to update the session summary
      const { execSync } = require('child_process');
      const path = require('path');

      // Get the script location (relative to package root)
      const updateScript = path.join(__dirname, '..', 'scripts', 'update-summary.sh');

      // Get arguments (summary and session_id)
      const summary = flags[0] || '';
      const sessionId = flags[1] || '';

      if (!summary || !sessionId) {
        console.error('Usage: claude-glance update <summary> <session_id>');
        process.exit(1);
      }

      // Execute the bash script
      try {
        execSync(`bash "${updateScript}" '${summary}' '${sessionId}'`, {
          stdio: 'inherit'
        });
      } catch (error) {
        process.exit(error.status || 1);
      }
      break;
    }
    case '--help':
    case '-h':
    case 'help':
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
