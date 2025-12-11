#!/usr/bin/env node
/*
 * compactLogs.js
 * Compact repeating consecutive lines in a log file.
 * Usage:
 *   node compactLogs.js <inputFile> [-o <outputFile>] [--inplace]
 *
 * If --inplace is supplied the input file will be replaced with the compacted output (use with caution).
 */

const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node compactLogs.js <inputFile> [-o <outputFile>] [--inplace]');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const input = process.argv[2];
let out = null;
let inplace = false;
for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '-o' && i + 1 < process.argv.length) { out = process.argv[++i]; }
  else if (a === '--inplace') inplace = true;
  else { console.log('Unknown arg', a); usage(); }
}

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(2);
}

if (!out) {
  const dir = path.dirname(input);
  const base = path.basename(input);
  out = path.join(dir, base + '.compact.log');
}

console.log(`Compacting: ${input} -> ${out}`);

const data = fs.readFileSync(input, 'utf8');
// Normalize line endings and split
const lines = data.replace(/\r\n/g, '\n').split('\n');

const outLines = [];
let last = null;
let count = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Preserve empty line boundaries as their own entries
  if (line === last) {
    count++;
  } else {
    if (last !== null) {
      if (count === 1) outLines.push(last);
      else outLines.push(`${last} X[${count}]`);
    }
    last = line;
    count = 1;
  }
}
// flush tail
if (last !== null) {
  if (count === 1) outLines.push(last);
  else outLines.push(`${last} X[${count}]`);
}

const outData = outLines.join('\n') + '\n';
fs.writeFileSync(out, outData, 'utf8');

if (inplace) {
  try {
    fs.renameSync(out, input);
    console.log('Replaced original file with compacted output (inplace).');
  } catch (e) {
    console.error('Failed to replace original file:', e);
  }
} else {
  console.log('Compaction complete. Output written to', out);
}

process.exit(0);
