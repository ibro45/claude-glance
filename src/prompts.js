// =============================================================================
// Interactive Prompts - Simple, clean prompts with arrow key navigation
// =============================================================================
// Falls back to simple readline prompts when not in a TTY

const readline = require('readline');
const { c } = require('./utils');

// Check if we can use interactive mode
function canUseInteractive() {
  return process.stdout.isTTY && process.stdin.isTTY;
}

// Key codes
const KEYS = {
  UP: '\x1B[A',
  DOWN: '\x1B[B',
  LEFT: '\x1B[D',
  RIGHT: '\x1B[C',
  ENTER: '\r',
  CTRL_C: '\x03',
  ESC: '\x1B',
  BACKSPACE: '\x7F',
  DELETE: '\x1B[3~',
};

// Hide/show terminal cursor
function hideCursor() { process.stdout.write('\x1b[?25l'); }
function showCursor() { process.stdout.write('\x1b[?25h'); }

// Clear lines and move cursor
function clearLines(count) {
  if (count <= 0) return;
  readline.moveCursor(process.stdout, 0, -count);
  readline.clearScreenDown(process.stdout);
}

// Format an option (stripping our ANSI codes, we'll add our own styling)
function formatLabel(label) {
  // Strip existing ANSI codes for clean display
  return label.replace(/\x1b\[[0-9;]*m/g, '');
}

// Enhanced choice prompt with arrow key navigation
async function askChoiceInteractive(question, choices, options = {}) {
  if (!canUseInteractive()) {
    // Fallback to simple prompt
    const { askChoice, askInput } = require('./utils');
    const choice = await askChoice(question, choices);
    if (options.allowEdit && choice === 'custom') {
      return await askInput('  Path:');
    }
    return choice;
  }

  let selectedIndex = 0;
  let lineCount = 0;

  // Find the default/recommended option
  const defaultIndex = choices.findIndex(c => c.label.includes('(Recommended)'));
  if (defaultIndex !== -1) {
    selectedIndex = defaultIndex;
  }

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  hideCursor();

  function render() {
    // Clear previous content (if any)
    clearLines(lineCount);
    lineCount = 0;

    // Render choices
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      const selected = i === selectedIndex;
      const cursor = selected ? c.cyan('❯') : ' ';
      const label = formatLabel(choice.label);

      if (selected) {
        stdout.write(`  ${cursor} ${c.cyan(label)}\n`);
      } else {
        stdout.write(`  ${cursor} ${c.dim(label)}\n`);
      }
      lineCount++;

      // Show description below selected option
      if (selected && choice.description) {
        stdout.write(`     ${c.dim(choice.description)}\n`);
        lineCount++;
      }
    }

    // Show hint at bottom
    stdout.write(`\n  ${c.dim('Use ↑↓ to navigate, Enter to select')}`);
    lineCount += 2;

    readline.cursorTo(stdout, 0);
  }

  return new Promise((resolve) => {
    render();

    const onData = (key) => {
      if (key === KEYS.CTRL_C) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        console.log('\n');
        process.exit(0);
        return;
      }

      if (key === KEYS.UP) {
        if (selectedIndex > 0) {
          selectedIndex--;
          render();
        }
        return;
      }

      if (key === KEYS.DOWN) {
        if (selectedIndex < choices.length - 1) {
          selectedIndex++;
          render();
        }
        return;
      }

      if (key === KEYS.ENTER) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);

        // Clear the prompt and show selection
        clearLines(lineCount);
        const selected = choices[selectedIndex];
        stdout.write(`  ${c.cyan('✓')} ${formatLabel(selected.label)}\n\n`);

        const value = selected.value;

        // Handle custom path input
        if (options.allowEdit && value === 'custom') {
          askInputInteractive('  Path:', options.editPlaceholder || '').then(resolve);
          return;
        }

        resolve(value);
        return;
      }

      // Number shortcuts
      const num = parseInt(key, 10);
      if (num >= 1 && num <= choices.length) {
        selectedIndex = num - 1;
        render();
      }
    };

    stdin.on('data', onData);
  });
}

