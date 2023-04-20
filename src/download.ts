import type { Pointer } from './pointers';
import type { HTTPRequest, FSUser } from './types';
import { bodyToBuffer, getAuthHeader } from './util';
import { unpackFs } from './fsUtils';


const encoder = new TextEncoder();


interface LFSInfoResponse {
  objects: {
    actions: {
      download: {
        href: string;
        header?: Record<string, string>;
      };
    };
  }[];
}

function isValidLFSInfoResponseData(val: Record<string, any>): val is LFSInfoResponse {
  return val.objects?.[0]?.actions?.download?.href?.trim !== undefined;
}


/**
 * Downloads, caches and returns a blob corresponding to given LFS pointer.
 * Uses already cached object, if size matches.
 */
export default async function downloadBlobFromPointer(
  { fs, http: { request }, headers = {}, url, auth }: HTTPRequest & FSUser,
  { info, objectPath }: Pointer,
): Promise<Uint8Array> {

  const _fs = unpackFs(fs);

  try {
    const cached = await _fs.readFile(objectPath);
    if (cached.byteLength === info.size) {
      return cached;
    }
  } catch (e) {
    // Silence file not found errors (implies cache miss)
    if ((e as any).code !== 'ENOENT') {
      throw e;
    }
  }

  const authHeaders: Record<string, string> = auth
    ? getAuthHeader(auth)
    : {};

  // Request LFS transfer

  const lfsInfoRequestData = {
    operation: 'download',
    transfers: ['basic'],
    objects: [info],
  };

  const { body: lfsInfoBody } = await request({
    url: `${url}/info/lfs/objects/batch`,
    method: 'POST',
    headers: {
      // Github LFS doesn’t seem to accept this UA, but works fine without any
      // 'User-Agent': `git/isomorphic-git@${git.version()}`,
      ...headers,
      ...authHeaders,
      'Accept': 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
    },
    body: [encoder.encode(JSON.stringify(lfsInfoRequestData))],
  });

  const lfsInfoResponseRaw = (await bodyToBuffer(lfsInfoBody)).toString();
  let lfsInfoResponseData: any;
  try {
    lfsInfoResponseData = JSON.parse(lfsInfoResponseRaw);
  } catch (e) {
    throw new Error(`Unexpected structure received from LFS server: unable to parse JSON ${lfsInfoResponseRaw}`);
  }

  if (isValidLFSInfoResponseData(lfsInfoResponseData)) {

    // Request the actual blob

    const downloadAction = lfsInfoResponseData.objects[0].actions.download;
    const lfsObjectDownloadURL = downloadAction.href;
    const lfsObjectDownloadHeaders = downloadAction.header ?? {};

    const dlHeaders = {
      ...headers,
      ...authHeaders,
      ...lfsObjectDownloadHeaders,
    };

    const { body: lfsObjectBody } = await request({
      url: lfsObjectDownloadURL,
      method: 'GET',
      headers: dlHeaders,
    });

    const blob = await bodyToBuffer(lfsObjectBody);

    // Write LFS cache for this object.
    const dirname = objectPath.substring(0, objectPath.lastIndexOf('/') + 1);
    await _fs.mkdir(dirname, { recursive: true });
    await _fs.writeFile(objectPath, blob);

    return blob;

  } else {
    throw new Error("Unexpected JSON structure received for LFS download request");
  }
}
