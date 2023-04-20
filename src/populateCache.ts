import type { CallbackFsClient, PromiseFsClient } from 'isomorphic-git';

import git from 'isomorphic-git';
import http, { type GitProgressEvent } from 'isomorphic-git/http/node';

import { pointsToLFS, stripTrailingSlash } from './util';
import downloadBlobFromPointer from './download';
import { readPointer } from "./pointers";


const SYMLINK_MODE = 40960;


type ProgressHandler = (progress: GitProgressEvent) => void


/**
 * Populates LFS cache for each repository object that is an LFS pointer.
 *
 * Does not touch working directory.
 *
 * NOTE: If LFS cache path, as extracted from the pointer,
 * is not writeable at the time of download start,
 * the object will be silently skipped.
 * 
 * NOTE: This function skips objects silently in case of errors.
 * 
 * NOTE: onProgress currently doesn’t report loaded/total values accurately.
 */
export default async function populateCache(
  fs: CallbackFsClient | PromiseFsClient,
  workDir: string,
  remoteURL: string,
  ref: string = 'HEAD',
  onProgress?: ProgressHandler,
) {
  await git.walk({
    fs,
    dir: workDir,
    trees: [git.TREE({ ref })],
    map: async function lfsDownloadingWalker(filepath, entries) {

      if (entries === null || entries[0] === null) {
        return null;
      }

      onProgress?.({
        phase: `skimming: ${filepath}`,
        loaded: 5,
        total: 10,
      });

      const [entry] = entries;
      const entryType = await entry.type();

      if (entryType === 'tree') {
        // Walk children
        return true;

      } else if (entryType === 'blob' && (await entry.mode()) !== SYMLINK_MODE) {
        const content = await entry.content();

        if (content) {
          if (pointsToLFS(content)) {
            const pointer = readPointer({
              gitdir: `${stripTrailingSlash(workDir)}/.git`,
              content,
            });

            onProgress?.({
              phase: `downloading: ${filepath}`,
              loaded: 5,
              total: 10,
            });

            await downloadBlobFromPointer({ fs, http, url: remoteURL }, pointer);
          }
        }
      }
      return;
    }
  });
}
