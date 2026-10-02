const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

async function loadSetDataType() {
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
            getAttributes: () => ({}),
            checkValue: () => true,
            getValueFromObject: () => undefined
        },
        "@cocreate/crud-client": { default: {} },
        "@cocreate/filter": { default: { filters: new Map() } },
        "./mapRegistry.js": {
            elements: new WeakMap(),
            forms: new WeakMap(),
            keys: new Map()
        },
        "./getDataHandler.js": {
            getDataElements: () => [],
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

    assert.doesNotThrow(() => setDataType(form, {
        type: "object",
        object: [{
            _id: "6abb2ce702c3c7e6fbec0215",
            $array: "apis"
        }]
    }, { element: { dispatchEvent() {} } }));
    assert.equal(attributes.object, "6abb2ce702c3c7e6fbec0215");
});
