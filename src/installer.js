// =============================================================================
// Installer - npx claude-glance install
// =============================================================================

const fs = require('fs');
const path = require('path');
const enquirer = require('enquirer');
const {
  c,
  section,
  clearScreen,
  waitForEnter,
  getConfigDir,
  getInstallDir,
  getSettingsPath,
  getProjectSettingsPath,
  detectInstallations,
  getTmpBase,
  readSettings,
  writeSettings,
  backupSettings,
  mergeHooks,
  askConfirm,
  askChoice,
  askInput,
} = require('./utils');

// Files to install (relative to package root)
const SCRIPTS = [
  'scripts/statusline.sh',
  'scripts/session-start.sh',
  'scripts/update-summary.sh',
  'lib/parse-json.js',
];

// Hook configuration to merge into settings
function buildHooksConfig(installDir) {
  return {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: `bash '${path.join(installDir, 'scripts', 'session-start.sh')}'`,
            timeout: 5000,
          },
        ],
      },
    ],
  };
}

// Statusline configuration
function buildStatuslineConfig(installDir, customPath = null) {
  return {
    type: 'command',
    command: customPath || `bash '${path.join(installDir, 'scripts', 'statusline.sh')}'`,
  };
}

const isTTY = process.stdout.isTTY;

// =============================================================================
// Drawing helpers
// =============================================================================

// Column layout shared by welcome preview and labels
const COLS = [
  { data: 'anthropic.com',     label: 'domain',      desc: "Provider's API endpoint",      w: 13, color: 'gray' },
  { data: 'project',           label: 'folder',      desc: 'Where Claude was launched',    w: 7,  color: 'green' },
  { data: 'main',              label: 'branch',      desc: 'Git branch',                   w: 4,  color: 'magenta' },
  { data: '23%',               label: 'ctx%',        desc: 'Context used',                 w: 3,  color: 'cyan' },
  { data: '3:42pm Feb 8',      label: 'time',        desc: "User's last activity",         w: 11, color: 'dim' },
  { data: '+189 -128',         label: 'diff',        desc: 'Git changes',                  w: 9,  color: 'yellow', customData: true },
];
const SEP = c.dim(' │ ');
const CONTENT_W = COLS.reduce((sum, col) => sum + col.w, 0) + (COLS.length - 1) * 3 + 1; // 60

// Italic + color helpers for legend text
const ic = {
  gray:    (s) => `\x1b[3;90m${s}\x1b[0m`,
  green:   (s) => `\x1b[3;32m${s}\x1b[0m`,
  red:     (s) => `\x1b[3;31m${s}\x1b[0m`,
  magenta: (s) => `\x1b[3;35m${s}\x1b[0m`,
  cyan:    (s) => `\x1b[3;36m${s}\x1b[0m`,
  dim:     (s) => `\x1b[3;90m${s}\x1b[0m`,
  yellow:  (s) => `\x1b[3;33m${s}\x1b[0m`,
};

function drawStepHeader(step, total) {
  const dots = Array.from({ length: total }, (_, i) =>
    i < step ? c.cyan('●') : c.dim('○')
  ).join(' ');
  const left = `  ${c.bold('claude-glance')}`;
  const pad = ' '.repeat(Math.max(1, 42 - 'claude-glance'.length - total * 2));
  console.log(`${left}${pad}${dots}`);
  console.log('');
}

function drawStatuslinePreview() {
  const dataLine = COLS.map(col => {
    if (col.customData) {
      // Format diff with green + and red -
      const plus = c.green('+189');
      const minus = c.red('-128');
      const padding = ' '.repeat(col.w - 9); // 9 = len('+189') + len(' ') + len('-128')
      return plus + ' ' + minus + padding;
    }
    return c[col.color](col.data.padEnd(col.w));
  }).join(SEP);
  console.log(`    ${dataLine}`);
  console.log(`    ${c.yellow('▸ User auth, API, bug fixes')}`);
}

