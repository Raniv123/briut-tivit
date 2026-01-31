#!/usr/bin/env npx ts-node
/**
 * Batch transcribe all audio files from הרב אשרוב lectures
 * Saves JSON + TXT for each file, with resume support
 * Uses axios + form-data for reliable large file streaming uploads
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

const SOURCE_DIR = 'D:/OneDrive/ניב ורן אישי/שיעורים/הרב אשרוב';
const OUTPUT_DIR = 'D:/PROJECTS/health-qa/data/transcripts';
const PROGRESS_FILE = path.join(OUTPUT_DIR, '_progress.json');

interface Word {
  word: string;
  start: number;
  end: number;
}

interface TranscriptResult {
  sourceFile: string;
  topic: string;
  title: string;
  language: string;
  duration: number;
  text: string;
  words: Word[];
  transcribedAt: string;
}

interface Progress {
  completed: string[];
  failed: string[];
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [], failed: [] };
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

function findAudioFiles(dir: string, basePath: string = ''): { filePath: string; topic: string; title: string }[] {
  const files: { filePath: string; topic: string; title: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findAudioFiles(fullPath, entry.name));
    } else if (/\.(mp3|mp4|wav|m4a)$/i.test(entry.name)) {
      const title = entry.name.replace(/\.(mp3|mp4|wav|m4a)$/i, '').replace(/~\d+$/, '');
      files.push({
        filePath: fullPath,
        topic: basePath || 'כללי',
        title
      });
    }
  }

  return files;
}

async function transcribeFile(filePath: string): Promise<{ text: string; words: Word[]; duration: number; language: string }> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set in .env');
  }

  const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
  console.log(`  Size: ${fileSizeMB.toFixed(1)} MB`);

  const timeoutMs = Math.max(1800000, fileSizeMB * 15000); // 30 min minimum
  console.log(`  Timeout: ${(timeoutMs / 60000).toFixed(0)} min`);

  // Use form-data with file stream (no memory loading)
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'audio/mpeg',
  });
  form.append('model_id', 'scribe_v2');
  form.append('language_code', 'he');
  form.append('tag_audio_events', 'false');

  const response = await axios.post(
    `${ELEVENLABS_BASE_URL}/v1/speech-to-text`,
    form,
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        ...form.getHeaders(),
      },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );

  const result = response.data;

  const words: Word[] = (result.words || []).map((w: any) => ({
    word: w.text || w.word || '',
    start: w.start || 0,
    end: w.end || 0,
  }));

  const duration = words.length > 0 ? Math.max(...words.map(w => w.end)) : 0;

  return {
    text: result.text || '',
    words,
    duration,
    language: result.language_code || 'he',
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Batch Transcription ===\n');

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Find all audio files
  const audioFiles = findAudioFiles(SOURCE_DIR);
  console.log(`Found ${audioFiles.length} audio files\n`);

  // Load progress
  const progress = loadProgress();
  console.log(`Previously completed: ${progress.completed.length}`);
  console.log(`Previously failed: ${progress.failed.length}\n`);

  // Filter out completed
  const remaining = audioFiles.filter(f => !progress.completed.includes(f.filePath));
  console.log(`Remaining: ${remaining.length}\n`);

  if (remaining.length === 0) {
    console.log('All files already transcribed!');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < remaining.length; i++) {
    const file = remaining[i];
    const num = i + 1;
    const total = remaining.length;

    console.log(`[${num}/${total}] ${file.topic} / ${file.title}`);
    console.log(`  File: ${path.basename(file.filePath)}`);

    try {
      const result = await transcribeFile(file.filePath);

      const transcript: TranscriptResult = {
        sourceFile: file.filePath,
        topic: file.topic,
        title: file.title,
        language: result.language,
        duration: result.duration,
        text: result.text,
        words: result.words,
        transcribedAt: new Date().toISOString(),
      };

      // Create topic directory
      const topicDir = path.join(OUTPUT_DIR, file.topic);
      fs.mkdirSync(topicDir, { recursive: true });

      // Save JSON
      const safeName = file.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      const jsonPath = path.join(topicDir, `${safeName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(transcript, null, 2), 'utf-8');

      // Save TXT
      const txtPath = path.join(topicDir, `${safeName}.txt`);
      fs.writeFileSync(txtPath, result.text, 'utf-8');

      console.log(`  ✓ Done: ${result.words.length} words, ${result.duration.toFixed(0)}s`);
      console.log(`  Saved: ${safeName}.json\n`);

      progress.completed.push(file.filePath);
      // Remove from failed if it was there
      progress.failed = progress.failed.filter(f => f !== file.filePath);
      successCount++;
    } catch (err) {
      const errMsg = (err as Error).message;
      console.log(`  ✗ Error: ${errMsg}\n`);

      if (!progress.failed.includes(file.filePath)) {
        progress.failed.push(file.filePath);
      }
      failCount++;
    }

    // Save progress after each file
    saveProgress(progress);

    // Wait between API calls
    if (i < remaining.length - 1) {
      await sleep(2000);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total: ${remaining.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`\nTranscripts saved to: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
