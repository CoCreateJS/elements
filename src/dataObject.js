import { getAttributes, checkValue } from "@cocreate/utils";

export const environment = localStorage.getItem("environment");

/**
 * Parses and normalizes HTML attributes from an element into a canonical CRUD data object.
 * Infers execution type (object, index, array, database, storage, data) dynamically.
 *
 * @param {Element} element
 * @returns {Object|undefined} Normalized data payload object
 */
export function getDataObject(element) {
    const data = getAttributes(element);
    const crudType = ["storage", "database", "array", "index", "object"];

    for (let i = 0; i < crudType.length; i++) {
        if (!checkValue(data[crudType[i]])) return;

        if (data[crudType[i]] && data[crudType[i]].includes(",")) {
            const array = data[crudType[i]].split(",");
            data[crudType[i]] = [];

            for (let j = 0; j < array.length; j++) {
                const item = array[j].trim();
                if (crudType[i] === "object") {
                    data[crudType[i]].push({ _id: item });
                } else {
                    data[crudType[i]].push(item);
                }
            }
        }
    }

    if (data.object || data.object === "" || data.key || data.key === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "object";
    } else if (data.index || data.index === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "index";
    } else if (data.array || data.array === "") data.type = "array";
    else if (data.database || data.database === "") data.type = "database";
    else if (data.storage || data.storage === "") data.type = "storage";
    else if (data.data) data.type = "data";

    if (
        environment &&
        !data.database &&
        ["array", "index", "object"].includes(data.type)
    )
        data.database = environment;

    delete data.isRealtime;
    return data;
}
