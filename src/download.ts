import path from 'path';
import fsp from 'fs/promises';
import { HttpClient } from 'isomorphic-git/http/node';

import { bodyToBuffer, isWriteable } from './util';
import { Pointer } from './pointers';


interface DownloadBlobRequest {
  http: HttpClient;
  headers?: Record<string, any>;

  /** Repository URL. */
  url: string;

  /** Auth data for basic HTTP auth. */
  auth?: { username: string, password: string }
}

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
 * Currently, the authorization header is responsibility of the caller.
 */
export default async function downloadBlobFromPointer(
  { http: { request }, headers = {}, url, auth }: DownloadBlobRequest,
  { info, objectPath }: Pointer,
): Promise<Buffer> {

  const authHeaders: Record<string, string> = auth
    ? {
        'Authorization':
          `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
      }
    : {};

  // Request LFS metadata

  const lfsInfoRequestData = {
    operation: 'download',
    transfers: ['basic'],
    objects: [info],
  };

  const { body: lfsInfoBody } = await request({
    url: `${url}/info/lfs/objects/batch`,
    method: 'POST',
    headers: {
      // Github LFS doesn’t seem to accept this UA :(
      // 'User-Agent': `git/isomorphic-git@${git.version()}`,
      ...headers,
      ...authHeaders,
      'Accept': 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
    },
    body: [Buffer.from(JSON.stringify(lfsInfoRequestData))],
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

    // Write LFS cache for this object, if cache path is still accessible and unoccupied.
    if (await isWriteable(objectPath)) {
      await fsp.mkdir(path.dirname(objectPath), { recursive: true });
      await fsp.writeFile(objectPath, blob);
    }

    return blob;

  } else {
    throw new Error("LFS response didn’t return an expected structure");
  }
}
