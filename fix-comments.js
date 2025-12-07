import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.join(__dirname, 'src');

function findCommentsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const comments = [];

  // Empezamos desde la línea 2 (índice 1), ignorando la primera línea
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Detectar solo comentarios que empiezan con "//" (posiblemente después de espacios)
    if (/^\s*\/\/.*/.test(line)) {
      comments.push({
        type: 'line',
        line: lineNumber,
        content: line.trim(),
        fullLine: line.trim()
      });
    }

    // Buscar comentarios JSX bloque {/* */}
    let jsxMatch;
    let lastIndex = 0;
    const jsxRegex = /{\/\*[\s\S]*?\*\/}/g;
    while ((jsxMatch = jsxRegex.exec(line.substring(lastIndex)))) {
      comments.push({
        type: 'jsx-block',
        line: lineNumber,
        content: jsxMatch[0],
        fullLine: line.trim()
      });
      lastIndex += jsxMatch.index + 1;
    }
  }

  return comments;
}

function traverseDir(currentPath) {
  const items = fs.readdirSync(currentPath);

  for (const item of items) {
    const itemPath = path.join(currentPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      traverseDir(itemPath);
    } else if (item.match(/\.(tsx|jsx|js|ts)$/)) {
      const comments = findCommentsInFile(itemPath);

      if (comments.length > 0) {
        console.log(`\n📍 Archivo: ${itemPath}`);
        comments.forEach(comment => {
          console.log(`  [${comment.type}] Línea ${comment.line}: ${comment.content}`);
        });
      }
    }
  }
}

console.log('🔍 Buscando comentarios JSX y de línea (excepto primera línea) en archivos dentro de src...\n');
traverseDir(srcPath);
console.log('\n✅ Búsqueda finalizada.');