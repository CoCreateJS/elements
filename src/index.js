/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

/**
 * Commercial Licensing Information:
 * For commercial use of this software without the copyleft provisions of the AGPLv3,
 * you must obtain a commercial license from CoCreate LLC.
 * For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.
 */
import {
    getAttributes
} from "@cocreate/utils";
import { init, initElement, initSocket } from "./initHandler.js";
import { initDataKey, getDataKey, getDataElements, getDataKeys, getData, getDataObject } from "./getDataHandler.js";
import { read, save } from "./crudHandler.js";
import { setDataType, setData } from "./setDataHandler.js";
import { reset } from "./formHandler.js";

import "@cocreate/element-prototype";
import "./dndHandler.js";
import "./srcHandler.js";
import "./socketHandler.js";
import "./valueQuery.js";
import "./iframeHandler.js";

import { elements, forms, keys, debounce } from "./mapRegistry.js"

export default {
    init,
    read,
    save,
    getData,
    getDataObject,
    reset,
    elements,
    keys,
    forms,
    debounce,
    getAttributes,
    setDataType
};
