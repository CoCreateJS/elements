const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/crudHandler.js'), 'utf8');
const saveSource = source.slice(source.indexOf('export async function save('), source.indexOf('\nActions.init(')).replace('export ', '');

for (const value of [[{ name: 'image.svg' }], [{ name: 'a.svg' }, { name: 'b.svg' }], { name: 'image.svg' }]) {
    test(`saving an entire document preserves its shape: ${JSON.stringify(value)}`, async () => {
        let sent;
        const element = {
            tagName: 'INPUT',
            getAttribute: name => name === 'key' ? '{}' : null,
            getValue: async () => value,
            setAttribute() {}
        };
        const save = vm.runInNewContext(`(${saveSource})`, {
            elements: new Map([[element, 'files']]),
            keys: new Map([['files', { dataKey: { object: { type: 'object', array: 'files', object: '', key: '{}' } } }]]),
            getSubscription: () => null,
            deriveSubscriptionKeys: () => [],
            CRUD: { send: async data => { sent = data; } }
        });
        await save(element);
        assert.equal(Array.isArray(sent.object), Array.isArray(value));
        assert.equal(JSON.stringify(sent.object), JSON.stringify(value));
        assert.equal(sent.method, 'object.create');
        if (Array.isArray(value)) assert.notEqual(sent.object, value);
    });
}