// Yes/No confirmation with toggle
async function askConfirmInteractive(question, defaultYes = true) {
  if (!canUseInteractive()) {
    const { askYesNo } = require('./utils');
    return await askYesNo(question, defaultYes);
  }

  let yesSelected = defaultYes;

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  hideCursor();

  let lineCount = 0;

  function render() {
    clearLines(lineCount);
    lineCount = 0;

    stdout.write(`  ${question}\n`);
    lineCount++;

    stdout.write(`\n`);
    lineCount++;

    // Yes option
    const yesCursor = yesSelected ? c.cyan('●') : c.dim('○');
    const yesLabel = yesSelected ? c.cyan('Yes') : 'Yes';
    stdout.write(`  ${yesCursor} ${yesLabel}\n`);
    lineCount++;

    // No option
    const noCursor = !yesSelected ? c.cyan('●') : c.dim('○');
    const noLabel = !yesSelected ? c.cyan('No') : 'No';
    stdout.write(`  ${noCursor} ${noLabel}\n`);
    lineCount++;

    stdout.write(`\n  ${c.dim('Use ←→ or y/n to toggle, Enter to confirm')}`);
    lineCount += 2;

    readline.cursorTo(stdout, 0);
  }

  return new Promise((resolve) => {
    render();

    const onData = (key) => {
      if (key === KEYS.CTRL_C) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        console.log('\n');
        process.exit(0);
        return;
      }

      // Left/right or y/n to toggle
      if (key === KEYS.LEFT || key === KEYS.UP || key.toLowerCase() === 'y') {
        yesSelected = true;
        render();
        return;
      }

      if (key === KEYS.RIGHT || key === KEYS.DOWN || key.toLowerCase() === 'n') {
        yesSelected = false;
        render();
        return;
      }

      if (key === KEYS.ENTER) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);

        clearLines(lineCount);
        const answer = yesSelected ? 'Yes' : 'No';
        stdout.write(`  ${c.cyan('✓')} ${answer}\n\n`);
        resolve(yesSelected);
        return;
      }
    };

    stdin.on('data', onData);
  });
}

// Text input with inline editing
async function askInputInteractive(question, defaultValue = '') {
  if (!canUseInteractive()) {
    const { askInput } = require('./utils');
    return await askInput(question, defaultValue);
  }

  let input = defaultValue;

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  hideCursor();

  let lineCount = 0;

  function render() {
    clearLines(lineCount);
    lineCount = 0;

    stdout.write(`  ${question}\n`);
    lineCount++;

    const displayValue = input || (defaultValue ? c.dim(defaultValue) : c.dim('(empty)'));
    stdout.write(`\n  ${c.cyan('›')} ${c.cyan(displayValue)}_\n`);
    lineCount += 2;

    stdout.write(`  ${c.dim('Type input, Enter to confirm')}\n`);
    lineCount++;

    readline.cursorTo(stdout, 0);
  }

  return new Promise((resolve) => {
    render();

    const onData = (key) => {
      if (key === KEYS.CTRL_C) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        console.log('\n');
        process.exit(0);
        return;
      }

      if (key === KEYS.ENTER) {
        showCursor();
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);

        clearLines(lineCount);
        const finalValue = input || defaultValue;
        stdout.write(`  ${c.cyan('✓')} ${finalValue || '(empty)'}\n\n`);
        resolve(finalValue);
        return;
      }

      if (key === KEYS.BACKSPACE || key === KEYS.DELETE) {
        input = input.slice(0, -1);
        render();
        return;
      }

      if (key.length === 1) {
        // Allow most printable characters
        if (/[a-zA-Z0-9\/~\._\-:@ ]/.test(key)) {
          input += key;
          render();
        }
      }
    };

    stdin.on('data', onData);
  });
}

module.exports = {
  askChoiceInteractive,
  askConfirmInteractive,
  askInputInteractive,
  canUseInteractive,
};
