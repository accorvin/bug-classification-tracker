import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'server', 'data');

export function readFromStorage(key) {
  const filePath = path.join(DATA_DIR, key);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function writeToStorage(key, data) {
  const dir = path.dirname(path.join(DATA_DIR, key));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(DATA_DIR, key);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
