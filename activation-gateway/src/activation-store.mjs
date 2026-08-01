import fs from "node:fs";
import path from "node:path";


function readData(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}


export function createActivationStore(filePath) {
  const target = path.resolve(filePath);
  let data = readData(target);

  return Object.freeze({
    get(agentId) {
      const value = data[agentId];
      return typeof value === "string" ? value : null;
    },
    set(agentId, receipt) {
      data = { ...data, [agentId]: receipt };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(temporary, target);
    },
  });
}

