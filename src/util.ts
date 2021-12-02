import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { BasicAuth } from './types';


export const SPEC_URL = 'https://git-lfs.github.com/spec/v1';

export const LFS_POINTER_PREAMBLE = `version ${SPEC_URL}\n`;


/** Returns true if given blob represents an LFS pointer. */
export function pointsToLFS(content: Buffer): boolean {
  return (
    content[0] === 118 // 'v'
    && content.subarray(0, 100).indexOf(LFS_POINTER_PREAMBLE) === 0);
}


/**
 * Returns properly encoded HTTP Basic auth header,
 * given basic auth credentials.
 */
export function getAuthHeader(auth: BasicAuth): Record<string, string> {
  return {
    'Authorization':
      `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
  };
}


/**
 * Returns true if given path is available for writing,
 * regardless of whether or not it is occupied.
 */
export async function isWriteable(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath, fsConstants.W_OK);
    return true;
  } catch (e) {
    if ((e as { code: string }).code === 'ENOENT') {
      return true;
    }
    return false;
  }
}


/**
 * Returns true if given path is available for writing
 * and not occupied.
 */
export async function isVacantAndWriteable(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath, fsConstants.W_OK);
  } catch (e) {
    if ((e as { code: string }).code === 'ENOENT') {
      return true;
    }
  }
  return false;
}


export async function bodyToBuffer(body: Uint8Array[]): Promise<Buffer> {
  const buffers = [];
  let offset = 0;
  let size = 0;
  for await (const chunk of body) {
    buffers.push(chunk);
    size += chunk.byteLength;
  }

  const result = new Uint8Array(size);
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.byteLength;
  }
  return Buffer.from(result.buffer);
}
