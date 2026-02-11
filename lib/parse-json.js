#!/usr/bin/env node
/**
 * JSON field extractor for shell scripts
 * Usage: echo '{"key": "value"}' | node parse-json.js key
 *        echo '{"a": {"b": 1}}' | node parse-json.js a.b
 * Multiple fields: outputs one line per field
 *        echo '{"a": 1, "b": 2}' | node parse-json.js a b
 */

const fields = process.argv.slice(2);
if (fields.length === 0) {
  console.error('Usage: parse-json.js <field> [field2] ...');
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
    for (const field of fields) {
      const value = field.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : '', obj);
      console.log(value !== undefined && value !== null ? String(value) : '');
    }
  } catch (e) {
    for (const _ of fields) console.log('');
  }
});

process.stdin.on('error', () => {
  for (const _ of fields) console.log('');
});
