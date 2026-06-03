#!/usr/bin/env node
/**
 * M5 Baseline 對齊 Runner
 *
 * 用 TS 版 tdcs-clean.ts 清洗 raw_202603/，輸出到 /tmp/ts_cleaned/，
 * 再逐檔 md5 對比 Python 版 ground truth（cleaned_202603/）。
 *
 * 使用方式：
 *   node scripts/run_clean_202603.mjs
 *
 * 注意：需先 npm run build 以確保 dist/lib/ 存在。
 * 本腳本直接 import 已編譯的 dist 版（ESM）。
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import compiled tdcs-clean from dist
const __filename = fileURLToPath(import.meta.url);
const cliRoot = path.join(path.dirname(__filename), '..');

// Since we're using the built version, we need to build first.
// Let's dynamically import from dist
const { runCleaning } = await import(
  path.join(cliRoot, 'dist', 'lib', 'tdcs-clean.js').replace(/\\/g, '/')
);

const RAW_DIR      = path.resolve(cliRoot, '../../step0_s3_download/raw_202603');
const BASELINE_DIR = path.resolve(cliRoot, '../../step1_cleaning/cleaned_202603');
const TS_OUT_DIR   = path.join(os.tmpdir(), 'ts_cleaned');
const REPORT_PATH  = path.join(cliRoot, 'tests', `baseline_compliance_${new Date().toISOString().slice(0,10)}.md`);

const GANTRIES = ['01F2930N', '01F2930S', '01F3019N', '01F3019S'];

function md5File(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

function listAllCsv(dir) {
  const results = [];
  for (const sub of ['monthly', 'weekly', 'daily']) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const f of fs.readdirSync(subDir).sort()) {
      if (f.endsWith('.csv')) {
        results.push({ sub, name: f, full: path.join(subDir, f) });
      }
    }
  }
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('=== M5 Baseline 對齊 ===');
console.log('RAW:      ', RAW_DIR);
console.log('BASELINE: ', BASELINE_DIR);
console.log('TS_OUT:   ', TS_OUT_DIR);

// Clean previous output
if (fs.existsSync(TS_OUT_DIR)) {
  fs.rmSync(TS_OUT_DIR, { recursive: true });
}

// Run TS cleaning
console.log('\n[1] 執行 TS 版清洗...');
const result = runCleaning({
  inputDir:  RAW_DIR,
  outputDir: TS_OUT_DIR,
  year:      2026,
  month:     3,
  gantries:  GANTRIES,
  onProgress(i, total, hourlyCount) {
    console.log(`  ${i}/${total} 檔 | 彙總 ${hourlyCount} 列`);
  },
});
console.log(`TS 清洗完成: ${result.file_count} 檔 | 掃描 ${result.scanned_rows} | 清洗 ${result.cleaned_rows} | 彙總 ${result.hourly_rows}`);

// Compare
console.log('\n[2] Diff 對比...');
const tsFiles  = listAllCsv(TS_OUT_DIR);
const pyFiles  = listAllCsv(BASELINE_DIR);

const pyMap = new Map(pyFiles.map(f => [`${f.sub}/${f.name}`, f]));
const tsMap = new Map(tsFiles.map(f => [`${f.sub}/${f.name}`, f]));

const results = [];
let pass = 0;
let fail = 0;

// Check all Python baseline files exist in TS output
for (const [key, pyFile] of pyMap) {
  const tsFile = tsMap.get(key);
  if (!tsFile) {
    results.push({ key, status: 'MISSING_IN_TS', pyMd5: md5File(pyFile.full), tsMd5: '—', pyLines: '', tsLines: '' });
    fail++;
    continue;
  }
  const pyMd5 = md5File(pyFile.full);
  const tsMd5 = md5File(tsFile.full);
  const pyLines = String(fs.readFileSync(pyFile.full, 'utf8').split('\n').length - 1);
  const tsLines = String(fs.readFileSync(tsFile.full, 'utf8').split('\n').length - 1);
  const ok = pyMd5 === tsMd5;
  results.push({ key, status: ok ? 'PASS' : 'FAIL', pyMd5, tsMd5, pyLines, tsLines });
  if (ok) pass++; else fail++;
}

// Check for TS-only files
for (const [key] of tsMap) {
  if (!pyMap.has(key)) {
    results.push({ key, status: 'EXTRA_IN_TS', pyMd5: '—', tsMd5: '—', pyLines: '', tsLines: '' });
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

const OVERALL = fail === 0 ? '✅ PASS' : '❌ FAIL';
const lines = [
  `# Baseline Compliance Report — ${new Date().toISOString().slice(0,10)}`,
  '',
  `> **總結：${OVERALL}** (PASS: ${pass} / FAIL: ${fail} / 總: ${pass + fail})`,
  '',
  '## 清洗統計',
  '',
  `| 指標 | 數值 |`,
  `|---|---|`,
  `| 原始檔案數 | ${result.file_count} |`,
  `| 掃描筆數 | ${result.scanned_rows.toLocaleString()} |`,
  `| 清洗筆數 | ${result.cleaned_rows.toLocaleString()} |`,
  `| 小時彙總列 | ${result.hourly_rows.toLocaleString()} |`,
  '',
  '## 逐檔 md5 對比',
  '',
  '| 檔案 | 狀態 | 行數(py) | 行數(ts) | md5(py) | md5(ts) |',
  '|---|---|---|---|---|---|',
];

for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
  lines.push(`| \`${r.key}\` | ${icon} ${r.status} | ${r.pyLines} | ${r.tsLines} | \`${r.pyMd5.slice(0,8)}...\` | \`${r.tsMd5.slice(0,8)}...\` |`);
}

if (fail > 0) {
  lines.push('', '## 失敗檔案詳細 md5', '');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    lines.push(`### ${r.key}`);
    lines.push(`- py: \`${r.pyMd5}\``);
    lines.push(`- ts: \`${r.tsMd5}\``);
  }
}

const reportMd = lines.join('\n');
fs.writeFileSync(REPORT_PATH, reportMd, 'utf8');
console.log(`\n報告：${REPORT_PATH}`);
console.log(`結果：${OVERALL} (PASS: ${pass}, FAIL: ${fail})`);

process.exit(fail > 0 ? 1 : 0);
