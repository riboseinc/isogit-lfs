import fs from 'fs';

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

import { isVacantAndWriteable, pointsToLFS } from './util';
import downloadBlobFromPointer from './download';
import { readPointer } from "./pointers";


const SYMLINK_MODE = 40960;


/**
 * Populates LFS cache for each repository object that is an LFS pointer.
 *
 * Does not touch working directory.
 *
 * NOTE: If LFS cache path, as extracted from the pointer,
 * is not writeable at the time of download start,
 * the object will be silently skipped;
 * if LFS cache path is not writeable at the time download completes,
 * an error will be thrown.
 */
export default async function populateCache(workDir: string, ref: string = 'HEAD') {
  const remoteURL = await git.getConfig({
    fs,
    dir: workDir,
    path: 'remote.origin.url',
  });
  if (remoteURL) {
    await git.walk({
      fs,
      dir: workDir,
      trees: [git.TREE({ ref })],
      map: async function lfsDownloadingWalker(filepath, entries) {
        if (entries === null || entries[0] === null) {
          return null;
        }

        const [entry] = entries;
        const entryType = await entry.type();

        if (entryType === 'tree') {
          // Walk children
          return true;

        } else if (entryType === 'blob' && (await entry.mode()) !== SYMLINK_MODE) {
          const content = await entry.content();

          if (content) {
            const buff = Buffer.from(content.buffer);

            if (pointsToLFS(buff)) {
              const pointer = readPointer({ dir: workDir, content: buff });

              // Don’t even start the download if LFS cache path is not accessible,
              // or if it already exists
              if (await isVacantAndWriteable(pointer.objectPath) === false)
                return;


              await downloadBlobFromPointer({ http, url: remoteURL }, pointer);

            }
          }
        }
        return;
      }
    });
  }
}
