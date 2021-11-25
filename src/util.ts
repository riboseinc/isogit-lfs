import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';

export const LFS_POINTER_PREAMBLE = 'version https://git-lfs.github.com/spec/v1\n';


export function pointsToLFS(content: Buffer): boolean {
  return (
    content[0] === 118 // 'v'
    && content.subarray(0, 100).indexOf(LFS_POINTER_PREAMBLE) === 0);
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
    if ((e as { code: string }).code !== 'ENOENT') {
      return false;
    } else {
      return true;
    }
  }
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
