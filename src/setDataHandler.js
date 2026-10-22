import {
    dotNotationToObject,
    queryData,
    searchData,
    sortData,
    getAttributes,
    checkValue,
    getValueFromObject
} from "@cocreate/utils";
import CRUD from "@cocreate/crud-client";
import filter from "@cocreate/filter";
import { elements, forms, keys } from "./mapRegistry.js";
import { getDataElements, getDataObject } from "./getDataHandler.js";

export async function setDataType(element, data, action) {
    // TODO: if an array name is updated, the attibute array="" needs to be updated.

    if (!data) return;

    const dataElements = new Set(getDataElements(data));

    let form;
    if (element.tagName === "FORM") {
        form = element;
    } else if (element.parentElement) {
        form = element.parentElement.closest("form");
    }

    if (!form) {
        dataElements.add(element);
        if (data.type === "object") {
            if (data.object?.[0]?._id) {
                element.setAttribute("object", data.object[0]._id);
            }
        } else {
            element.setAttribute(data.type, data[data.type].name);
        }
    } else {
        let formObject = forms.get(form);
        const fieldsets = form.querySelectorAll('fieldset[object="pending"]');
        for (const scope of [...fieldsets, form]) {
            if (scope.getAttribute("object") === "pending") {
                const object = data.object?.[0];
                if (scope.hasAttribute("array")) {
                    const arrays = scope.getAttribute("array").split(",");
                    const objectArrays = Array.isArray(object?.$array)
                        ? object.$array
                        : [object?.$array];
                    if (object?._id && arrays.some((array) => {
                        const name = array.trim();
                        return name !== "" && objectArrays.includes(name);
                    })) {
                        scope.setAttribute("object", object._id);
                    }
                } else if (object?._id) {
                    scope.setAttribute("object", object._id);
                }
            }
        }

        const typeElements = formObject?.types?.get(data.type);

        for (let [el, elData] of typeElements?.entries() || []) {
            dataElements.add(el);
            if (data.type === "object") {
                if (!elData.object || elData.object === "pending") {
                    elData.object = data.object[0]._id;
                    el.setAttribute("object", data.object[0]._id);
                }
            } else if (!elData[data.type]) {
                elData[data.type] = data[data.type].name;
                el.setAttribute(data.type, data[data.type].name);
            }
        }
    }

    if (dataElements.size) await setData(Array.from(dataElements), data);

    if (action) {
        action.element.dispatchEvent(
            new CustomEvent("saved", {
                detail: data
            })
        );
    } else {
        document.dispatchEvent(
            new CustomEvent("saved", {
                detail: data
            })
        );
    }
}

function get$in(query, mergedValues = []) {
    for (let key of Object.keys(query)) {
        if (key === "$and" || key === "$or" || key === "$nor") {
            for (let i = 0; i < query[key].length; i++) {
                sort$in(query[key][i], mergedValues);
            }
        } else if (
            typeof query[key] === "object" &&
            !Array.isArray(query[key])
        ) {
            if (query[key].$in)
                mergedValues = [...mergedValues, ...query[key].$in];
        }
    }
    return mergedValues;
}

function sort$in(data, query) {
    let mergedValues = get$in(query);

    if (mergedValues.length) {
        const sorted = mergedValues
            .map((name) => data.find((career) => career.name === name))
            .filter((career) => career !== undefined);
        return sorted;
    }
}

