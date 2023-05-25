import { Sha256 } from '@aws-crypto/sha256-universal';
import { SPEC_URL, toHex, stripTrailingSlash } from './util';


const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');


export interface PointerInfo {
  /** OID (currently, SHA256 hash) of actual blob contents. */
  oid: string;

  /** Actual blob size in bytes. */
  size: number;
}

/**
 * Associates `PointerInfo` with the path to corresponding blob
 * within Git repository.
 */
export interface Pointer {
  info: PointerInfo;

  /** Absolute path to actual blob in LFS cache. */
  objectPath: string;
}

function isValidPointerInfo(val: Record<string, any>): val is PointerInfo {
  return val.oid.trim !== undefined && typeof val.size === 'number';
}


export function readPointerInfo(content: Uint8Array): PointerInfo {
  const info = decoder.decode(content).trim().split('\n').reduce((accum, line) => {
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
  /** Absolute path to .git directory. */
  gitdir: string;
  content: Uint8Array;
}
/**
 * Puts together a Pointer instance based on raw pointer data
 * and path to git repository root (the .git dir for non-bare repos).
 */
export function readPointer({ gitdir, content }: PointerRequest): Pointer {
  const info = readPointerInfo(content);

  const objectPath = [
    stripTrailingSlash(gitdir),
    'lfs',
    'objects',
    info.oid.substr(0, 2),
    info.oid.substr(2, 2),
    info.oid,
  ].join('/');

  return { info, objectPath };
}


/** Formats given PointerInfo for writing in Git tree. */
export function formatPointerInfo(info: PointerInfo): Uint8Array {
  const lines = [
    `version ${SPEC_URL}`,
    `oid sha256:${info.oid}`,
    `size ${info.size}`,
  ];
  return encoder.encode(lines.join('\n'));
}


export async function buildPointerInfo(content: Uint8Array): Promise<PointerInfo> {
  const size = content.byteLength;
  const hash = new Sha256();
  hash.update(content);
  const oid = toHex(await hash.digest());
  return { oid, size };
}
