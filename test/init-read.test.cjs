const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

async function setup() {
    const requests = [], jobs = new Map(), errors = [];
    let timerId = 0;
    const context = vm.createContext({
        console: { error: (...args) => errors.push(args), log() {} },
        document: { querySelectorAll: () => [] },
        localStorage: { getItem: () => null },
        HTMLCollection: class {}, NodeList: class {},
        setTimeout: (callback) => { jobs.set(++timerId, callback); return timerId; },
        clearTimeout: (id) => jobs.delete(id)
    });
    const stubs = {
        '@cocreate/observer': { default: { init() {} } },
        '@cocreate/actions': { default: { init() {} } },
        '@cocreate/socket-client': { default: { send() {} } },
        '@cocreate/crud-client': { default: { listen() {}, send: async (data) => { requests.push(data); } } },
        '@cocreate/filter': { default: { init: async (element) => { if (element.ready) await element.ready; } } },
        '@cocreate/utils': {
            getAttributes: (element) => ({ ...element.data }),
            getAttributeNames: () => [], queryElements: () => [],
            checkValue: (value) => !/{{.*}}/.test(value)
        },
        'setDataHandler.js': { setData() {}, setDataType() {} }
    };
    const modules = new Map();
    function load(name) {
        name = name.startsWith('./') ? name.slice(2) : name;
        if (modules.has(name)) return modules.get(name);
        const stub = stubs[name];
        const module = stub
            ? new vm.SyntheticModule(Object.keys(stub), function () {
                for (const [key, value] of Object.entries(stub)) this.setExport(key, value);
            }, { context })
            : new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'), { context, identifier: name });
        modules.set(name, module);
        return module;
    }
    const module = load('initHandler.js');
    await module.link(load);
    await module.evaluate();
    return {
        init: module.namespace.init, requests, errors,
        flush() { const batch = [...jobs.values()]; jobs.clear(); for (const job of batch) job(); }
    };
}
function element(id, attributes = {}) {
    return {
        tagName: 'DIV', data: { array: 'apis', object: id, key: 'name' },
        getAttribute: (key) => attributes[key] ?? null,
        hasAttribute: (key) => Object.hasOwn(attributes, key),
        addEventListener() {}
    };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('filtered counts for different clusters are read in separate batches', async () => {
    const f = await setup();
    const counts = ['cluster-a', 'cluster-b'].map(cluster => {
        const el = element('');
        el.data = { array: 'servers', object: '', key: '$length' };
        el.getFilter = async () => ({ query: { cluster_id: cluster }, index: 0 });
        return el;
    });
    await f.init(counts);
    f.flush();
    assert.equal(f.requests.length, 2);
    assert.deepEqual(f.requests.map(data => data.filter.query.cluster_id), ['cluster-a', 'cluster-b']);
});

test('a pending field does not block reads for ready elements in the same SSR page', async () => {
    const f = await setup();
    const slow = element('111111111111111111111111');
    const ready = element('222222222222222222222222', { rendered: 'true' });
    let release;
    slow.ready = new Promise(resolve => { release = resolve; });
    const pending = f.init([slow, ready]);
    await tick();
    f.flush();
    try {
        assert.equal(f.requests.length, 1);
        assert.equal(f.requests[0].object._id, ready.data.object);
    } finally {
        release();
        await pending;
    }
    f.flush();
    assert.equal(f.requests.length, 2);
});

test('one failed initialization does not prevent other reads and can be retried', async () => {
    const f = await setup();
    const broken = element('111111111111111111111111');
    const ready = element('222222222222222222222222');
    broken.ready = Promise.reject(new Error('value lookup failed'));
    await f.init([broken, ready]);
    f.flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.errors.length, 1);
    delete broken.ready;
    await f.init(broken);
    f.flush();
    assert.equal(f.requests.length, 2);
});

test('ready fields for the same document still share one debounced read', async () => {
    const f = await setup();
    await f.init([element('111111111111111111111111'), element('111111111111111111111111')]);
    f.flush();
    assert.equal(f.requests.length, 1);
});

test('read=false and already read elements remain excluded', async () => {
    const f = await setup();
    const read = element('222222222222222222222222');
    read.hasRead = true;
    await f.init([element('111111111111111111111111', { read: 'false' }), read]);
    f.flush();
    assert.equal(f.requests.length, 0);
});
