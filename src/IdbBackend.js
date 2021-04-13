const { Store, get, set, del, clear, close} = require("./keyval.js");

module.exports = class IdbBackend {
  constructor(dbname, storename) {
    this._database = dbname;
    this._storename = storename;
    this._store = new Store(this._database, this._storename);
  }
  saveSuperblock(superblock) {
    return set("!root", superblock, this._store);
  }
  loadSuperblock() {
    return get("!root", this._store);
  }
  readFile(inode) {
    return get(inode, this._store)
  }
  writeFile(inode, data) {
    return set(inode, data, this._store)
  }
  unlink(inode) {
    return del(inode, this._store)
  }
  wipe() {
    return clear(this._store)
  }
  close() {
    return close(this._store)
  }
}
