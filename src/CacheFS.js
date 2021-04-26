const path = require("./path.js");
const { EEXIST, ENOENT, ENOTDIR, ENOTEMPTY } = require("./errors.js");

const STAT = 0;

module.exports = class CacheFS {
  constructor() {}
  _makeRoot(root = new Map()) {
    root.set(STAT, { mode: 0o777, type: "dir", size: 0, ino: 0, mtimeMs: Date.now() });
    return root;
  }

  activate(superblock = null) {
    if (superblock === null) {
      this._root = new Map([["/", this._makeRoot()]]);
    } else if (typeof superblock === "string") {
      this._root = new Map([["/", this._makeRoot(this.parse(superblock))]]);
    } else {
      this._root = superblock;
    }
  }

  get activated() {
    return !!this._root;
  }

  deactivate() {
    this._root = void 0;
  }

  size() {
    return this._countInodes(this._root.get("/")) - 1;
  }

  _countInodes(map) {
    let count = 1;
    for (const [key, val] of map) {
      if (key === STAT) continue;
      count += this._countInodes(val);
    }
    return count;
  }

  autoinc() {
    const val = this._maxInode(this._root.get("/")) + 1;
    return val;
  }

  _maxInode(map) {
    let max = map.get(STAT).ino;
    for (const [key, val] of map) {
      if (key === STAT) continue;
      max = Math.max(max, this._maxInode(val));
    }
    return max;
  }

  print(root = this._root.get("/")) {
    let str = "";
    const printTree = (root, indent) => {
      for (const [file, node] of root) {
        if (file === 0) continue;
        const stat = node.get(STAT);
        const mode = stat.mode.toString(8);
        str += `${"\t".repeat(indent)}${file}\t${mode}`;
        if (stat.type === "file") {
          str += `\t${stat.size}\t${stat.mtimeMs}\n`;
        } else {
          str += "\n";
          printTree(node, indent + 1);
        }
      }
    };
    printTree(root, 0);
    return str;
  }

  parse(print) {
    let autoinc = 0;

    function mk(stat) {
      const ino = ++autoinc;
      // TODO: Use a better heuristic for determining whether file or dir
      const type = stat.length === 1 ? "dir" : "file";
      let [mode, size, mtimeMs] = stat;
      mode = parseInt(mode, 8);
      size = size ? parseInt(size) : 0;
      mtimeMs = mtimeMs ? parseInt(mtimeMs) : Date.now();
      return new Map([[STAT, { mode, type, size, mtimeMs, ino }]]);
    }

    const lines = print.trim().split("\n");
    const _root = this._makeRoot();
    const stack = [
      { indent: -1, node: _root },
      { indent: 0, node: null },
    ];
    for (let line of lines) {
      const prefix = line.match(/^\t*/)[0];
      const indent = prefix.length;
      line = line.slice(indent);
      const [filename, ...stat] = line.split("\t");
      const node = mk(stat);
      if (indent <= stack[stack.length - 1].indent) {
        while (indent <= stack[stack.length - 1].indent) {
          stack.pop();
        }
      }
      stack.push({ indent, node });
      const cd = stack[stack.length - 2].node;
      cd.set(filename, node);
    }
    return _root;
  }

  _lookup(filepath, follow = true) {
    let dir = this._root;
    let partialPath = "/";
    const parts = path.split(filepath);
    for (let i = 0; i < parts.length; ++i) {
      const part = parts[i];
      dir = dir.get(part);
      if (!dir) throw new ENOENT(filepath);
      if (follow || i < parts.length - 1) {
        const stat = dir.get(STAT);
        if (stat.type === "symlink") {
          const target = path.resolve(partialPath, stat.target);
          dir = this._lookup(target);
        }
        if (!partialPath) {
          partialPath = part;
        } else {
          partialPath = path.join(partialPath, part);
        }
      }
    }
    return dir;
  }

  mkdir(filepath, { mode }) {
    if (filepath === "/") throw new EEXIST();
    const dir = this._lookup(path.dirname(filepath));
    const basename = path.basename(filepath);
    if (dir.has(basename)) {
      throw new EEXIST();
    }
    const entry = new Map();
    const stat = {
      mode,
      type: "dir",
      size: 0,
      mtimeMs: Date.now(),
      ino: this.autoinc(),
    };
    entry.set(STAT, stat);
    dir.set(basename, entry);
  }

  rmdir(filepath) {
    const dir = this._lookup(filepath);
    if (dir.get(STAT).type !== "dir") throw new ENOTDIR();
    if (dir.size > 1) throw new ENOTEMPTY();
    const parent = this._lookup(path.dirname(filepath));
    const basename = path.basename(filepath);
    parent.delete(basename);
  }

  readdir(filepath) {
    const dir = this._lookup(filepath);
    if (dir.get(STAT).type !== "dir") throw new ENOTDIR();
    return [...dir.keys()].filter((key) => typeof key === "string");
  }

  writeStat(filepath, size, { mode }) {
    let ino;
    try {
      const oldStat = this.stat(filepath);
      if (mode == null) {
        mode = oldStat.mode;
      }
      ino = oldStat.ino;
    } catch (err) {}
    if (mode == null) {
      mode = 0o666;
    }
    if (ino == null) {
      ino = this.autoinc();
    }
    const dir = this._lookup(path.dirname(filepath));
    const basename = path.basename(filepath);
    const stat = {
      mode,
      type: "file",
      size,
      mtimeMs: Date.now(),
      ino,
    };
    const entry = new Map();
    entry.set(STAT, stat);
    dir.set(basename, entry);
    return stat;
  }

  unlink(filepath) {
    const parent = this._lookup(path.dirname(filepath));
    const basename = path.basename(filepath);
    parent.delete(basename);
  }

  rename(oldFilepath, newFilepath) {
    const basename = path.basename(newFilepath);
    const entry = this._lookup(oldFilepath);
    const destDir = this._lookup(path.dirname(newFilepath));
    destDir.set(basename, entry);
    this.unlink(oldFilepath);
  }

  stat(filepath) {
    return this._lookup(filepath).get(STAT);
  }

  lstat(filepath) {
    return this._lookup(filepath, false).get(STAT);
  }

  readlink(filepath) {
    return this._lookup(filepath, false).get(STAT).target;
  }

  symlink(target, filepath) {
    let ino, mode;
    try {
      const oldStat = this.stat(filepath);
      if (mode === null) {
        mode = oldStat.mode;
      }
      ino = oldStat.ino;
    } catch (err) {}
    if (mode == null) {
      mode = 0o120000;
    }
    if (ino == null) {
      ino = this.autoinc();
    }
    const dir = this._lookup(path.dirname(filepath));
    const basename = path.basename(filepath);
    const stat = {
      mode,
      type: "symlink",
      target,
      size: 0,
      mtimeMs: Date.now(),
      ino,
    };
    const entry = new Map();
    entry.set(STAT, stat);
    dir.set(basename, entry);
    return stat;
  }

  _du(dir) {
    let size = 0;
    for (const [name, entry] of dir.entries()) {
      if (name === STAT) {
        size += entry.size;
      } else {
        size += this._du(entry);
      }
    }
    return size;
  }

  du(filepath) {
    const dir = this._lookup(filepath);
    return this._du(dir);
  }
};
