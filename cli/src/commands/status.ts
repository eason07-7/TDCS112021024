/**
 * tdcs-dl status <jobId> — query job progress via API Gateway
 *
 * Hits GET <endpoint>/jobs/<jobId> (PLAN_E7 deployed endpoint).
 * Uses three-layer priority for endpoint: env > file > default (resolveEndpoint).
 */
import { Command } from 'commander';
import { resolveEndpoint } from '../lib/config';
import { readJobRecord } from '../lib/job-metadata';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <jobId>')
    .description('查詢 job 進度（讀 jobs/<jobId>.json via API GW）')
    .action(async (jobId: string) => {
      const { value: endpoint, source } = resolveEndpoint();

      try {
        const record = await readJobRecord(endpoint, jobId);

        if (record === null) {
          console.error(`✗ job 不存在：${jobId}`);
          console.error(`  endpoint: ${endpoint} [${source}]`);
          process.exitCode = 1;
          return;
        }

        console.log(`job_id  : ${record.job_id}`);
        console.log(`status  : ${record.status}`);
        console.log(`time    : ${record.timestamp}`);
        if (record.totalFiles !== undefined) console.log(`files   : ${record.totalFiles}`);
        if (record.totalBytes !== undefined) console.log(`bytes   : ${record.totalBytes}`);
        if (record.error !== undefined)      console.log(`error   : ${record.error}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`✗ status 查詢失敗：${msg}`);
        process.exitCode = 1;
      }
    });
}
