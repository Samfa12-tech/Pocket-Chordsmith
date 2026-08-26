import path from "node:path";
import { fileURLToPath } from "node:url";
import { JOB_IDS } from "./plan-ci.mjs";

export function verifyFamilyGate(plan, results) {
  const errors = [];
  for (const job of JOB_IDS) {
    const planned = plan?.jobs?.[job] === true;
    const result = results?.[job]?.result;
    if (planned && result !== "success") {
      errors.push(`${job}: planned by CI planner but result was ${result ?? "missing"}`);
    }
    if (!planned && result !== "skipped") {
      errors.push(`${job}: not planned by CI planner but result was ${result ?? "missing"}; only an explicit planned skip is accepted`);
    }
  }
  return errors;
}

function main() {
  let plan;
  let results;
  try {
    plan = JSON.parse(process.env.CI_PLAN ?? "");
    results = JSON.parse(process.env.FAMILY_RESULTS ?? "");
  } catch (error) {
    console.error(`Pocket Audio family gate could not parse the CI plan/results: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CI plan: ${JSON.stringify(plan)}`);
  console.log(`Job results: ${JSON.stringify(results)}`);
  const errors = verifyFamilyGate(plan, results);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Every planned Pocket Audio family job passed; every unplanned job was explicitly skipped.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