function drawWelcome() {
  const dataLine = COLS.map(col => {
    if (col.customData) {
      // Format diff with green + and red -
      const plus = c.green('+189');
      const minus = c.red('-128');
      const padding = ' '.repeat(col.w - 9); // 9 = len('+189') + len(' ') + len('-128')
      return plus + ' ' + minus + padding;
    }
    return c[col.color](col.data.padEnd(col.w));
  }).join(SEP);
  const taskData = c.yellow('▸ User auth, API, bug fixes');

  // Italic legend with matching colors
  const iSep = ic.dim(' │ ');
  const labelLine = COLS.map(col => {
    if (col.label === 'diff') {
      // Color "di" green and "ff" red
      const di = ic.green('di');
      const ff = ic.red('ff');
      const padding = ' '.repeat(col.w - 4); // 4 = len('di') + len('ff')
      return di + ff + padding;
    }
    return ic[col.color](col.label.padEnd(col.w));
  }).join(iSep);
  const taskLabel = ic.yellow('▸ summary') + ic.yellow(' (auto-updated session summary)');

  const rule = c.dim('─'.repeat(CONTENT_W));

  console.log('');
  console.log(`    ${c.bold('claude-glance')} ${c.dim('─ your sessions, at a glance.')}`);
  console.log('');
  console.log(`    ${rule}`);
  console.log(`    ${c.cyan('❯')} `);
  console.log(`    ${rule}`);
  console.log(`    ${dataLine}`);
  console.log(`    ${taskData}`);
  console.log(`    ${c.purple('▸▸ accept edits on')}`);
  console.log('');
  console.log(`    ${c.dim('Legend:')}`);
  console.log('');
  for (const col of COLS) {
    let label;
    if (col.label === 'diff') {
      // Color "di" green and "ff" red
      const di = ic.green('di');
      const ff = ic.red('ff');
      const padding = ' '.repeat(14 - 4); // 14 is the label width, 4 is len('di') + len('ff')
      label = di + ff + padding;
    } else {
      label = ic[col.color](col.label.padEnd(14));
    }
    const desc = ic.dim(col.desc);
    console.log(`      ${label}${desc}`);
  }
  console.log(`      ${ic.yellow('▸ summary'.padEnd(14))}${ic.dim('Auto-updated session summary')}`);
  console.log('');
  console.log('');
}

function drawSummaryCard(installTargets, statuslineConfig) {
  console.log('');
  console.log(`  ${c.cyan('◆')}  ${c.bold('claude-glance')}`);
  console.log('');

  for (const target of installTargets) {
    const label = target.type === 'project' ? 'Project' : 'Global';
    console.log(`  ${c.green('✓')} ${c.white(label)} ${c.dim(target.settingsPath)}`);
  }

  if (statuslineConfig.install) {
    const val = statuslineConfig.customPath || 'claude-glance';
    console.log(`  ${c.green('✓')} ${c.white('Statusline')} ${c.dim(val)}`);
  } else {
    console.log(`  ${c.dim('○')} ${c.white('Statusline')} ${c.dim('skipped')}`);
  }

  console.log('');
}

// =============================================================================
// Main install flow
// =============================================================================

