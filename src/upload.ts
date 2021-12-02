import { HTTPRequest } from './types';
import { buildPointerInfo, PointerInfo } from './pointers';
import { bodyToBuffer, getAuthHeader } from './util';


interface LFSInfoResponse {
  objects: {
    actions?: {
      upload: {
        href: string;
        header?: Record<string, string>;
      };
      verify?: {
        href: string;
        header?: Record<string, string>;
      };
    };
  }[];
}

function isValidLFSInfoResponseData(val: Record<string, any>): val is LFSInfoResponse {
  const obj = val.objects?.[0];
  return obj && (
    !obj.actions ||
    obj.actions.upload.href.trim !== undefined
  );
}


/**
 * Given a blob, uploads the blob to LFS server and returns a PointerInfo,
 * which the caller can then combine with object path into a Pointer
 * and commit in place of the original Git blob.
 */
export default async function uploadBlob(
  { http: { request }, headers = {}, url, auth }: HTTPRequest,
  content: Buffer,
): Promise<PointerInfo> {

  const info = await buildPointerInfo(content);

  const authHeaders: Record<string, string> = auth
    ? getAuthHeader(auth)
    : {};

  // Request LFS transfer

  const lfsInfoRequestData = {
    operation: 'upload',
    transfers: ['basic'],
    objects: [info],
  };

  const { body: lfsInfoBody } = await request({
    url: `${url}/info/lfs/objects/batch`,
    method: 'POST',
    headers: {
      // Github LFS doesn’t seem to accept this UA
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

    // Upload the actual blob

    const actions = lfsInfoResponseData.objects[0].actions;

    if (!actions) {
      // Presume LFS already has the blob. Don’t fail loudly.
      return info;
    } else {

      const uploadAction = actions.upload;
      const lfsObjectUploadURL = uploadAction.href;
      const lfsObjectUploadHeaders = uploadAction.header ?? {};

      const dlHeaders = {
        ...headers,
        ...authHeaders,
        ...lfsObjectUploadHeaders,
      };

      const resp = await request({
        url: lfsObjectUploadURL,
        method: 'PUT',
        headers: dlHeaders,
        body: [content],
      });

      if (resp.statusCode === 200) {
        const verifyAction = actions.verify;

        // Upload verification was requested. Do that

        if (verifyAction) {
          const verificationResp = await request({
            url: verifyAction.href,
            method: 'POST',
            headers: {
              // Isomorphic Git’s UA header is considered invalid
              // and missing UA header causes an error in this case;
              // cURL is considered valid, so…
              'User-Agent': `curl/7.54`,
              // TODO: Generalize UA header handling
              // - Leave UA header twiddling to callers?
              // - Figure out which LFS implementation wants which UA header?
              ...(verifyAction.header ?? {}),
            },
            body: [info],
          });

          if (verificationResp.statusCode === 200) {
            return info;
          } else {
            throw new Error(`Upload might have been unsuccessful, verification action yielded HTTP ${verificationResp.statusCode}`);
          }
        } else {
          return info;
        }
      } else {
        throw new Error(`Upload might have been unsuccessful, upload action yielded HTTP ${resp.statusCode}`);
      }
    }

  } else {
    throw new Error("Unexpected JSON structure received for LFS upload request");
  }
}
