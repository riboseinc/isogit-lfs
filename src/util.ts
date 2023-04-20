import type { BasicAuth } from './types';


export const SPEC_URL = 'https://git-lfs.github.com/spec/v1';

export const LFS_POINTER_PREAMBLE = `version ${SPEC_URL}\n`;

const textDecoder = new TextDecoder('utf-8');


export function stripTrailingSlash(aPath: string): string {
  return aPath.replace(/\/$/, '');
}


/** Returns true if given blob represents an LFS pointer. */
export function pointsToLFS(content: Uint8Array): boolean {
  return (
    content[0] === 118 // 'v'
    && textDecoder.decode(content.subarray(0, 100)).indexOf(LFS_POINTER_PREAMBLE) === 0);
}


/**
 * Returns properly encoded HTTP Basic auth header,
 * given basic auth credentials.
 */
export function getAuthHeader(auth: BasicAuth): Record<string, string> {
  return {
    'Authorization':
      `Basic ${btoa(`${auth.username}:${auth.password}`)}`,
  };
}


export async function bodyToBuffer(body: Uint8Array[]): Promise<Uint8Array> {
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
  return result;
}


// Borrowed from Isomorphic Git core, it is not importable.
export function toHex(buffer: ArrayBuffer): string {
  let hex = ''
  for (const byte of new Uint8Array(buffer)) {
    if (byte < 16) hex += '0'
    hex += byte.toString(16)
  }
  return hex
}