export async function setData(element, data) {
    if (!element) {
        element = getDataElements(data);
        if (!element.length) return;
    }
    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element];

    let type = data.type;
    if (!type && data.method) {
        type = data.method.split(".")[0];
    } else if (type == "key") type = "object";

    if (data.filter && data.filter.query) {
        let sortedData = sort$in(data[type], data.filter.query);
        if (sortedData && sortedData.length) data[type] = sortedData;
    }

    for (let el of element) {
        // Keep SSR content for this element without skipping its batch siblings.
        if (el.hasAttribute("rendered")) {
            el.removeAttribute("rendered");
            continue;
        }
        if (
            data.method?.endsWith(".delete") &&
            !(el.getFilter || el.renderValue)
        )
            continue;
        if (el.hasAttribute("render-json")) {
            console.log("render-json", "");
        }

        let reference = el.getAttribute("reference");
        let action = el.getAttribute("actions");
        if (action && ["database", "array", "object", "key"].includes(action))
            continue;

        const { key, isRead, isUpdate, isListen, isCrdt } = getAttributes(el);
        if (key !== undefined && typeof key !== "string") {
            console.error("[CoCreate elements] Ignoring element with a non-string key", {
                key,
                keyType: typeof key,
                element: el
            });
            continue;
        }

        const hasRenderController =
            el.hasAttribute("render-query") || el.hasAttribute("render-json");

        // array/object without a key establishes CRUD identity only. Do not
        // write the response into the element unless it explicitly controls a
        // render target.
        if (key === undefined && !hasRenderController) continue;

        let elementType = el.getAttribute("type");
        if (elementType !== "file" && (el.getFilter || el.renderValue))
            await filterData(el, data, type, key);
        else {
            if (!data[type] || !data[type].length) {
                if (el.hasAttribute("value-dispatch")) el.setValue("");
                continue;
            }

            if (key && checkValue(key)) {
                let value;
                if (key.includes("$length")) {
                    value = CRUD.getValueFromObject(
                        data[type][0],
                        key.replace(/\.\$length$/, "")
                    );
                    if (value) value = value.length;
                    else value = 0;
                } else {
                    let $update = data[type][0].$update;
                    if ($update) {
                        delete data[type][0].$update;
                        data[type][0] = { ...data[type][0], ...$update };
                    } else if (key === "$data") {
                        value = data;
                    } else if (key && key.startsWith("$data")) {
                        value = CRUD.getValueFromObject(data, key.slice(1));
                    } else if (key === `$${type}`) {
                        value = data[type];
                    } else if (key && key.startsWith(`$${type}`)) {
                        value = CRUD.getValueFromObject(data, key.slice(1));
                    } else if (key === "{}") {
                        value = data[type][0];
                        if (reference === "false") {
                            delete data[type][0].$storage;
                            delete data[type][0].$database;
                            delete data[type][0].$array;
                        }
                    } else {
                        value = CRUD.getValueFromObject(data[type][0], key);
                    }
                }

                if (!data[type].length) continue;
                if (isRead === "false" || isCrdt === "true") continue;
                if (
                    isUpdate === "false" ||
                    (isListen === "false" && !data.method.endsWith(".read"))
                )
                    continue;

                // TODO: object.update data returned from server will not include $operator
                el.setValue(value);
            }
        }
    }
}

async function filterData(element, data, type, key) {
    if (key === "$length" && (data.error || !Array.isArray(data[type]))) return;
    if (
        data.method &&
        !data.method.endsWith(".read") &&
        (element.getFilter || element.renderValue)
    ) {
        // A write payload is a document delta, not the result of this count's
        // query. Keep the displayed count until its own filtered read completes.
        // Re-read even for partial updates: a document may have left the query.
        if (key === "$length" && element.getFilter && element.setFilter) {
            if (data.error || !data[type]?.length) return;
            element.setFilter(await element.getFilter());
            return;
        }
        await checkFilters(element, data, type);
        return;
    }

    let operator = "",
        value;

    if (key && !key.includes("$length") && key !== "{}") {
        if (!data || !type) return;

        if (key.startsWith("$")) {
            operator = key.split(".")[0] || "";
        }

        let property = key;
        if (operator) {
            property = property.replace(operator + ".", "");
            if (operator === "$sum") {
                value = 0;
            }
        }
        if (Array.isArray(data[type])) {
            let filteredItems = [],
                isObject;
            for (let doc of data[type]) {
                if (!doc.$storage) continue;
                // TODO: should have been handled by getDataElements()
                if (type === "object") {
                    let _id = element.getAttribute("object");
                    if (_id && doc._id !== _id) continue;
                    let $update = doc.$update;
                    if ($update) {
                        delete doc.$update;
                        doc = { ...doc, ...$update };
                    }
                }
                let docValue = getValueFromObject(doc, property);
                if (docValue) {
                    if (operator === "$sum" && typeof docValue === "number") {
                        if (typeof value !== "number") value = 0;
                        value += docValue || 0;
                    } else if (Array.isArray(docValue)) {
                        filteredItems.push(...docValue);
                    } else {
                        isObject = true;
                        filteredItems.push(docValue);
                    }
                } else continue;
            }

            if (isObject && filteredItems.length === 1) {
                filteredItems = filteredItems[0];
            }
            if (!operator) data = filteredItems;
        } else {
            data = { [property]: data[type][property] };
        }
    }

    let isRendered = element.querySelector("[render-clone]");
    if (operator) {
        element.setValue(value);
    } else if (
        element.renderValue &&
        data.method &&
        data.method.endsWith(".read") &&
        data.filter &&
        (data.filter.overwrite || !isRendered)
    ) {
        await element.renderValue(data);
    } else if (
        (data.filter && data.filter.loadMore) ||
        (data.method && data.method.endsWith(".read") && isRendered)
    ) {
        await loadMore(element, data, type);
    } else if (element.renderValue) {
        if (key)
            data = { [key]: data }
        await element.renderValue(data);
    } else if (key === "$length") {
        element.setValue(data[type].length);
    } else if (key && key.includes("$length")) {
        let value = CRUD.getValueFromObject(
            data[type][0],
            key.replace(/\.\$length$/, "")
        );
        element.setValue(value.length);
    } else if (key === "$data") {
        value = data;
    } else if (key && key.startsWith("$data")) {
        value = CRUD.getValueFromObject(data, key.slice(1));
    } else if (key === `$${type}`) {
        value = data[type];
    } else if (key && key.startsWith(`$${type}`)) {
        value = CRUD.getValueFromObject(data, key.slice(1));
    } else if (key === "{}") {
        value = data[type][0];
    } else if (data) element.setValue(data);

    if (data.filter) {
        let filterElement = filter.filters.get(element);
        if (filterElement) filterElement.index = data.filter.index;
    }

    const evt = new CustomEvent("fetchedData", {
        bubbles: true,
        detail: data
    });
    element.dispatchEvent(evt);

    if (!data[type] || !Array.isArray(data[type]) || !data[type].length) return;
}

