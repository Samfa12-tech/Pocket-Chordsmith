/** Godot can print a script exception and still exit 0; exit alone is not a gate. */
export function assertGodotProcessSucceeded(result, description = "Godot") {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${description} failed with status ${result.status}`);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.replace(/\u001b\[[0-9;]*m/g, "");
  const errors = output.split(/\r?\n/).filter(line => /^\s*(?:SCRIPT ERROR:|(?:WARNING:\s*)?ObjectDB instances leaked|ERROR:\s*\d+ resources? still in use at exit)/i.test(line));
  if (errors.length) throw new Error(`${description} reported unexpected runtime errors despite exit 0:\n${errors.join("\n")}`);
}
