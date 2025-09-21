// scripts/listSrcTreeMd.js
import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve("src");
const OUTPUT_FILE = path.resolve("src-structure.md");

function listDir(dir, depth = 0) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let result = "";

  entries.forEach((entry) => {
    const indent = "  ".repeat(depth);
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result += `${indent}- 📂 ${entry.name}\n`;
      result += listDir(fullPath, depth + 1);
    } else {
      result += `${indent}- 📄 ${entry.name}\n`;
    }
  });

  return result;
}

const treeMd = `# 📂 Estructura de src\n\n${listDir(SRC_DIR)}`;

fs.writeFileSync(OUTPUT_FILE, treeMd);

console.log(`✅ Estructura guardada en ${OUTPUT_FILE}`);
