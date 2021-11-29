import path from 'path';
import fsp from 'fs/promises';
import { HttpClient } from 'isomorphic-git/http/node';

import { bodyToBuffer, isWriteable } from './util';
import { Pointer } from './pointers';


interface DownloadBlobRequset {
  http: HttpClient;
  headers?: Record<string, any>;

  /** Repository URL. */
  url: string;
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
 */
export default async function downloadBlobFromPointer(
  { http: { request }, headers = {}, url }: DownloadBlobRequset,
  { info, objectPath }: Pointer,
): Promise<Buffer> {

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
      'Accept': 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
    },
    body: [Buffer.from(JSON.stringify(lfsInfoRequestData))],
  });

  const lfsInfoResponseData = JSON.parse((await bodyToBuffer(lfsInfoBody)).toString());

  if (isValidLFSInfoResponseData(lfsInfoResponseData)) {

    // Request the actual blob

    const downloadAction = lfsInfoResponseData.objects[0].actions.download;
    const lfsObjectDownloadURL = downloadAction.href;
    const lfsObjectDownloadHeaders = downloadAction.header ?? {};

    const dlHeaders = { ...headers, ...lfsObjectDownloadHeaders };

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
