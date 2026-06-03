#!/usr/bin/env node
/**
 * M5 Baseline 對齊 Runner（ESM）
 * 執行：node scripts/run_clean_202603_esm.mjs
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Import compiled ESM lib
const { runCleaning } = await import('../dist-lib/lib/tdcs-clean.js');

const cliRoot = path.resolve(__dirname, '..');
const RAW_DIR      = path.resolve(cliRoot, '../step0_s3_download/raw_202603');
const BASELINE_DIR = path.resolve(cliRoot, '../step1_cleaning/cleaned_202603');
const TS_OUT_DIR   = path.join(os.tmpdir(), 'ts_cleaned');
const today        = new Date().toISOString().slice(0, 10);
const REPORT_PATH  = path.join(cliRoot, 'tests', `baseline_compliance_${today}.md`);

const GANTRIES = ['01F2930N', '01F2930S', '01F3019N', '01F3019S'];

function md5File(filePath) {
  return createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function listAllCsv(dir) {
  const results = [];
  for (const sub of ['monthly', 'weekly', 'daily']) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const f of fs.readdirSync(subDir).sort()) {
      if (f.endsWith('.csv')) results.push({ sub, name: f, full: path.join(subDir, f) });
    }
  }
  return results;
}

console.log('=== M5 Baseline 對齊 ===');
console.log('RAW:      ', RAW_DIR);
console.log('BASELINE: ', BASELINE_DIR);
console.log('TS_OUT:   ', TS_OUT_DIR);

if (fs.existsSync(TS_OUT_DIR)) fs.rmSync(TS_OUT_DIR, { recursive: true });

console.log('\n[1] 執行 TS 版清洗...');
const startMs = Date.now();
const result = runCleaning({
  inputDir:  RAW_DIR,
  outputDir: TS_OUT_DIR,
  year:      2026,
  month:     3,
  gantries:  GANTRIES,
  onProgress(i, total, hourlyCount) {
    if (i % 100 === 0 || i === total) {
      process.stdout.write(`  ${i}/${total} 檔 | 彙總 ${hourlyCount} 列\n`);
    }
  },
});
const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`完成: ${result.file_count} 檔 | 掃描 ${result.scanned_rows.toLocaleString()} | 清洗 ${result.cleaned_rows.toLocaleString()} | 彙總 ${result.hourly_rows.toLocaleString()} | ${elapsed}s`);

console.log('\n[2] Diff 對比...');
const tsFiles = listAllCsv(TS_OUT_DIR);
const pyFiles = listAllCsv(BASELINE_DIR);
const pyMap = new Map(pyFiles.map(f => [`${f.sub}/${f.name}`, f]));
const tsMap = new Map(tsFiles.map(f => [`${f.sub}/${f.name}`, f]));

const diffs = [];
let pass = 0, fail = 0;

for (const [key, pyFile] of pyMap) {
  const tsFile = tsMap.get(key);
  if (!tsFile) {
    diffs.push({ key, status: 'MISSING', pyMd5: md5File(pyFile.full), tsMd5: '—', pyLines: '', tsLines: '' });
    fail++; continue;
  }
  const pyMd5 = md5File(pyFile.full);
  const tsMd5 = md5File(tsFile.full);
  const pyLines = fs.readFileSync(pyFile.full, 'utf8').split('\n').length - 1;
  const tsLines = fs.readFileSync(tsFile.full, 'utf8').split('\n').length - 1;
  const ok = pyMd5 === tsMd5;
  diffs.push({ key, status: ok ? 'PASS' : 'FAIL', pyMd5, tsMd5, pyLines, tsLines });
  if (ok) pass++; else fail++;
}
for (const [key] of tsMap) {
  if (!pyMap.has(key)) diffs.push({ key, status: 'EXTRA', pyMd5: '—', tsMd5: '—', pyLines: '', tsLines: '' });
}

const OVERALL = fail === 0 ? 'PASS' : 'FAIL';
const reportLines = [
  `# Baseline Compliance Report — ${today}`,
  '',
  `> **總結：${OVERALL}** (PASS: ${pass} / FAIL: ${fail} / 總: ${pass + fail})`,
  '',
  '## 清洗統計', '',
  '| 指標 | 數值 |', '|---|---|',
  `| 原始檔案數 | ${result.file_count} |`,
  `| 掃描筆數 | ${result.scanned_rows.toLocaleString()} |`,
  `| 清洗筆數 | ${result.cleaned_rows.toLocaleString()} |`,
  `| 小時彙總列 | ${result.hourly_rows.toLocaleString()} |`,
  `| 執行時間 | ${elapsed}s |`,
  '',
  '## 逐檔 md5 對比', '',
  '| 檔案 | 狀態 | 行數(py) | 行數(ts) | md5(py)[:8] | md5(ts)[:8] |',
  '|---|---|---|---|---|---|',
];
for (const r of diffs) {
  const statusLabel = r.status === 'PASS' ? 'OK PASS' : r.status === 'FAIL' ? 'FAIL' : r.status;
  reportLines.push(`| \`${r.key}\` | ${statusLabel} | ${r.pyLines} | ${r.tsLines} | \`${String(r.pyMd5).slice(0,8)}\` | \`${String(r.tsMd5).slice(0,8)}\` |`);
}
if (fail > 0) {
  reportLines.push('', '## 失敗詳細', '');
  for (const r of diffs.filter(d => d.status === 'FAIL')) {
    reportLines.push(`### ${r.key}`, `- py: \`${r.pyMd5}\``, `- ts: \`${r.tsMd5}\``);
  }
}

fs.writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf8');
console.log(`\n報告：${REPORT_PATH}`);
console.log(`結果：${OVERALL} (PASS: ${pass}, FAIL: ${fail})`);

process.exit(fail > 0 ? 1 : 0);
