/**
 * Reads all transcript JSONs and embeds them directly into index.html
 * so the page works standalone with no file uploads needed.
 */

import * as fs from 'fs';
import * as path from 'path';

const TRANSCRIPTS_DIR = 'D:/PROJECTS/health-qa/data/transcripts';
const HTML_FILE = 'D:/PROJECTS/health-qa/index.html';

interface Transcript {
  sourceFile: string;
  topic: string;
  title: string;
  duration: number;
  text: string;
}

function collectTranscripts(dir: string): Transcript[] {
  const transcripts: Transcript[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      transcripts.push(...collectTranscripts(fullPath));
    } else if (entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
      try {
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        transcripts.push({
          sourceFile: raw.sourceFile || '',
          topic: raw.topic || 'כללי',
          title: raw.title || entry.name.replace('.json', ''),
          duration: raw.duration || 0,
          text: raw.text || '',
        });
      } catch (e) {
        console.error(`Skip ${entry.name}: ${(e as Error).message}`);
      }
    }
  }

  return transcripts;
}

function main() {
  console.log('Collecting transcripts...');
  const transcripts = collectTranscripts(TRANSCRIPTS_DIR);
  console.log(`Found ${transcripts.length} transcripts`);

  // Build embedded data (without words array to save space)
  const dataJson = JSON.stringify(transcripts);
  console.log(`Data size: ${(dataJson.length / 1024 / 1024).toFixed(1)} MB`);

  // Read HTML
  let html = fs.readFileSync(HTML_FILE, 'utf-8');

  // Replace or insert embedded data
  const marker = '// __EMBEDDED_TRANSCRIPTS__';
  const embedBlock = `${marker}\n        const EMBEDDED_DATA = ${dataJson};\n        // __END_EMBEDDED__`;

  if (html.includes(marker)) {
    // Replace existing embedded data
    html = html.replace(
      /\/\/ __EMBEDDED_TRANSCRIPTS__[\s\S]*?\/\/ __END_EMBEDDED__/,
      embedBlock
    );
  } else {
    // Insert before loadFromStorage() in Init section
    html = html.replace(
      'loadSettings();\n        loadFromStorage();',
      `loadSettings();\n        ${embedBlock}\n        // Auto-load embedded transcripts\n        if (EMBEDDED_DATA && EMBEDDED_DATA.length > 0) {\n            knowledgeBase.transcripts = EMBEDDED_DATA;\n            rebuildTopics();\n            saveToStorage();\n            updateUI();\n            setStatus('success', '&#10003; נטענו ' + EMBEDDED_DATA.length + ' תמלולים');\n        } else {\n            loadFromStorage();\n        }`
    );
  }

  fs.writeFileSync(HTML_FILE, html, 'utf-8');
  console.log(`\n✓ Embedded ${transcripts.length} transcripts into index.html`);
  console.log(`HTML size: ${(html.length / 1024 / 1024).toFixed(1)} MB`);
}

main();
