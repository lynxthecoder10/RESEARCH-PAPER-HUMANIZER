const fs = require('fs');

const isAffectedRuntime =
  process.platform === 'win32' && Number(process.versions.node.split('.')[0]) >= 25;

function normalizeReadlinkError(error, targetPath) {
  if (!isAffectedRuntime || error?.code !== 'EISDIR' || error?.syscall !== 'readlink') {
    return error;
  }

  const normalized = new Error(`EINVAL: invalid argument, readlink '${targetPath}'`);
  normalized.errno = -4071;
  normalized.code = 'EINVAL';
  normalized.syscall = 'readlink';
  normalized.path = targetPath;
  return normalized;
}

if (isAffectedRuntime && !fs.__node25ReadlinkCompat) {
  const originalReadlink = fs.readlink;
  const originalReadlinkSync = fs.readlinkSync;

  fs.readlink = function readlinkCompat(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }

    return originalReadlink.call(fs, path, options, (error, linkString) => {
      callback(normalizeReadlinkError(error, path), linkString);
    });
  };

  fs.readlinkSync = function readlinkSyncCompat(path, options) {
    try {
      return originalReadlinkSync.call(fs, path, options);
    } catch (error) {
      throw normalizeReadlinkError(error, path);
    }
  };

  if (fs.promises?.readlink) {
    const originalPromiseReadlink = fs.promises.readlink.bind(fs.promises);
    fs.promises.readlink = async function promiseReadlinkCompat(path, options) {
      try {
        return await originalPromiseReadlink(path, options);
      } catch (error) {
        throw normalizeReadlinkError(error, path);
      }
    };
  }

  Object.defineProperty(fs, '__node25ReadlinkCompat', {
    value: true,
    configurable: false,
  });
}
