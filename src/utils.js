// =============================================================================
// Shared Utilities
// =============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color helpers
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  purple: (s) => `\x1b[38;5;141m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  white: (s) => `\x1b[97m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

// Check if a hook group belongs to us (by command substring)
function isOurHook(group) {
  return group.hooks?.some((h) => h.command?.includes('session-summary'));
}

// Check if a statusLine config belongs to us
function isOurStatusline(statusLine) {
  return statusLine?.command?.includes('session-summary') || false;
}

// Expand ~ to home directory (shell doesn't expand in env vars for Node)
function expandHome(p) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return p;
}

// Detect Claude config directory
// Priority: --config-dir flag > CLAUDE_CONFIG_DIR env > ~/.claude/
function getConfigDir(flags = []) {
  const flagIdx = flags.indexOf('--config-dir');
  if (flagIdx !== -1 && flags[flagIdx + 1]) {
    return expandHome(flags[flagIdx + 1]);
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    return expandHome(process.env.CLAUDE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.claude');
}

// Where we install our scripts
function getInstallDir(configDir) {
  return path.join(configDir, 'session-summary');
}

// Global settings.json path
function getSettingsPath(configDir) {
  return path.join(configDir, 'settings.json');
}

// Project-level settings path (.claude/settings.local.json in project dir)
function getProjectSettingsPath(projectDir) {
  return path.join(projectDir, '.claude', 'settings.local.json');
}

// Ensure .claude/ directory exists in project dir
function ensureProjectDir(projectDir) {
  const dir = path.join(projectDir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Check if a directory looks like a project root (not $HOME, /, etc.)
function isPlausibleProjectRoot(dir) {
  const home = os.homedir();
  const resolved = path.resolve(dir);
  if (resolved === home || resolved === '/' || resolved === '/tmp') return false;
  // Look for common project markers
  const markers = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
    'Makefile', 'CMakeLists.txt', '.claude', 'pom.xml', 'build.gradle',
    'Gemfile', 'requirements.txt', 'setup.py', 'tsconfig.json', '.hg'];
  return markers.some((m) => fs.existsSync(path.join(resolved, m)));
}

// Check a single settings file for our hooks and statusline
function checkSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return { hooks: false, statusline: false };
  try {
    const settings = readSettings(settingsPath);
    return {
      hooks: settings.hooks?.SessionStart?.some(isOurHook) || false,
      statusline: isOurStatusline(settings.statusLine),
    };
  } catch (err) {
    // Log error for debugging but don't fail - treat as not installed
    console.error(c.yellow(`!`), `Warning: Could not read ${settingsPath}: ${err.message}`);
    return { hooks: false, statusline: false };
  }
}

// Detect where claude-glance is installed (global, project, or both)
function detectInstallations(configDir, projectDir) {
  const installDir = getInstallDir(configDir);

  const global = checkSettings(getSettingsPath(configDir));
  const project = checkSettings(getProjectSettingsPath(projectDir));

  return {
    scriptsExist: fs.existsSync(path.join(installDir, 'scripts', 'session-start.sh')),
    global: global.hooks,
    globalStatusline: global.statusline,
    project: project.hooks,
    projectStatusline: project.statusline,
  };
}

// Detect OS for tmp path in scripts
function getTmpBase() {
  return process.platform === 'darwin' ? '/private/tmp' : '/tmp';
}

// Read settings.json, return parsed object or empty
function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${settingsPath}: ${e.message}\n` +
      `Please fix the JSON manually or remove the file.`
    );
  }
}

// Write settings.json with pretty formatting
function writeSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

// Backup settings.json with timestamp
function backupSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${settingsPath}.bak.${timestamp}`;
  fs.copyFileSync(settingsPath, backupPath);
  return backupPath;
}

// Deep merge hook arrays (append ours, don't overwrite existing)
function mergeHooks(existing, ours) {
  const merged = { ...existing };
  for (const [event, hookGroups] of Object.entries(ours)) {
    if (!merged[event]) {
      merged[event] = hookGroups;
    } else {
      const alreadyInstalled = merged[event].some(isOurHook);
      if (!alreadyInstalled) {
        merged[event] = [...merged[event], ...hookGroups];
      }
    }
  }
  return merged;
}

// Remove our hooks from settings (for uninstall)
function removeOurHooks(hooks) {
  if (!hooks) return {};
  const cleaned = {};
  for (const [event, hookGroups] of Object.entries(hooks)) {
    const filtered = hookGroups.filter((group) => !isOurHook(group));
    if (filtered.length > 0) {
      cleaned[event] = filtered;
    }
  }
  return cleaned;
}

// Simple yes/no prompt using readline
function askYesNo(question, defaultYes = true) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise((resolve) => {
    rl.question(`${question} ${suffix} `, (answer) => {
      rl.close();
      if (!answer.trim()) return resolve(defaultYes);
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

// Alias for consistency - askConfirm is identical to askYesNo
const askConfirm = askYesNo;

// Section header: ─── Title ──────────────────────────
function section(title) {
  const totalWidth = 41;
  const prefix = '─── ';
  const remaining = totalWidth - prefix.length - title.length - 1;
  const line = '─'.repeat(Math.max(remaining, 3));
  console.log(`  ${c.dim(prefix)}${c.bold(title)} ${c.dim(line)}`);
  console.log('');
}

// Simple choice prompt
function askChoice(question, choices) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (question) console.log(`\n  ${question}`);
    console.log('');
    choices.forEach((choice, i) => {
      console.log(`  ${c.cyan(i + 1)}  ${choice.label}`);
      if (choice.description) console.log(`     ${c.dim(choice.description)}`);
    });
    rl.question(`\n  ${c.cyan('›')} `, (answer) => {
      rl.close();
      const idx = parseInt(answer.trim() || '1', 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        resolve(choices[idx].value);
      } else {
        resolve(choices[0].value);
      }
    });
  });
}

// Text input prompt
function askInput(question, defaultValue = '') {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]: ` : ': ';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}`, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

// Clear terminal screen (only if TTY)
function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

// Wait for user to press Enter
function waitForEnter(message = '  press enter →') {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${c.dim(message)} `, () => {
      rl.close();
      resolve();
    });
  });
}

module.exports = {
  c,
  section,
  clearScreen,
  waitForEnter,
  getConfigDir,
  getInstallDir,
  getSettingsPath,
  getProjectSettingsPath,
  ensureProjectDir,
  isPlausibleProjectRoot,
  detectInstallations,
  getTmpBase,
  readSettings,
  writeSettings,
  backupSettings,
  mergeHooks,
  removeOurHooks,
  isOurStatusline,
  askYesNo,
  askChoice,
  askInput,
  askConfirm,
};
