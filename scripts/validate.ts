import { spec } from "../src/spec/dimensions";
import { validate } from "../src/spec/validate";

const checks = validate(spec);
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? "  ok  " : " FAIL "} ${c.name.padEnd(52)} ${c.message}`);
console.log(`\n${checks.length - failed.length}/${checks.length} spec checks passed`);
if (failed.length) {
  console.error(`\n${failed.length} spec check(s) failed. Fix the spec, do not loosen the check.`);
  process.exit(1);
}
