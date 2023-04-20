import type { CallbackFsClient, PromiseFsClient } from 'isomorphic-git';


export type AnyFsClient = CallbackFsClient | PromiseFsClient;
export type { CallbackFsClient, PromiseFsClient };


function isPromisesFs(fs: AnyFsClient): fs is PromiseFsClient {
  return (fs as PromiseFsClient).promises !== undefined;
}


export function unpackFs(fs: AnyFsClient): CallbackFsClient | PromiseFsClient["promises"] {
  return isPromisesFs(fs) ? fs.promises : fs;
}
