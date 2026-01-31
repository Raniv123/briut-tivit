import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const API_KEY = process.env.ELEVENLABS_API_KEY;
const testFile = 'D:/OneDrive/ניב ורן אישי/שיעורים/הרב אשרוב/התמכוריות/- hetmakroyot.mp3';

async function test() {
  console.log('Testing transcription with: ' + path.basename(testFile));
  const fileBuffer = fs.readFileSync(testFile);
  console.log('File size: ' + (fileBuffer.length / 1024 / 1024).toFixed(1) + ' MB');

  const blob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append('file', blob, path.basename(testFile));
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'he');
  formData.append('tag_audio_events', 'false');

  console.log('Sending to ElevenLabs...');
  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY! },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Error: ' + response.status + ' - ' + err);
    return;
  }

  const result = await response.json() as any;
  console.log('Words: ' + (result.words || []).length);
  console.log('Text preview (first 300 chars):');
  console.log((result.text || '').substring(0, 300));
  console.log('\n✓ Test passed!');
}

test();
