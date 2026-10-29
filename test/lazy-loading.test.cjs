const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element(tagName, attributes = {}) {
    return {
        tagName: tagName.toUpperCase(), attributes,
        getAttribute: name => attributes[name] ?? null,
        matches(selector) {
            return selector.split(',').some(part => {
                const value = part.trim();
                return value.startsWith('[')
                    ? Object.hasOwn(attributes, value.slice(1, -1))
                    : value.toUpperCase() === this.tagName;
            });
        }
    };
}

async function setup(nodes = [], failures = new Set()) {
    const imports = [], observers = [], calls = [], errors = [];
    const context = vm.createContext({
        console: { error: (...args) => errors.push(args) },
        localStorage: { getItem: () => 'production' },
        document: {
            addEventListener() {},
            querySelector: selector => nodes.find(node => node.matches(selector)),
            querySelectorAll: selector => nodes.filter(node => node.matches(selector))
        }
    });
    const stubs = {
        '@cocreate/observer': { default: { init: configs => observers.push(...configs) } },
        '@cocreate/utils': {
            getAttributes: node => ({ ...node.attributes }),
            checkValue: () => true
        }
    };
    const modules = new Map();
    function synthetic(exports) {
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    }
    async function dynamicImport(name) {
        imports.push(name);
        if (failures.delete(name)) throw new Error('Temporary chunk failure');
        const methods = ['init', 'read', 'save', 'getData', 'setDataType', 'reset'];
        const module = synthetic(Object.fromEntries(methods.map(method => [method, (...args) => {
            calls.push({ name, method, args });
            return args[0];
        }])));
        await module.link(() => {});
        await module.evaluate();
        return module;
    }
    function load(name) {
        name = name.replace(/^\.\//, '');
        if (modules.has(name)) return modules.get(name);
        const module = stubs[name] ? synthetic(stubs[name]) : new vm.SourceTextModule(
            fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'),
            { context, identifier: name, importModuleDynamically: dynamicImport }
        );
        modules.set(name, module);
        return module;
    }
    const entry = load('index.js');
    await entry.link(load);
    await entry.evaluate();
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    return {
        api: entry.namespace.default, imports, calls, errors, flush,
        mutate(node, type, attributeName) {
            for (const observer of observers) {
                if (!observer.types.includes(type) || !node.matches(observer.selector)) continue;
                if (type === 'attributes' && !observer.attributeFilter.includes(attributeName)) continue;
                observer.callback({ target: node, attributeName });
            }
        }
    };
}

test('an empty document loads no feature runtime and retains synchronous metadata APIs', async () => {
    const f = await setup();
    assert.deepEqual(f.imports, []);
    const data = f.api.getDataObject(element('input', { array: 'files', key: 'name' }));
    assert.equal(data.type, 'object');
    assert.equal(data.database, 'production');
    assert.equal(data.then, undefined);
    f.api.keys.set('example', 1);
    assert.equal(f.api.keys.get('example'), 1);
    assert.deepEqual(f.imports, []);
});

for (const [tag, attrs, expected] of [
    ['div', { src: '/partial.html' }, './srcHandler.js'],
    ['div', { source: '/partial.html' }, './srcHandler.js'],
    ['div', { stream: '/stream' }, './srcHandler.js'],
    ['form', {}, './formHandler.js'],
    ['fieldset', {}, './formHandler.js'],
    ['a', { href: '/next' }, './hrefHandler.js'],
    ['a', { target: '_window' }, './hrefHandler.js'],
    ['div', { array: 'files' }, './dataHandler.js'],
    ['div', { 'render-json': 'true' }, './dataHandler.js'],
    ['iframe', {}, './iframeHandler.js'],
    ['input', { 'value-query': '.source' }, './valueQuery.js'],
    ['div', { 'socket-on': 'object.read' }, './socketHandler.js'],
    ['button', { actions: 'send' }, './socketHandler.js'],
    ['button', { actions: 'save' }, './dataHandler.js'],
    ['button', { actions: 'delete' }, './dataHandler.js'],
    ['button', { actions: 'reset' }, './formHandler.js'],
    ['button', { actions: 'disableHref' }, './hrefHandler.js'],
    ['button', { actions: 'enableHref' }, './hrefHandler.js']
]) {
    test(`initial ${tag} ${JSON.stringify(attrs)} loads only ${expected}`, async () => {
        const f = await setup([element(tag, attrs)]);
        assert.deepEqual(f.imports, [expected]);
        assert.deepEqual(f.errors, []);
    });
}

test('unrelated actions load no Elements runtime', async () => {
    const f = await setup([element('button', { actions: 'validate, upload' })]);
    assert.deepEqual(f.imports, []);
});

test('added elements and attribute changes load each feature once', async () => {
    const f = await setup();
    const source = element('div', { src: '/partial.html' });
    const data = element('div', { array: 'files' });
    f.mutate(source, 'addedNodes');
    f.mutate(source, 'attributes', 'src');
    f.mutate(data, 'attributes', 'array');
    f.mutate(data, 'addedNodes');
    await f.flush();
    assert.deepEqual(f.imports, ['./srcHandler.js', './dataHandler.js']);
});

test('programmatic APIs await and share the data runtime', async () => {
    const f = await setup();
    const node = element('input');
    for (const name of ['init', 'read', 'save', 'getData', 'setDataType']) {
        assert.equal(await f.api[name](node), node);
    }
    assert.deepEqual(f.imports, ['./dataHandler.js']);
    assert.deepEqual(f.calls.map(call => call.method), ['init', 'read', 'save', 'getData', 'setDataType']);
});

test('adding href to an existing element loads its handler once', async () => {
    const f = await setup();
    const link = element('a', { href: '/next' });
    f.mutate(link, 'attributes', 'href');
    f.mutate(link, 'addedNodes');
    await f.flush();
    assert.deepEqual(f.imports, ['./hrefHandler.js']);
});

test('failed feature imports can be retried by a subsequent mutation', async () => {
    const node = element('div', { src: '/partial.html' });
    const f = await setup([node], new Set(['./srcHandler.js']));
    assert.equal(f.errors.length, 1);
    f.mutate(node, 'attributes', 'src');
    await f.flush();
    assert.deepEqual(f.imports, ['./srcHandler.js', './srcHandler.js']);
    assert.equal(f.errors.length, 1);
});
