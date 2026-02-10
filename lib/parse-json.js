#!/usr/bin/env node
/**
 * JSON field extractor for shell scripts
 * Usage: echo '{"key": "value"}' | node parse-json.js key
 * Supports nested paths: echo '{"a": {"b": 1}}' | node parse-json.js a.b
 */

const field = process.argv[2];
if (!field) {
  console.error('Usage: parse-json.js <field>');
  process.exit(1);
}

let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  data += chunk;
});

process.stdin.on('end', () => {
  try {
    const obj = JSON.parse(data);
    // Support nested paths like "context_window.used_percentage"
    const value = field.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj);
    console.log(value !== undefined && value !== null ? String(value) : '');
  } catch (e) {
    console.log('');
  }
});

process.stdin.on('error', () => {
  console.log('');
});
