// CRUD runtime. Loaded by data selectors, CRUD actions, or an Elements API call.
import "@cocreate/element-prototype";

export { init } from "./initHandler.js";
export { read, save } from "./crudHandler.js";
export { getData } from "./getDataHandler.js";
export { setDataType } from "./setDataHandler.js";
