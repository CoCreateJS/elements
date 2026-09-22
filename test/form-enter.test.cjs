const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = readFileSync(path.join(__dirname, '../src/formHandler.js'), 'utf8');
const handler = source.slice(source.indexOf('function handleEnter('), source.indexOf('\n/**\n * @param form'));
function run(options = {}) {
    let clicked = 0, prevented = 0, queried = 0;
    const form = { contains: () => true };
    const scope = { getAttribute: () => '#next' };
    const target = {
        form, hasAttribute: () => true,
        matches: () => options.disabled || false,
        closest: () => options.hidden ? {} : null,
        getClientRects: () => options.invisible ? [] : [{}],
        click: () => clicked++
    };
    const input = {
        tagName: options.tagName || 'INPUT', type: options.type || 'text', form,
        closest: selector => selector === '[submit-query]' ? (options.noQuery ? null : scope) : (options.widget ? {} : null)
    };
    const event = { key: 'Enter', target: input, currentTarget: form, preventDefault: () => prevented++, ...options.event };
    vm.runInNewContext(handler + '\nhandleEnter(event);', {
        event, getComputedStyle: () => ({ visibility: 'visible' }),
        queryElements: ({ element }) => { assert.equal(element, scope); queried++; return options.multiple ? [target, target] : [target]; }
    });
    return { clicked, prevented, queried };
}
test('an explicit query clicks its target once', () => {
    assert.deepEqual(run(), { clicked: 1, prevented: 1, queried: 1 });
});
test('without a query, native behavior is left alone', () => {
    assert.deepEqual(run({noQuery:true}), {clicked:0,prevented:0,queried:0});
});
for (const option of ['disabled','hidden','invisible','multiple']) {
    test(`${option} targets are not clicked and cannot fall through to submission`, () => {
        const result=run({[option]:true}); assert.equal(result.clicked,0);assert.equal(result.prevented,1);
    });
}
for (const options of [{tagName:'TEXTAREA'},{tagName:'SELECT'},{type:'checkbox'},{type:'submit'},{widget:true},{event:{isComposing:true}},{event:{ctrlKey:true}},{event:{defaultPrevented:true}}]) {
    test(`preserves control behavior: ${JSON.stringify(options)}`,()=>{
        assert.deepEqual(run(options),{clicked:0,prevented:0,queried:0});
    });
}
test('held Enter does not repeat or fall through to native submission',()=>{
    assert.deepEqual(run({event:{repeat:true}}),{clicked:0,prevented:1,queried:0});
});
