const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

async function loadSetData() {
    const context = vm.createContext({ console, HTMLCollection: class {}, CustomEvent: class {} });
    const source = fs.readFileSync(path.join(__dirname, '../src/setDataHandler.js'), 'utf8');
    const module = new vm.SourceTextModule(source, { context });
    const utils = {
        dotNotationToObject: value => value, queryData: () => true,
        searchData: () => true, sortData: value => value,
        getAttributes: element => ({ key: element.getAttribute('key') }),
        checkValue: () => true,
        getValueFromObject: (object, key) => object[key]
    };
    const modules = {
        '@cocreate/utils': utils,
        '@cocreate/crud-client': { default: {} },
        '@cocreate/filter': { default: { filters: new Map() } },
        './mapRegistry.js': { elements: new WeakMap(), forms: new WeakMap(), keys: new Map() },
        './getDataHandler.js': { getDataElements: () => [], getDataObject: element => ({ object: element.getAttribute('object') }) }
    };
    await module.link(name => new vm.SyntheticModule(Object.keys(modules[name]), function () {
        for (const [key, value] of Object.entries(modules[name])) this.setExport(key, value);
    }, { context }));
    await module.evaluate();
    return module.namespace.setData;
}

function element(attributes) {
    return {
        hasAttribute: name => Object.hasOwn(attributes, name),
        getAttribute: name => attributes[name] ?? null,
        removeAttribute: name => delete attributes[name],
        querySelector: () => null,
        dispatchEvent() {},
        values: [],
        setValue(value) { this.values.push(value); }
    };
}

test('SSR app labels do not prevent later table columns from receiving shared data', async () => {
    const setData = await loadSetData();
    const id = '28b6ddbe8b35de252ecd79e1';
    const label = element({ array: 'apps', object: id, key: 'name', rendered: 'true' });
    const table = element({ array: 'apps', object: id, key: 'fields', 'render-query': "[template='column'][]" });
    const renders = [];
    table.renderValue = async data => renders.push(data);
    const fields = [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }];
    await setData([label, table], {
        method: 'object.read', array: 'apps',
        object: [{ _id: id, $storage: ['mongodb'], name: 'Cluster', fields }]
    });
    assert.equal(label.hasAttribute('rendered'), false);
    assert.deepEqual(label.values, []);
    assert.equal(renders.length, 1);
    assert.deepEqual(Array.from(renders[0].fields), fields);
});

test('filtered counts retain their value during writes and refresh each cluster independently', async () => {
    const setData = await loadSetData();
    const counts = ['cluster-a', 'cluster-b'].map(cluster => {
        const el = element({ array: 'servers', object: '', key: '$length' });
        el.getFilter = async () => ({ query: { cluster_id: cluster }, index: 0 });
        el.refreshes = [];
        el.setFilter = filter => el.refreshes.push(filter);
        return el;
    });
    for (const el of counts) {
        await setData(el, { method: 'object.read', array: 'servers', object: [{ _id: 'server' }] });
    }
    for (const method of ['object.create', 'object.update', 'object.delete']) {
        await setData(counts, { method, array: 'servers', object: [{ _id: 'server', $update: { cluster_id: 'cluster-b' } }] });
    }
    for (let i = 0; i < counts.length; i++) {
        assert.deepEqual(counts[i].values, [1]);
        assert.equal(counts[i].refreshes.length, 3);
        assert.equal(counts[i].refreshes[0].query.cluster_id, ['cluster-a', 'cluster-b'][i]);
    }
    await setData(counts[0], { method: 'object.read', array: 'servers', object: [], error: [{ message: 'failed' }] });
    assert.deepEqual(counts[0].values, [1]);
    await setData(counts[0], { method: 'object.read', array: 'servers', object: [] });
    assert.deepEqual(counts[0].values, [1, 0]);
});

test('unmatched document updates do not write the empty object attribute into a value', async () => {
    const setData = await loadSetData();
    const el = element({ array: 'servers', object: '', key: '$length' });
    el.getFilter = async () => ({});
    await setData(el, { method: 'object.update', array: 'servers', object: [{ _id: 'other' }] });
    assert.deepEqual(el.values, []);
});
