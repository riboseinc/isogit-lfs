import path from 'path';


interface PointerInfo {
  /** SHA256 hash of the actual blob contents. */
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

interface PointerRequest {
  dir: string;
  gitdir?: string;
  content: Buffer;
}


export function readPointer({ dir, gitdir = path.join(dir, '.git'), content }: PointerRequest): Pointer {
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
    const objectPath = path.join(
      gitdir,
      'lfs',
      'objects',
      info.oid.substr(0, 2),
      info.oid.substr(2, 2),
      info.oid);

    return { info, objectPath };

  } else {
    throw new Error("LFS pointer is incomplete or cannot be read");
  }
}
