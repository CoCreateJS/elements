const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

async function loadSetDataType(watchedElements = []) {
    const context = vm.createContext({
        console,
        HTMLCollection: class {},
        CustomEvent: class {
            constructor(name, options) {
                this.name = name;
                this.detail = options?.detail;
            }
        }
    });
    const source = fs.readFileSync(
        path.join(__dirname, "../src/setDataHandler.js"),
        "utf8"
    );
    const module = new vm.SourceTextModule(source, { context });
    const modules = {
        "@cocreate/utils": {
            dotNotationToObject: value => value,
            queryData: () => true,
            searchData: () => true,
            sortData: value => value,
            getAttributes: element => ({ key: element.getAttribute('key') }),
            checkValue: () => true,
            getValueFromObject: () => undefined
        },
        "@cocreate/crud-client": { default: { getValueFromObject: (object, key) => object[key] } },
        "@cocreate/filter": { default: { filters: new Map() } },
        "./mapRegistry.js": {
            elements: new WeakMap(),
            forms: new WeakMap(),
            keys: new Map()
        },
        "./getDataHandler.js": {
            getDataElements: () => watchedElements,
            getDataObject: () => undefined
        }
    };

    await module.link(name => new vm.SyntheticModule(
        Object.keys(modules[name]),
        function () {
            for (const [key, value] of Object.entries(modules[name])) {
                this.setExport(key, value);
            }
        },
        { context }
    ));
    await module.evaluate();
    return module.namespace.setDataType;
}

test("setDataType tolerates a form that has not entered the registry yet", async () => {
    const setDataType = await loadSetDataType();
    const attributes = { array: "apis", object: "pending" };
    const form = {
        tagName: "FORM",
        querySelectorAll: () => [],
        getAttribute: name => attributes[name] ?? null,
        hasAttribute: name => Object.hasOwn(attributes, name),
        setAttribute: (name, value) => {
            attributes[name] = value;
        }
    };

    await assert.doesNotReject(() => setDataType(form, {
        type: "object",
        object: [{
            _id: "6abb2ce702c3c7e6fbec0215",
            $array: "apis"
        }]
    }, { element: { dispatchEvent() {} } }));
    assert.equal(attributes.object, "6abb2ce702c3c7e6fbec0215");
});

test('saved is dispatched only after response fields following async work are updated', async () => {
    let release;
    let idValue = '';
    const gate = new Promise(resolve => { release = resolve; });
    const watcher = attributes => ({
        hasAttribute: name => Object.hasOwn(attributes, name),
        getAttribute: name => attributes[name] ?? null,
        querySelector: () => null,
        dispatchEvent() {}
    });
    const renderer = watcher({ 'render-query': 'template' });
    renderer.renderValue = async () => {};
    renderer.getData = () => gate;
    const idField = watcher({ key: '_id' });
    idField.setValue = value => { idValue = value; };
    const setDataType = await loadSetDataType([renderer, idField]);
    const attributes = { array: 'clusters', object: 'pending' };
    const form = {
        tagName: 'FORM',
        querySelectorAll: () => [],
        hasAttribute: name => Object.hasOwn(attributes, name),
        getAttribute: name => attributes[name] ?? null,
        setAttribute: (name, value) => { attributes[name] = value; }
    };
    const id = '65f8cb447b39a3c1a8904e22';
    const savedIds = [];
    const completion = setDataType(form, {
        type: 'object', method: 'object.create', array: 'clusters',
        object: [{ _id: id, $array: 'clusters' }]
    }, { element: { dispatchEvent: () => savedIds.push(idValue) } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(idValue, '');
    assert.deepEqual(savedIds, []);
    release();
    await completion;
    assert.equal(idValue, id);
    assert.deepEqual(savedIds, [id]);
});
