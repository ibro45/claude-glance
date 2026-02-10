// =============================================================================
// Uninstaller - npx claude-glance uninstall
// =============================================================================

const fs = require('fs');
const path = require('path');
const enquirer = require('enquirer');
const {
  c,
  getConfigDir,
  getInstallDir,
  getSettingsPath,
  getProjectSettingsPath,
  detectInstallations,
  readSettings,
  writeSettings,
  backupSettings,
  removeOurHooks,
  isOurStatusline,
} = require('./utils');

// Remove our hooks and statusline from a settings file
function cleanSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return false;

  const backupPath = backupSettings(settingsPath);
  if (backupPath) {
    console.log(c.dim(`  Backup: ${path.basename(backupPath)}`));
  }

  const settings = readSettings(settingsPath);
  let changed = false;

  if (settings.hooks) {
    const before = JSON.stringify(settings.hooks);
    settings.hooks = removeOurHooks(settings.hooks);
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
    if (JSON.stringify(settings.hooks) !== before) {
      console.log(c.green('-'), `Removed hooks from ${c.dim(settingsPath)}`);
      changed = true;
    }
  }

  if (isOurStatusline(settings.statusLine)) {
    delete settings.statusLine;
    console.log(c.green('-'), `Removed statusline from ${c.dim(settingsPath)}`);
    changed = true;
  }

  if (changed) {
    writeSettings(settingsPath, settings);
  }
  return changed;
}

async function uninstall(flags = []) {
  const configDir = getConfigDir(flags);
  const installDir = getInstallDir(configDir);
  const projectDir = process.cwd();

  // Handle Ctrl+C gracefully
  const onSigInt = () => {
    console.log('\n  Cancelled.');
    process.exit(0);
  };
  process.prependListener('SIGINT', onSigInt);

  console.log(c.bold('\nclaude-glance uninstaller\n'));

  const detected = detectInstallations(configDir, projectDir);
  const locations = [];
  if (detected.global) locations.push('global');
  if (detected.project) locations.push('project');

  if (locations.length === 0 && !detected.scriptsExist) {
    console.log(c.dim('  Nothing to uninstall.\n'));
    process.off('SIGINT', onSigInt);
    return;
  }

  // Determine what to remove
  let removeGlobal = false;
  let removeProject = false;
  let removeScripts = false;

  if (locations.length > 1) {
    // Installed in multiple locations — ask what to remove
    console.log(`  Found in: ${locations.map((l) => c.cyan(l)).join(', ')}\n`);

    let choice = 'cancel';
    try {
      const response = await enquirer.prompt({
        type: 'select',
        name: 'choice',
        message: 'What would you like to remove?',
        choices: [
          { message: 'Everything', value: 'all' },
          { message: 'Global only', value: 'global' },
          { message: 'Project only', value: 'project' },
          { message: 'Cancel', value: 'cancel' },
        ],
      });
      choice = response.choice;
    } catch (err) {
      // Ctrl+C - our SIGINT handler handles exit
      process.off('SIGINT', onSigInt);
      return;
    }

    if (choice === 'cancel') {
      console.log(c.dim('\n  Cancelled.\n'));
      process.off('SIGINT', onSigInt);
      return;
    }

    removeGlobal = choice === 'all' || choice === 'global';
    removeProject = choice === 'all' || choice === 'project';
    removeScripts = choice === 'all';
  } else if (locations.length === 1) {
    // Installed in one location — simple confirm
    const where = locations[0] === 'global' ? '~/.claude/settings.json' : '.claude/settings.local.json';
    console.log(`  Found in: ${c.cyan(locations[0])} (${where})\n`);

    let proceed = false;
    try {
      const response = await enquirer.prompt({
        type: 'input',
        name: 'confirm',
        message: '  Press Enter to remove claude-glance',
        initial: '',
        hint: '',
      });
      proceed = true;
    } catch (err) {
      // Ctrl+C
      process.off('SIGINT', onSigInt);
      return;
    }

    if (!proceed) {
      console.log(c.dim('\n  Cancelled.\n'));
      process.off('SIGINT', onSigInt);
      return;
    }

    removeGlobal = locations[0] === 'global';
    removeProject = locations[0] === 'project';
    removeScripts = true;
  } else {
    // Only scripts exist (no hooks in settings) — offer to clean up
    console.log(`  Scripts found at ${c.dim(installDir)} but no hooks in settings.\n`);

    let proceed = false;
    try {
      const response = await enquirer.prompt({
        type: 'input',
        name: 'confirm',
        message: '  Press Enter to remove leftover scripts',
        initial: '',
        hint: '',
      });
      proceed = true;
    } catch (err) {
      // Ctrl+C
      process.off('SIGINT', onSigInt);
      return;
    }

    if (!proceed) {
      console.log(c.dim('\n  Cancelled.\n'));
      process.off('SIGINT', onSigInt);
      return;
    }
    removeScripts = true;
  }

  // -------------------------------------------------------------------------
  // Remove from settings
  // -------------------------------------------------------------------------

  if (removeGlobal) {
    const globalSettingsPath = getSettingsPath(configDir);
    cleanSettings(globalSettingsPath);
  }

  if (removeProject) {
    const projectSettingsPath = getProjectSettingsPath(projectDir);
    cleanSettings(projectSettingsPath);
  }

  // -------------------------------------------------------------------------
  // Remove scripts (only when removing everything or last location)
  // -------------------------------------------------------------------------

  if (removeScripts && fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true });
    console.log(c.green('-'), `Removed ${c.dim(installDir)}`);
  }

  console.log('');
  console.log(`  ${c.green('✓')} ${c.bold('Done')} ${c.dim('─ Claude Code will detect it automatically.')}`);
  console.log('');

  process.off('SIGINT', onSigInt);
}

module.exports = { uninstall };
