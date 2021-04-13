const path = require("./path.js");
const { ENOENT, EEXIST, ENOTEMPTY, ENOTDIR } = require("./errors.js");

module.exports = class NativeFS {
  constructor(nativeDirectoryHandle) {
    this._root = nativeDirectoryHandle
    this._dirHandles = new Map()
    this._fileHandles = new Map()
  }

  async _lookupDir(dirpath) {
    if (dirpath === '/') return this._root
    if (this._dirHandles.has(dirpath)) return this._dirHandles.get(dirpath)

    let dir = this._root;
    const parts = path.split(dirpath)
    if (parts[0] === '/') parts.shift()
    if (parts[0] === '.') parts.shift()
    for (let part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part);
      } catch (e) {
        if (e.message === 'The path supplied exists, but was not an entry of requested type.') {
          throw new ENOTDIR(dirpath);
        }
        throw new ENOENT(dirpath);
      }
    }
    this._dirHandles.set(dirpath, dir)
    return dir;
  }

  async _lookupFile(filepath) {
    if (this._fileHandles.has(filepath)) return this._fileHandles.get(filepath)

    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir  = await this._lookupDir(dirname)
    try {
      const fh = await dir.getFileHandle(basename);
      this._fileHandles.set(filepath, fh);
      return fh;
    } catch (e) {
      throw new ENOENT(filepath)
    }
  }

  async _lookupUnknown(upath) {
    if (upath === '/') return ['dir', this._root]

    const dirname = path.dirname(upath)
    const basename = path.basename(upath)
    const parent = await this._lookupDir(dirname)
    try {
      const dh = await parent.getDirectoryHandle(basename)
      return ['dir', dh]
    } catch (e) {
      try {
        const fh = await parent.getFileHandle(basename)
        return ['file', fh]
      } catch (e) {
        throw new ENOENT(upath)
      }
    }
  }

  async mkdir(dirpath) {
    dirpath = path.normalize(dirpath)
    if (this._dirHandles.has(dirpath)) {
        throw new EEXIST(dirpath)
    };
    const dirname = path.dirname(dirpath)
    const basename = path.basename(dirpath)
    const dir = await this._lookupDir(dirname)
    try {
      let newDir = await dir.getDirectoryHandle(basename, { create: true });
      this._dirHandles.set(dirpath, newDir)
    } catch (e) {
        throw new ENOTDIR(dirpath)
    } 
  }

  async rmdir(dirpath, opts = {}) {
    let { recursive = true } = opts
    dirpath = path.normalize(dirpath)
    if (!this._dirHandles.has(dirpath)) {
      throw new ENOENT(dirpath)
    };
    const dirname = path.dirname(dirpath)
    const basename = path.basename(dirpath)
    const dir = await this._lookupDir(dirname)
    try {
      await dir.removeEntry(basename, { recursive })
      this._dirHandles.delete(dirpath)
      if (recursive) {
        for (let key of this._dirHandles.keys()) {
          if (key.startsWith(dirpath)) this._dirHandles.delete(key)
        }
        for (let key of this._fileHandles.keys()) {
          if (key.startsWith(dirpath)) this._fileHandles.delete(key)
        }
      }
    } catch (e) {
      if (!recursive) {
        throw new ENOTEMPTY(dirpath)
      } else {
        throw e
      }
    }
  }

  async readdir(dirpath) {
    dirpath = path.normalize(dirpath);
    const dir = await this._lookupDir(dirpath)
    let names = []
    for await (const entry of dir.values()) {
      names.push(entry.name)
    }
    return names
  }

  async writeFile(filepath, data, opts) {
    const { encoding } = opts
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile')
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    const fh = await dir.getFileHandle(basename, { create: true })
    const writer = await fh.createWritable();
    await writer.write(data);
    await writer.close();
    this._fileHandles.set(filepath, fh)
  }

  async readFile(filepath, opts) {
    const { encoding } = opts
    if (encoding && encoding !== 'utf8') throw new Error('Only "utf8" encoding is supported in readFile')
    const file = await this._lookupFile(filepath).getFile();
    if (encoding === 'utf8') {
      return file.text()
    } else {
      return file.arrayBuffer()
    }
  }

  async unlink(filepath) {
    filepath = path.normalize(filepath)
    if (!this._fileHandles.has(filepath)) {
      throw new ENOENT(filepath)
    }
    const dirname = path.dirname(filepath)
    const basename = path.basename(filepath)
    const dir = await this._lookupDir(dirname)
    try {
      await dir.removeEntry(basename)
      this._fileHandles.delete(filepath)
    } catch (e) {
      throw new ENOENT(filepath)
    }
  }

  async rename(oldFilepath, newFilepath) {
    let [type, h] = await this._lookupUnknown(oldFilepath);
    if (type === 'file') {
        let entry = this.readFile(oldFilepath);
        this.writeFile(newFilepath, entry)
        this.unlink(oldFilepath)
    } else {
        throw new Error('TODO: renaming Directories isnt implemented yet, because this is expensive operation. Waiting for native support in FSA API');
    }
  }

  async stat(filepath) {
    filepath = path.normalize(filepath);
    let [type, h] = await this._lookupUnknown(filepath)
    return {
      type,
      mode: 0o644, // make something up
      size: h.size,
      ino: 1,
      mtimeMs: h.lastModified || 0,
      ctimeMs: h.lastModified || 0,
      uid: 1,
      gid: 1,
      dev: 1,
    }
  }
  
  async lstat(...args) {
    return this.stat(...args)
  }

  async readlink() {
    throw new Error("NativeFS doesn't support symlinks.")
  }

  async symlink(...args) {
    throw new Error("NativeFS doesn't support symlinks.")
  }
};