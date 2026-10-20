const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('save waits for the response to be applied before its caller continues', async () => {
    const source = readFileSync(join(__dirname, '../src/crudHandler.js'), 'utf8');
    const saveCode = source.slice(source.indexOf('export async function save('), source.indexOf('\nActions.init(')).replace('export ', '');
    let finishApplying;
    let applied = false;
    let completed = false;
    const gate = new Promise(resolve => { finishApplying = resolve; });
    const form = {
        tagName: 'FORM',
        getAttribute: () => null,
        setAttribute() {},
        getData: async () => [{ type: 'object', array: 'clusters', object: { name: 'Cluster' } }]
    };
    const save = vm.runInNewContext(`(${saveCode})`, {
        getSubscription: () => null,
        deriveSubscriptionKeys: () => [],
        CRUD: { send: async () => ({
            type: 'object', method: 'object.create', array: 'clusters',
            object: [{ _id: '65f8cb447b39a3c1a8904e22' }]
        }) },
        setDataType: async () => { await gate; applied = true; }
    });
    const completion = save(form).then(() => { completed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    finishApplying();
    await completion;
    assert.equal(applied, true);
    assert.equal(completed, true);
});
