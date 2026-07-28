import { dotNotationToObject } from "@cocreate/utils";
import CRUD from "@cocreate/crud-client";
import { render, renderValue, renderedNodes } from "@cocreate/render";
import { elements, keys, debounce } from "./mapRegistry.js"

// TODO: has the potential to work on most of the crud elements specifically if the value is an object or an array
async function dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn) {
    let from = await dndCrudData(draggedEl, draggedFrom, "remove");
    let to = await dndCrudData(droppedEl, droppedIn, "add");

    if (from && to && !draggedFrom.isSameNode(droppedIn)) {
        let element = getDataElements(from.data);
        if (!element.length) return;

        if (!element.includes(droppedIn)) {
            if (from.keyPath.includes(".")) {
                let test = { [from.keyPath]: undefined };

                from.clonedParentData = dotNotationToObject(test, from.clonedParentData);
                dndCrudSend(from.clonedParentData, "update");
            } else {
                const index = from.keyPath.match(/\[(\d+)\]/);
                let removeData = from.clonedParentData[from.clonedParentData.type].splice(
                    index,
                    1
                )[0];
                if (removeData) {
                    removeData.type = from.clonedParentData.type;
                    removeData[removeData.type] = removeData;
                    dndCrudSend(removeData, "delete");
                }

                if (from.clonedParentData[from.clonedParentData.type].length)
                    dndCrudSend(from.clonedParentData, "update");
            }
        }
    }

    if (to) dndCrudSend(to.clonedParentData, "update");
}

async function dndCrudData(element, parent, operator) {
    if (!elements.has(parent)) return;
    let data = await parent.getData();
    let clonedParentData = getDataObject(parent);

    let { dragData, sortName, sortDirection, keyPath, clones, index } = dndNewData(
        element,
        data
    );
    clonedParentData[clonedParentData.type] = [];

    if (sortName) {
        for (let i = 0; i < clones.length; i++) {
            if (i > index) {
                let previousData = data[data.type][index];
                dragData[sortName] = operator === "add" ? i + 1 : i - 1;

                clonedParentData[clonedParentData.type].push({ ...previousData, ...dragData });
            }
        }
    } else {
        clonedParentData[clonedParentData.type] = [{ ...data[data.type][index], ...dragData }];
    }

    return { data, clonedParentData, keyPath, clones, index };
}

function dndNewData(element, data) {
    let dragData = {};
    if (data.$filter.query) {
        dndNewDataUpdate(dragData, data.$filter.query);
    }

    let sortName, sortDirection;
    let sort = data.$filter.sort;
    if (sort && sort.length) {
        for (let i = sort.length - 1; i >= 0; i--) {
            if (typeof data[sort.key] === "number") {
                sortName = sort.key;
                sortDirection = sort.direction;
                break;
            }
        }
    }

    let keyPath, clonesMap, clones, index;

    let renderedNode = renderedNodes.get(element);
    if (renderedNode) {
        keyPath = renderedNode.keyPath;
        clonesMap = renderedNode.template.clones;
        clones = Array.from(clonesMap.values());
        index = clones.indexOf(element);
    }

    return { dragData, sortName, sortDirection, keyPath, clones, index };
}

function dndNewDataUpdate(dragData, query) {
    for (let key of Object.keys(query)) {
        if (key === "$and" || key === "$or" || key === "$nor") {
            for (let i = 0; i < query[key].length; i++) {
                dndNewDataUpdate(dragData, query[key][i]);
            }
        } else if (
            typeof query[key] === "object" &&
            !Array.isArray(query[key])
        ) {
            if (query[key].$eq) dragData[key] = query[key].$eq;
            if (query[key].$ne) dragData[key] = query[key].$ne;
        } else {
            dragData[key] = query[key];
        }
    }
}

function dndCrudSend(data, crudType) {
    if (CRUD) {
        let action = data.type;
        action = action.charAt(0).toUpperCase() + action.slice(1);
        CRUD[crudType + action](data);
    } else console.log("dnd reordered data set as crud is unavailable");
}

Observer.init({
    name: "render",
    types: ["addedNodes"],
    selector: "[render-clone]",
    callback: function (mutation) {
        if (
            mutation.parentElement &&
            !mutation.parentElement.hasAttribute("dnd")
        )
            return;
        let delayTimer = debounce.get(mutation);
        clearTimeout(delayTimer);
        debounce.delete(mutation.target);

        let renderedNode = renderedNodes.get(mutation.target);
        if (!renderedNode) return;

        if (!mutation.movedFrom) return;
        let draggedEl = mutation.target;
        let draggedFrom = mutation.movedFrom.parentElement;
        let droppedEl =
            mutation.target.nextElementSibling ||
            mutation.target.previousElementSibling;
        let droppedIn = mutation.parentElement;

        if (!draggedFrom || !droppedIn) return;
        dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn);
    }
});
