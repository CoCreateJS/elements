const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function documentStub() {
    const listeners = new Set();
    return {
        nodeType: 9,
        addEventListener: (type, callback) => listeners.add(callback),
        removeEventListener: (type, callback) => listeners.delete(callback),
        click(target) {
            const event = { target, prevented: false, preventDefault() { this.prevented = true; } };
            for (const listener of listeners) listener(event);
            return event;
        }
    };
}

async function setup() {
    const document = documentStub(), opened = [], definitions = [];
    const location = { href: 'https://example.test/' };
    const actions = { init: entries => definitions.push(...entries), href() { throw new Error('Default href'); } };
    let targets = [];
    const stubs = {
        '@cocreate/actions': { default: actions },
        '@cocreate/utils': { queryElements: () => targets }
    };
    const context = vm.createContext({ document, location, URL, window: { open: (...args) => opened.push(args) } });
    const module = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '../src/hrefHandler.js'), 'utf8'), { context });
    await module.link(name => {
        const exports = stubs[name];
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    function element(attributes = {}, parent = null) {
        const node = {
            ownerDocument: document, parent, children: [],
            hasAttribute: name => Object.hasOwn(attributes, name),
            getAttribute: name => attributes[name] ?? null,
            matches: selector => selector.split(',').some(part => Object.hasOwn(attributes, part.trim().slice(1, -1))),
            closest(selector) { return this.matches(selector) ? this : parent?.closest(selector) || null; },
            querySelector(selector) { return this.children.find(child => child.matches(selector)) || null; }
        };
        parent?.children.push(node);
        return node;
    }
    return { document, location, opened, actions, definitions, element, module: module.namespace,
        select: value => { targets = value; } };
}

test('automatic setup registers actions and exposes only navigation controls', async () => {
    const f = await setup();
    assert.deepEqual(Object.keys(f.module).sort(), ['default', 'disableHref', 'enableHref', 'open']);
    assert.deepEqual(Object.keys(f.module.default).sort(), ['disableHref', 'enableHref', 'open']);
    for (const name of ['open', 'disableHref', 'enableHref']) {
        assert.equal(f.module.default[name], f.module[name]);
    }
    assert.equal(typeof f.actions.href, 'function');
    assert.equal(f.document.link.islink, 'true');
    assert.deepEqual(f.definitions.map(definition => definition.name), ['disableHref', 'enableHref']);
});

test('delegation handles newly inserted links and preserves window targeting', async () => {
    const f = await setup();
    const link = f.element({ href: '/next', target: '_window' });
    const icon = f.element({}, link);
    assert.equal(f.document.click(icon).prevented, true);
    assert.deepEqual(f.opened, [['/next', '_blank', 'location=yes,height=570,width=520,scrollbars=yes,status=yes']]);
});

test('direct clicks defer action links to the chain href hook', async () => {
    const f = await setup();
    const link = f.element({ actions: 'save', href: '/next' });
    const event = f.document.click(link);
    assert.equal(event.prevented, false);
    assert.equal(f.location.href, 'https://example.test/');
    f.actions.href(link, { event });
    assert.equal(event.prevented, true);
    assert.equal(f.location.href, '/next');
});

test('the chain hook resolves child links and leaves downloads alone', async () => {
    const f = await setup();
    const button = f.element({ actions: 'save' });
    f.element({ href: '/next', target: 'preview' }, button);
    f.actions.href(button);
    assert.deepEqual(f.opened, [['/next', 'preview']]);
    const download = f.element({ href: '/file', download: '' });
    assert.equal(f.document.click(download).prevented, false);
    f.actions.href(download);
    assert.equal(f.location.href, 'https://example.test/');
});

test('enable and disable actions update document state and complete their chains', async () => {
    const f = await setup();
    const button = f.element(), link = f.element({ href: '/next' });
    let completed = 0;
    f.definitions[0].callback({ element: button, end() { completed++; } });
    assert.equal(f.document.click(link).prevented, true);
    f.actions.href(link);
    assert.equal(f.location.href, 'https://example.test/');
    f.definitions[1].callback({ element: button, end() { completed++; } });
    assert.equal(completed, 2);
    f.document.click(link);
    assert.equal(f.location.href, '/next');
});

test('link-query scopes enable and disable to the selected iframe document', async () => {
    const f = await setup();
    const frameDocument = documentStub();
    f.select([{ contentDocument: frameDocument }]);
    const button = f.element({ 'link-query': '#preview' });
    f.module.disableHref(button);
    assert.equal(frameDocument.link.islink, 'false');
    assert.equal(f.document.link.islink, 'true');
    f.module.enableHref(button);
    assert.equal(frameDocument.link.islink, 'true');
});

test('applications can replace the href hook after the feature loads', async () => {
    const f = await setup();
    const custom = () => {};
    f.actions.href = custom;
    const button = f.element();
    f.module.disableHref(button);
    f.module.enableHref(button);
    assert.equal(f.actions.href, custom);
});
