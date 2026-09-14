import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parkingApiModule = require("./parkingApi.cjs");

export default parkingApiModule.default || parkingApiModule;
