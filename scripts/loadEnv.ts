import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envFiles = [".env.local", ".env"];

function parseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

for (const file of envFiles) {
  const filePath = path.join(process.cwd(), file);
  if (!existsSync(filePath)) continue;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}
