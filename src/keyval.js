class Store {
    constructor(dbName = 'keyval-store', storeName = 'keyval') {
        this.storeName = storeName;
        this._dbName = dbName;
        this._storeName = storeName;
        this._init();
    }
    _init() {
        if (this._dbp) {
            return;
        }
        this._dbp = new Promise((resolve, reject) => {
            const openreq = indexedDB.open(this._dbName);
            openreq.onerror = () => reject(openreq.error);
            openreq.onsuccess = () => resolve(openreq.result);
            openreq.onupgradeneeded = () => {
                openreq.result.createObjectStore(this._storeName);
            };
        });
    }
    _withIDBStore(type, callback) {
        this._init();
        return this._dbp.then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, type);
            transaction.oncomplete = () => resolve();
            transaction.onabort = transaction.onerror = () => reject(transaction.error);
            callback(transaction.objectStore(this.storeName));
        }));
    }
    _close() {
        this._init();
        return this._dbp.then(db => {
            db.close();
            this._dbp = undefined;
        });
    }
}
let store;
function getDefaultStore() {
    if (!store)
        store = new Store();
    return store;
}
function get(key, store = getDefaultStore()) {
    let req;
    return store._withIDBStore('readwrite', store => {
        req = store.get(key);
    }).then(() => req.result);
}
function set(key, value, store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.put(value, key);
    });
}
function update(key, updater, store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        const req = store.get(key);
        req.onsuccess = () => {
            store.put(updater(req.result), key);
        };
    });
}
function del(key, store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.delete(key);
    });
}
function clear(store = getDefaultStore()) {
    return store._withIDBStore('readwrite', store => {
        store.clear();
    });
}
function keys(store = getDefaultStore()) {
    const keys = [];
    return store._withIDBStore('readwrite', store => {
        (store.openKeyCursor || store.openCursor).call(store).onsuccess = function () {
            if (!this.result)
                return;
            keys.push(this.result.key);
            this.result.continue();
        };
    }).then(() => keys);
}
function close(store = getDefaultStore()) {
    return store._close();
}

module.exports = {
    Store,
    get,
    set,
    update,
    del,
    clear,
    keys,
    close
}