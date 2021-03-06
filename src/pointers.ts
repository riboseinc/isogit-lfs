import path from 'path';
import { Sha256 } from '@aws-crypto/sha256-universal';
import { SPEC_URL, toHex } from './util';


export interface PointerInfo {
  /** OID (currently, SHA256 hash) of actual blob contents. */
  oid: string;

  /** Actual blob size in bytes. */
  size: number;
}

export interface Pointer {
  info: PointerInfo;

  /** Absolute path to actual blob in LFS cache. */
  objectPath: string;
}

function isValidPointerInfo(val: Record<string, any>): val is PointerInfo {
  return val.oid.trim !== undefined && typeof val.size === 'number';
}


export function readPointerInfo(content: Buffer): PointerInfo {
  const info = content.toString().trim().split('\n').reduce((accum, line) => {
    const [k, v] = line.split(' ', 2);
    if (k === 'oid') {
      accum[k] = v.split(':', 2)[1];
    } else if (k === 'size') {
      accum[k] = parseInt(v, 10);
    }
    return accum;
  }, {} as Record<string, any>);

  if (isValidPointerInfo(info)) {
    return info;
  } else {
    throw new Error("LFS pointer is incomplete or cannot be read");
  }
}


interface PointerRequest {
  dir: string;
  gitdir?: string;
  content: Buffer;
}
export function readPointer({ dir, gitdir = path.join(dir, '.git'), content }: PointerRequest): Pointer {
  const info = readPointerInfo(content);

  const objectPath = path.join(
    gitdir,
    'lfs',
    'objects',
    info.oid.substr(0, 2),
    info.oid.substr(2, 2),
    info.oid);

  return { info, objectPath };
}


/** Formats given PointerInfo for writing in Git tree. */
export function formatPointerInfo(info: PointerInfo): Buffer {
  const lines = [
    `version ${SPEC_URL}`,
    `oid sha256:${info.oid}`,
    `size ${info.size}`,
  ];
  return Buffer.from(lines.join('\n'));
}


export async function buildPointerInfo(content: Buffer): Promise<PointerInfo> {
  const size = Buffer.byteLength(content);
  const hash = new Sha256();
  hash.update(content);
  const oid = toHex(await hash.digest());
  return { oid, size };
}
