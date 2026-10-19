import { spec } from "../src/spec/dimensions";
import { deviceSpec } from "../src/spec/device";
import { entries, formatReport } from "../src/spec/report";

const all = [...entries(spec), ...entries({ device: deviceSpec })];
const ph = all.filter((e) => e.source === "placeholder");
console.log(`Placeholder values (${ph.length} of ${all.length} spec entries):\n`);
console.log(formatReport(ph));
console.log(`\nmeasured: ${all.filter((e) => e.source === "measured").length}, datasheet: ${all.filter((e) => e.source === "datasheet").length}, placeholder: ${ph.length}`);
