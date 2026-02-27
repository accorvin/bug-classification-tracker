import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.BUG_DATA_S3_BUCKET;
const S3_PREFIX = process.env.BUG_DATA_S3_PREFIX || '';

const s3Client = new S3Client({});

/**
 * Read JSON data from S3.
 * @param {string} key - Storage key (e.g., "RHOAIENG/classified-bugs.json")
 * @returns {Promise<Object|null>}
 */
export async function readFromStorage(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_PREFIX + key
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
}