async function loadMore(element, data, type, sort) {
    const renderedData = await element.getData();
    if (!renderedData || !renderedData[type]) return;

    const key = type === "object" ? "_id" : "name";
    const renderedKeys = new Set(renderedData[type].map(item => item[key]));
    const records = data[type].filter(item => {
        if (renderedKeys.has(item[key])) return false;
        renderedKeys.add(item[key]);
        return true;
    });
    if (records.length) {
        await element.renderValue({
            ...data,
            [type]: records,
            filter: { ...data.filter, loadMore: true, overwrite: false }
        });
    }
}

async function checkFilters(element, data, type) {
    if (type && data[type]) {
        const applyUpdate = (record) => {
            if (!record?.$update) return record;
            const { $update, ...fields } = record;
            return { ...fields, ...$update };
        };
        data = {
            ...data,
            [type]: Array.isArray(data[type])
                ? data[type].map(applyUpdate)
                : applyUpdate(data[type])
        };
    }

    let localData;
    if (!element.getData) {
        // TODO: getDataObject is related to render or form, but filter could exist on an input which does not have getData
        // TODO: generate an object of current element key: value to use with filter. because filter is used object is not defined
        localData = getDataObject(element);
        if (localData && Array.isArray(localData[type])) {
            localData = localData[type][0];
        }
    } else localData = await element.getData();

    if (!localData) return;

    let filter = localData.filter
    let newData;
    if (type) {
        localData = localData[type];
        newData = data[type];
    } else newData = data;

    if (localData == null) {
        if (element.renderValue) localData = [];
        else return;
    }

    if (
        newData == null ||
        (Array.isArray(newData) && newData.length === 0)
    )
        return;

    if (Array.isArray(localData)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, localData, newData[i], type, filter);
            }
        } else {
            checkIndex(element, data, localData, newData, type, filter);
        }
    } else {
        if (data.method?.endsWith(".delete")) return;

        let matched = false;
        let primaryKey;
        if (type === "object") {
            primaryKey = "_id";
        } else {
            primaryKey = "name";
        }

        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                if (!newData[i]) continue;
                if (
                    typeof localData === "string" &&
                    localData === newData[i][primaryKey]
                ) {
                    localData = newData[i];
                    matched = true;
                } else if (localData[primaryKey] && localData[primaryKey] === newData[i][primaryKey]) {
                    localData = dotNotationToObject(newData[i], localData);
                    matched = true;
                }
            }
        } else if (typeof localData === "string" && localData === newData[primaryKey]) {
            localData = newData;
            matched = true;
        } else if (localData[primaryKey] && localData[primaryKey] === newData[primaryKey]) {
            localData = dotNotationToObject(newData, localData);
            matched = true;
        }

        if (!matched) return;
        if (element.renderValue) element.renderValue(data);
        // render({ element, data, key: type });
        else if (data) element.setValue(localData);
    }
}

function checkIndex(element, data, localData, newData, type, filter) {
    if (!newData) return;
    const primaryKey = type === "object" ? "_id" : "name";
    const primaryValue = newData[primaryKey];
    let index = localData.findIndex(
        (item) => item?.[primaryKey] === primaryValue
    );
    const isMatch =
        (!filter?.query || queryData(newData, filter.query)) &&
        (!filter?.search || searchData(newData, filter.search));

    if (!data.filter) data.filter = {};

    if (data.method.endsWith(".delete") || !isMatch) {
        if (index === -1) return;
        data.filter.remove = true;
        localData.splice(index, 1);
    } else {
        if (data.method.endsWith(".create")) {
            if (index === -1) {
                data.filter.create = true;
                index = localData.length;
                localData.push(newData);
            }
        } else {
            if (index === -1) return;
            data.filter.update = true;
            data.filter.currentIndex = index;
            localData[index] = dotNotationToObject(newData, localData[index]);
        }

        if (filter && filter.sort) {
            localData = sortData(localData, filter.sort);
            index = localData.findIndex(
                (item) => item?.[primaryKey] === primaryValue
            );
        }
    }

    if (index >= 0) {
        if (data.filter.currentIndex === index)
            delete data.filter.currentIndex;
        data.filter.index = index;
        if (element.renderValue) element.renderValue(data);
        else if (data) element.setValue(localData);
    }
}

export default { setDataType, setData }
