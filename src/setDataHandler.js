import {
    dotNotationToObject,
    queryData,
    sortData,
    getAttributes,
    checkValue,
    getValueFromObject
} from "@cocreate/utils";
import CRUD from "@cocreate/crud-client";
import filter from "@cocreate/filter";
import { elements, forms, keys } from "./mapRegistry.js"

export function setDataType(element, data, action) {
    // TODO: if an array name is updated, the attibute array="" needs to be updated.

    if (!data) return;

    let form;
    if (element.tagName === "FORM") {
        form = element;
    } else if (element.parentElement){
        form = element.parentElement.closest("form");
    }

    if (!form) {
        if (data.type === "object") {
            if (data.object?.[0]?._id) {
                element.setAttribute("object", data.object[0]._id);
            }
        } else {
            element.setAttribute(data.type, data[data.type].name);
        }
    } else {
        let formObject = forms.get(form);
        if (form.getAttribute("object") === "pending")
            form.setAttribute("object", data.object[0]._id);

        let elements = formObject.types.get(data.type);

        for (let [el, elData] of elements.entries()) {
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
        setData(Array.from(elements.keys()), data);
    }

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

    if (data.$filter && data.$filter.query) {
        let sortedData = sort$in(data[type], data.$filter.query);
        if (sortedData && sortedData.length) data[type] = sortedData;
    }

    for (let el of element) {
        // if rendered in server side skip
        if (el.hasAttribute("rendered")) return el.removeAttribute("rendered");
        if (el.hasAttribute("render-json")) {
            console.log("render-json", "");
        }

        let reference = el.getAttribute("reference");
        let action = el.getAttribute("actions");
        if (action && ["database", "array", "object", "key"].includes(action))
            continue;

        if (data.array.includes("aiConversations")) {
            console.log("testing ai conversations");
        }

        const { key, isRead, isUpdate, isListen, isCrdt } = getAttributes(el);
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
        data.$filter &&
        (data.$filter.overwrite || !isRendered)
    ) {
        await element.renderValue(data);
    } else if (
        (data.$filter && data.$filter.loadmore) ||
        (data.method && data.method.endsWith(".read") && isRendered)
    ) {
        await loadMore(element, data, type);
    } else if (
        element.getFilter &&
        data.method &&
        !data.method.endsWith(".read")
    ) {
        await checkFilters(element, data, type);
    } else if (element.renderValue) {
        if (key)
            data = {[key]: data}
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

    if (data.$filter) {
        let filterElement = filter.filters.get(element);
        if (filterElement) filterElement.index = data.$filter.index;
    }

    if (!data[type] || !Array.isArray(data[type]) || !data[type].length) return;

    const evt = new CustomEvent("fetchedData", { bubbles: true });
    element.dispatchEvent(evt);
}

async function loadMore(element, data, type, sort) {
    let clonedData = { ...data };
    let renderedData = await element.getData();
    if (!renderedData || !renderedData[type]) {
        return;
    }
    for (let i = 0; i < clonedData[type].length; i++) {
        let index;
        if (type === "object") {
            index = renderedData[type].findIndex(
                (obj) => obj._id === clonedData[type][i]._id
            );
        } else {
            index = renderedData[type].findIndex(
                (obj) => obj.name === clonedData[type][i].name
            );
        }

        if (index >= 0) {
            clonedData[type].splice(i, 1);
            i--; // Adjust the index to account for the removed item
        }
    }
    if (clonedData[type].length > 0) {
        await element.renderValue(clonedData);
    }
}

async function checkFilters(element, data, type) {
    let localData;
    if (!element.getData) {
        // TODO: fix: getObject as this is related to render or form, but filter could exist on an input which does not have getObject
        // TODO: generate an object of current element key: value to use with filter. because filter is used object is not defined
        localData = getObject(element);
        if (Array.isArray(localData[type])) localData = localData[type][0];
    } else localData = await element.getData();

    if (!localData) return;

    let newData;
    if (type) {
        localData = localData[type];
        newData = data[type];
    } else newData = data;

    let filter = await element.getFilter();
    if (filter && filter.query) {
        newData = newData.filter(item => queryData(item, filter.query));
    }

    if (!newData || !newData.length) return;

    if (Array.isArray(localData)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, localData, newData[i], type, filter);
            }
        } else {
            checkIndex(element, data, localData, newData, type, filter);
        }
    } else {
        let primaryKey;
        if (type === "object") {
            primaryKey = "_id";
        } else {
            primaryKey = "name";
        }

        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                if (
                    typeof localData === "string" &&
                    localData === newData[i][primaryKey]
                ) {
                    localData = newData[i];
                } else if (localData[primaryKey] === newData[i][primaryKey]) {
                    localData = dotNotationToObject(newData[i], localData);
                }
            }
        } else if (typeof localData === "string" && localData === newData[primaryKey]) {
            localData = newData;
        } else if (localData[primaryKey] === newData[primaryKey]) {
            localData = dotNotationToObject(newData, localData);
        }

        if (element.renderValue) element.renderValue(data);
        // render({ element, data, key: type });
        else if (data) element.setValue(localData);
    }
}

function checkIndex(element, data, localData, newData, type, filter) {
    let index;
    if (type === "object") {
        index = localData.findIndex((obj) => obj._id === newData._id);
    } else {
        index = localData.findIndex((obj) => obj.name === newData.name);
    }

    if (!data.$filter) data.$filter = {};

    if (data.method.endsWith(".delete")) {
        if (index === -1) return;
        data.$filter.remove = true;
        localData.splice(index, 1);
    } else {
        if (data.method.endsWith(".create")) {
            if (index === -1) {
                data.$filter.create = true;
                if (filter && filter.sort) newData.isNewData = true;
                else index = localData.length;
                localData.push(newData);
            }
        } else {
            if (index === -1) return;
            data.$filter.update = true;
            data.$filter.currentIndex = index;
            localData[index] = dotNotationToObject(newData, localData[index]);
            if (filter && filter.sort) {
                localData[index].isNewData = true;
            }
        }

        if (filter && filter.sort) {
            localData = sortData(localData, filter.sort);
            index = localData.findIndex((obj) => obj.isNewData);
        }
    }

    if (index >= 0) {
        if (data.$filter.currentIndex === index)
            delete data.$filter.currentIndex;
        data.$filter.index = index;
        if (element.renderValue) element.renderValue(data);
        else if (data) element.setValue(localData);
    }
}

export default { setDataType, setData }