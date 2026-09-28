const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

async function setup() {
    const context = vm.createContext({
        localStorage: { getItem: () => null }
    });
    const registries = {
        elements: new Map(),
        forms: new Map(),
        keys: new Map(),
        elementSubscriptions: new Map(),
        subscriptions: new Map()
    };
    const stubs = {
        '@cocreate/utils': {
            getAttributes: element => ({ ...element.data }),
            checkValue: () => true
        },
        'mapRegistry.js': registries,
        'subscribeHandler.js': { getSubscription: () => null },
        'crudHandler.js': { read() {}, save() {} }
    };
    const modules = new Map();

    function load(name) {
        name = name.startsWith('./') ? name.slice(2) : name;
        if (modules.has(name)) return modules.get(name);

        const stub = stubs[name];
        const module = stub
            ? new vm.SyntheticModule(Object.keys(stub), function () {
                for (const [key, value] of Object.entries(stub)) {
                    this.setExport(key, value);
                }
            }, { context })
            : new vm.SourceTextModule(
                fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'),
                { context, identifier: name }
            );
        modules.set(name, module);
        return module;
    }

    const module = load('getDataHandler.js');
    await module.link(load);
    await module.evaluate();
    return module.namespace;
}

function field(form, key, value) {
    return {
        data: { array: 'organizations', object: '', key },
        form,
        attributes: [],
        closest: () => form,
        getAttribute: name => name === 'key' ? key : null,
        hasAttribute: name => name === 'key',
        getValue: async () => value,
        matches: selector => selector !== '[render-query]' && selector !== 'input[type="file"]'
    };
}

test('getData preserves each field key when controls share an object scope', async () => {
    const { getData, getDataObject, initDataKey } = await setup();
    const form = { elements: [] };
    const fields = [
        field(form, 'name', 'Acme'),
        field(form, '_id', 'org-1'),
        field(form, 'key', 'secret')
    ];
    form.elements = fields;
    for (const element of fields) initDataKey(element, getDataObject(element));

    const [payload] = await getData(form);
    assert.deepEqual(
        JSON.parse(JSON.stringify(payload.object)),
        { name: 'Acme', _id: 'org-1', key: 'secret' }
    );
});

test('getData does not apply a whole-object key to neighboring fields', async () => {
    const { getData, getDataObject, initDataKey } = await setup();
    const form = { elements: [] };
    const fields = [
        field(form, '{}', { name: 'Acme' }),
        field(form, '_id', 'org-1')
    ];
    form.elements = fields;
    for (const element of fields) initDataKey(element, getDataObject(element));

    const [payload] = await getData(form);
    assert.deepEqual(
        JSON.parse(JSON.stringify(payload.object)),
        { name: 'Acme', _id: 'org-1' }
    );
});
