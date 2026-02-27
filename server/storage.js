import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'server', 'data');

// S3 configuration from environment variables
const S3_BUCKET = process.env.BUG_DATA_S3_BUCKET;
const S3_PREFIX = process.env.BUG_DATA_S3_PREFIX || '';

// Initialize S3 client if bucket is configured
let s3Client = null;
if (S3_BUCKET) {
  s3Client = new S3Client({});
  console.log(`Storage: Using S3 bucket ${S3_BUCKET} with prefix "${S3_PREFIX}"`);
} else {
  console.log(`Storage: Using local file storage in ${DATA_DIR}`);
}

/**
 * Read data from storage (S3 or local file)
 * @param {string} key - Storage key (e.g., "RHOAIENG/classified-bugs.json")
 * @returns {Promise<Object|null>} - Parsed JSON data or null if not found
 */
export async function readFromStorage(key) {
  if (s3Client) {
    // Read from S3
    try {
      const s3Key = S3_PREFIX + key;
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key
      });
      const response = await s3Client.send(command);
      const raw = await response.Body.transformToString();
      return JSON.parse(raw);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  } else {
    // Read from local file
    const filePath = path.join(DATA_DIR, key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  }
}

/**
 * Write data to storage (S3 or local file)
 * @param {string} key - Storage key (e.g., "RHOAIENG/classified-bugs.json")
 * @param {Object} data - Data to write (will be JSON.stringify'd)
 * @returns {Promise<void>}
 */
export async function writeToStorage(key, data) {
  if (s3Client) {
    // Write to S3
    const s3Key = S3_PREFIX + key;
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    });
    await s3Client.send(command);
  } else {
    // Write to local file
    const dir = path.dirname(path.join(DATA_DIR, key));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(DATA_DIR, key);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}
