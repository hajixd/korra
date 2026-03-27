import fs from "node:fs";
import path from "node:path";

const buildSearchRoots = (): string[] => {
  const roots = new Set<string>();
  const addLineage = (startDir: string | null | undefined) => {
    if (!startDir) {
      return;
    }
    let current = path.resolve(startDir);
    for (let depth = 0; depth < 12; depth += 1) {
      roots.add(current);
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  };

  addLineage(process.cwd());
  addLineage(process.env.INIT_CWD);
  addLineage(process.env.PWD);
  if (typeof __dirname === "string" && __dirname.trim().length > 0) {
    addLineage(__dirname);
  }
  const workspaceRoot = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "Desktop", "projects")
    : "";
  if (workspaceRoot && fs.existsSync(workspaceRoot)) {
    addLineage(workspaceRoot);
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        addLineage(path.join(workspaceRoot, entry.name));
      }
    }
  }

  return [...roots];
};

const readEnvValueFromFiles = (name: string): string => {
  for (const rootDir of buildSearchRoots()) {
    for (const candidate of [".env.local", ".env"]) {
      const filePath = path.join(rootDir, candidate);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const content = fs.readFileSync(filePath, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }
        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        if (key !== name) {
          continue;
        }
        return line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
      }
    }
  }
  return "";
};

export const getFallbackEnvValue = (name: string): string => {
  const runtimeValue = process.env[name];
  if (typeof runtimeValue === "string" && runtimeValue.trim().length > 0) {
    return runtimeValue.trim();
  }
  return readEnvValueFromFiles(name).trim();
};

export const ensureTwelveDataEnvLoaded = () => {
  if (!process.env.TWELVE_DATA_API_KEYS) {
    const value = getFallbackEnvValue("TWELVE_DATA_API_KEYS");
    if (value) {
      process.env.TWELVE_DATA_API_KEYS = value;
    }
  }
  if (!process.env.TWELVE_DATA_API_KEY) {
    const value = getFallbackEnvValue("TWELVE_DATA_API_KEY");
    if (value) {
      process.env.TWELVE_DATA_API_KEY = value;
    }
  }
  if (!process.env.TWELVEDATA_API_KEY) {
    const value = getFallbackEnvValue("TWELVEDATA_API_KEY");
    if (value) {
      process.env.TWELVEDATA_API_KEY = value;
    }
  }
};
