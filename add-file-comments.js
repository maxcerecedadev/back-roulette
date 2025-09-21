// add-file-comments.js
import fs from "fs";
import path from "path";

const srcDir = path.resolve("./src");

function processJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processJsFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      addComment(fullPath);
    }
  }
}

function addComment(filePath) {
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const content = fs.readFileSync(filePath, "utf8");

  const firstLine = content.split("\n")[0].trim();

  if (firstLine === `// ${relPath}`) {
    console.log(`✅ Ya tiene comentario: ${relPath}`);
    return;
  }

  const newContent = `// ${relPath}\n${content}`;
  fs.writeFileSync(filePath, newContent, "utf8");

  console.log(`✍️ Comentario añadido: ${relPath}`);
}

console.log("🚀 Procesando archivos .js en src...");
processJsFiles(srcDir);
console.log("✅ Proceso completado.");
