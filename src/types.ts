import type { HttpClient } from 'isomorphic-git';
import type { AnyFsClient } from './fsUtils';



export interface BasicAuth {
  username: string;
  password: string;
}


// TODO: Restructure HTTPRequest to reuse Isomorphic Git’s GitHttpRequest?

export interface HTTPRequest {
  http: HttpClient;
  headers?: Record<string, any>;

  /** Repository URL. */
  url: string;

  /** Auth data for basic HTTP auth. */
  auth?: BasicAuth;
}


export interface FSUser {
  fs: AnyFsClient;
}


export { type AnyFsClient };
