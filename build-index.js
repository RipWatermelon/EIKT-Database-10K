#!/usr/bin/env node

/**
 * Build Index Generator
 * Run this script once to create index.json from movies.csv
 * Usage: node build-index.js
 */

const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = path.join(__dirname, 'movies.csv');
const csvData = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV
const lines = csvData.trim().split('\n');
lines.shift(); // Remove header

const movies = [];
const index = {};

function parseCSVLine(line) {
  const cols = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cols.push(current.trim());
  return cols;
}

// Parse movies
lines.forEach(line => {
  const cols = parseCSVLine(line);
  if (cols.length < 7) return;

  const year = cols[3] ? cols[3].split('-')[0] : '';
  
  movies.push({
    name: cols[0],
    overview: cols[1],
    author: cols[2],
    sales: Number(cols[4]) || 0,
    age: cols[5],
    year: Number(year) || 0,
    rating: Number(cols[6]) || 0
  });
});

// Normalize word function - must match script.js
function normalizeWord(word) {
  return word.toLowerCase().replace(/[^\w]/g, '').trim()
}

console.log(`Loaded ${movies.length} movies`);

// Build inverted index - ONLY from titles
movies.forEach((m, id) => {
  // Index title words only
  const titleWords = m.name.toLowerCase().split(/\s+/);
  titleWords.forEach(word => {
    word = normalizeWord(word);
    if (word && word.length > 0) {
      if (!Array.isArray(index[word])) {
        index[word] = [];
      }
      if (!index[word].includes(id)) {
        index[word].push(id);
      }
    }
  });
});

console.log(`Built index with ${Object.keys(index).length} words`);

// Save index to file
const indexPath = path.join(__dirname, 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(index), 'utf-8');

console.log(`✓ Index saved to index.json (${Math.round(fs.statSync(indexPath).size / 1024)} KB)`);
console.log('The website will now load much faster!');