async function install(flags = []) {
  const configDir = getConfigDir(flags);
  const packageRoot = path.resolve(__dirname, '..');
  const projectDir = process.cwd();

  // Handle Ctrl+C gracefully - prevent enquirer's error
  let handledSigInt = false;
  const onSigInt = () => {
    if (!handledSigInt) {
      handledSigInt = true;
      console.log('\n  Cancelled.');
      process.exit(0);
    }
  };

  // Add our handler before enquirer gets a chance
  process.prependListener('SIGINT', onSigInt);

  // ── Prerequisites (before any screens) ──
  if (!fs.existsSync(configDir)) {
    console.error(`\n  ${c.red('✗')} Claude config not found: ${configDir}`);
    if (process.env.CLAUDE_CONFIG_DIR) {
      console.error(`    CLAUDE_CONFIG_DIR=${process.env.CLAUDE_CONFIG_DIR}`);
      console.error(`    Verify this path or unset to use ~/.claude/`);
    } else {
      console.error(`    Run "claude" first to initialize.`);
    }
    process.exit(1);
  }


  // ── Welcome ──
  if (isTTY) {
    drawWelcome();
  }

  // ── Single Smart Question ──
  let mode = 'skip';
  try {
    const response = await enquirer.prompt({
      type: 'select',
      name: 'mode',
      message: 'How would you like to install claude-glance',
      choices: [
        { message: `Quick setup (project only, recommended)`, value: 'quick' },
        { message: 'Custom setup', value: 'custom' },
        { message: 'Skip', value: 'skip' },
      ],
    });
    mode = response.mode;
  } catch (err) {
    // Error or Ctrl+C - our SIGINT handler handles exit
    return;
  }

  console.log('');

  if (mode === 'skip') {
    console.log(`\n  ${c.yellow('✗')} Cancelled.\n`);
    return;
  }

  let installTargets = [];
  let statuslineConfig = { install: false, customPath: null };

  if (mode === 'quick') {
    // Quick setup: project install with everything enabled
    const projectSettingsPath = getProjectSettingsPath(projectDir);
    installTargets = [{
      type: 'project',
      settingsPath: projectSettingsPath,
      installDir: path.join(path.dirname(projectSettingsPath), 'session-summary'),
    }];
    statuslineConfig = { install: true, customPath: null };
  } else {
    // Custom setup: show the detailed prompts
    const projectTarget = await promptProjectInstallation(projectDir);
    console.log('');
    const globalTarget = await promptGlobalInstallation(configDir);
    console.log('');

    const targets = [projectTarget, globalTarget].filter(t => t !== null);
    if (targets.length === 0) {
      console.log(`\n  ${c.yellow('✗')} Nothing selected.\n`);
      return;
    }

    installTargets = targets.map(t => ({
      ...t,
      installDir: t.type === 'project'
        ? path.join(path.dirname(t.settingsPath), 'session-summary')
        : getInstallDir(path.dirname(t.settingsPath))
    }));

    const promptInstallDir = installTargets[0].installDir;
    statuslineConfig = await promptStatusline(targets, promptInstallDir);
    console.log('');
  }

  // ── Summary & Confirm ──
  if (mode === 'quick') {
    // Quick setup: simpler confirmation
    console.log('');
    console.log(`  ${c.dim('Installing to:')}`);
    console.log(`  ${c.cyan(installTargets[0].settingsPath)}`);
    console.log(`  ${c.dim('with hooks + statusline')}`);
    console.log('');
  } else {
    drawSummaryCard(installTargets, statuslineConfig);
  }

  // Simple confirmation - just wait for Enter
  try {
    await enquirer.prompt({
      type: 'input',
      name: 'confirm',
      message: '  Press Enter to install',
      initial: '',
      hint: '',
    });
  } catch (err) {
    // Ctrl+C
    console.log(`\n  ${c.yellow('✗')} Cancelled.\n`);
    return;
  }

  // Check for existing installation
  const existing = detectInstallations(configDir, projectDir);
  if (existing.scriptsExist) {
    console.log(c.dim('\n  Updating existing installation.'));
  }

  // ── Install ──
  console.log('');
  for (const target of installTargets) {
    for (const scriptPath of SCRIPTS) {
      const src = path.join(packageRoot, scriptPath);
      const dest = path.join(target.installDir, scriptPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      if (!fs.existsSync(src)) {
        console.log(`  ${c.red('✗')} Missing: ${src}`);
        continue;
      }

      let content = fs.readFileSync(src, 'utf8');
      const tmpBase = getTmpBase();
      if (tmpBase === '/tmp') {
        content = content.replace(/\/private\/tmp/g, '/tmp');
      }

      fs.writeFileSync(dest, content, { mode: 0o755 });
    }

    const label = target.type === 'global' ? 'Global ' : 'Project';
    const settingsPath = target.settingsPath;

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

    const backupPath = backupSettings(settingsPath);
    const settings = readSettings(settingsPath);

    const hooksConfig = buildHooksConfig(target.installDir);
    settings.hooks = mergeHooks(settings.hooks || {}, hooksConfig);

    if (statuslineConfig.install) {
      settings.statusLine = buildStatuslineConfig(target.installDir, statuslineConfig.customPath);
    }

    writeSettings(settingsPath, settings);

    console.log(`  ${c.dim('Installed at:')}`);
    console.log(`  ${settingsPath}`);
    if (backupPath) {
      console.log(`  ${c.dim('Backup at:')}`);
      console.log(`  ${path.basename(backupPath)}`);
    }
    console.log('');
  }

  console.log('');
  console.log(`  ${c.green('✓')} ${c.bold('Done')} ${c.dim('─ Claude Code will detect it automatically.')}`);
  console.log('');

  // Remove SIGINT listener after successful install
  process.off('SIGINT', onSigInt);
}

// =============================================================================
// Prompt Functions
// =============================================================================

async function promptProjectInstallation(projectDir) {
  console.log('');
  section('Project');
  console.log(`  ${c.dim('Hooks & scripts in .claude/ ─ this project only.')}`);
  console.log(`  ${c.dim('Overrides global when both are installed.')}`);

  const choice = await enquirer.prompt({
    type: 'select',
    name: 'choice',
    message: 'Install for project?',
    choices: [
      { message: `Yes, current directory (${projectDir})`, value: 'current' },
      { message: 'Yes, different directory', value: 'custom' },
      { message: 'Skip', value: 'skip' },
    ],
  }).then(r => r.choice).catch(() => 'skip');

  if (choice === 'current') {
    return { type: 'project', settingsPath: getProjectSettingsPath(projectDir) };
  }

  if (choice === 'custom') {
    const customPath = await enquirer.prompt({
      type: 'input',
      name: 'path',
      message: '  Path:',
      initial: projectDir,
    }).then(r => r.path).catch(() => projectDir);
    if (!fs.existsSync(customPath)) {
      console.log(`\n  ${c.yellow('!')} Directory not found: ${customPath}`);
      const proceed = await enquirer.prompt({
        type: 'confirm',
        name: 'proceed',
        message: '  Continue anyway?',
        initial: false,
      }).then(r => r.proceed).catch(() => false);
      if (!proceed) return null;
    }
    return { type: 'project', settingsPath: getProjectSettingsPath(customPath) };
  }

  return null;
}

async function promptGlobalInstallation(configDir) {
  console.log('');
  section('Global');
  console.log(`  ${c.dim('Hooks & scripts in ~/.claude/ ─ all projects.')}`);
  console.log(`  ${c.dim('Project-specific settings may override.')}`);

  const choice = await enquirer.prompt({
    type: 'select',
    name: 'choice',
    message: 'Install for global?',
    choices: [
      { message: `Yes, default path (${getSettingsPath(configDir)})`, value: 'default' },
      { message: 'Yes, different directory', value: 'custom' },
      { message: 'Skip', value: 'skip' },
    ],
  }).then(r => r.choice).catch(() => 'skip');

  if (choice === 'default') {
    return { type: 'global', settingsPath: getSettingsPath(configDir) };
  }

  if (choice === 'custom') {
    const customPath = await enquirer.prompt({
      type: 'input',
      name: 'path',
      message: '  Path:',
      initial: configDir,
    }).then(r => r.path).catch(() => configDir);
    if (!fs.existsSync(customPath)) {
      console.log(`\n  ${c.yellow('!')} Directory not found: ${customPath}`);
      const proceed = await enquirer.prompt({
        type: 'confirm',
        name: 'proceed',
        message: '  Continue anyway?',
        initial: false,
      }).then(r => r.proceed).catch(() => false);
      if (!proceed) return null;
    }
    return { type: 'global', settingsPath: path.join(customPath, 'settings.json') };
  }

  return null;
}

async function promptStatusline(targets, installDir) {
  console.log('');
  section('Statusline');

  // Show statusline preview as reminder
  if (isTTY) {
    console.log(`  ${c.dim('Replaces your statusline with:')}`);
    console.log('');
    drawStatuslinePreview();
    console.log('');
  }

  // Check for existing statusline
  let existingStatusline = null;
  for (const target of targets) {
    if (fs.existsSync(target.settingsPath)) {
      const settings = readSettings(target.settingsPath);
      if (settings.statusLine) {
        existingStatusline = settings.statusLine;
        break;
      }
    }
  }

  if (existingStatusline) {
    console.log(`  ${c.yellow('!')} Existing statusline detected`);
    console.log(`  ${c.dim(JSON.stringify(existingStatusline))}`);
    console.log('');
  }

  const choice = await enquirer.prompt({
    type: 'select',
    name: 'choice',
    message: 'Statusline:',
    choices: [
      { message: 'Install claude-glance statusline', value: 'builtin' },
      { message: 'Use custom script', value: 'custom' },
      { message: 'Skip (hooks still work)', value: 'skip' },
    ],
  }).then(r => r.choice).catch(() => 'skip');

  if (choice === 'builtin') {
    return { install: true, customPath: null };
  }

  if (choice === 'custom') {
    const customPath = await enquirer.prompt({
      type: 'input',
      name: 'path',
      message: '  Script path:',
    }).then(r => r.path).catch(() => '');
    console.log(`\n  ${c.dim('Summary is at {scratchpad}/session-summary.txt')}`);
    console.log(`  ${c.dim('Read it from your script to include it.')}`);
    return { install: true, customPath };
  }

  console.log(`\n  ${c.dim('Summary maintained at {scratchpad}/session-summary.txt')}`);
  return { install: false, customPath: null };
}

// =============================================================================
// Status Command
// =============================================================================

async function status(flags = []) {
  const configDir = getConfigDir(flags);
  const installDir = getInstallDir(configDir);
  const projectDir = process.cwd();
  const detected = detectInstallations(configDir, projectDir);

  console.log(c.bold('\nclaude-glance status\n'));

  // Scripts
  console.log(
    detected.scriptsExist ? c.green('  [ok]') : c.red('  [--]'),
    'Scripts installed',
    c.dim(`(${path.join(installDir, 'scripts')})`)
  );


  // Global
  console.log(c.bold('\n  Global'), c.dim(`(${getSettingsPath(configDir)})`));
  console.log(
    detected.global ? c.green('    [ok]') : c.dim('    [--]'),
    'Hooks configured'
  );
  console.log(
    detected.globalStatusline ? c.green('    [ok]') : c.dim('    [--]'),
    'Statusline configured'
  );

  // Project
  console.log(c.bold('\n  Project'), c.dim(`(${getProjectSettingsPath(projectDir)})`));
  console.log(
    detected.project ? c.green('    [ok]') : c.dim('    [--]'),
    'Hooks configured'
  );
  console.log(
    detected.projectStatusline ? c.green('    [ok]') : c.dim('    [--]'),
    'Statusline configured'
  );

  console.log('');
}

module.exports = { install, status };
