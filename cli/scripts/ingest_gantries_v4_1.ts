/**
 * M3 — TDCS 手冊 v4.1 §3 門架代碼路段彙整表 Ingest (TypeScript wrapper)
 *
 * 核心邏輯在 ingest_gantries_v4_1.py（pdfminer.six）。
 * 本腳本作為 npm 一致入口：
 *   npx ts-node scripts/ingest_gantries_v4_1.ts
 *
 * 理由：pdf-parse / pdfjs-dist 與本專案 ESM build 有相容問題（yoga-wasm 干擾）；
 * pdfminer.six（Python）已驗證可正確提取 §3 表格文字（M3 實施紀錄）。
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pyScript = join(__dirname, 'ingest_gantries_v4_1.py');

if (!existsSync(pyScript)) {
  console.error(`ERROR: 找不到 Python ingest 腳本: ${pyScript}`);
  process.exit(1);
}

console.log('Delegating to ingest_gantries_v4_1.py (pdfminer.six)...');
try {
  execSync(`python "${pyScript}"`, { stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}
