# B-3 FULL 段 + Q1~Q4 對帳（15~30 分鐘）
# 用法：複製整個內容 → 貼到 PowerShell，執行

# ==================== 設定 ====================
$envFile = "D:\p\112021134\.env"
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#].*=.*" } | ForEach-Object { 
    $k, $v = $_ -split "=", 2
    [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}
$env:AWS_ACCESS_KEY_ID = $env:aws_access_key_id
$env:AWS_SECRET_ACCESS_KEY = $env:aws_secret_access_key
$env:AWS_SESSION_TOKEN = $env:aws_session_token
$env:AWS_DEFAULT_REGION = "us-east-1"

cd D:\p\TDCSprecentater\ai_workspace\cloud

# ==================== 執行 FULL 段 + Q1~Q4 ====================

python << 'PYTHON_EOF'
import boto3, os, time
from dotenv import load_dotenv

load_dotenv(r'D:\p\112021134\.env')
client = boto3.client('athena', region_name=os.environ.get('AWS_DEFAULT_REGION','us-east-1'))
BUCKET = '112021134trafficdatacollectionsyste'

print('=' * 60)
print('FULL 段：所有 16 個月彙總')
print('=' * 60)

full_sql = """CREATE TABLE tdcs.m03a_hourly_2025_2026
WITH (
    format                = 'PARQUET',
    external_location     = 's3://112021134trafficdatacollectionsyste/cleaned_v3_m03a/',
    partitioned_by        = ARRAY['yyyymm']
) AS
SELECT
    CAST(SUBSTR(time_interval, 1, 10) AS DATE)   AS dt,
    CAST(SUBSTR(time_interval, 12, 2) AS INT)     AS hour,
    gantry_id,
    direction,
    vehicle_type,
    SUM(flow)                                     AS hourly_flow,
    COUNT(*)                                      AS slot_count,
    yyyymm
FROM tdcs.m03a_raw
WHERE gantry_id IN ('05F0287N','05F0055N','05F0287S','05F0055S')
GROUP BY
    SUBSTR(time_interval, 1, 10),
    SUBSTR(time_interval, 12, 2),
    gantry_id,
    direction,
    vehicle_type,
    yyyymm"""

resp = client.start_query_execution(
    QueryString=full_sql,
    QueryExecutionContext={'Database':'tdcs'},
    ResultConfiguration={'OutputLocation':f's3://{BUCKET}/athena-results/'}
)
eid_full = resp['QueryExecutionId']
print(f'Started: {eid_full}')

start = time.time()
while True:
    state = client.get_query_execution(QueryExecutionId=eid_full)['QueryExecution']['Status']['State']
    elapsed = int(time.time() - start)
    print(f'  [{elapsed}s] Status: {state}', end='\r')
    if state in ('SUCCEEDED','FAILED','CANCELLED'): break
    time.sleep(10)

print(f'\nFULL: {state} ({int(time.time()-start)}s)\n')

if state == 'SUCCEEDED':
    queries = {
        'Q1: 各月筆數': """SELECT yyyymm, COUNT(*) AS rows, COUNT(DISTINCT gantry_id) AS gantries, COUNT(DISTINCT dt) AS days, SUM(hourly_flow) AS total_flow FROM tdcs.m03a_hourly_2025_2026 GROUP BY yyyymm ORDER BY yyyymm""",
        'Q2: 202501 完整性': """SELECT gantry_id, direction, COUNT(DISTINCT dt) AS days, COUNT(*) AS hourly_rows, SUM(hourly_flow) AS total_flow, MIN(slot_count) AS min_slots, MAX(slot_count) AS max_slots FROM tdcs.m03a_hourly_2025_2026 WHERE yyyymm='202501' GROUP BY gantry_id, direction ORDER BY gantry_id""",
        'Q3: slot_count 分布': """SELECT slot_count, COUNT(*) AS n FROM tdcs.m03a_hourly_2025_2026 GROUP BY slot_count ORDER BY slot_count DESC""",
        'Q4: 2025年全期4站流量': """SELECT gantry_id, SUM(hourly_flow) AS total_flow_2025 FROM tdcs.m03a_hourly_2025_2026 WHERE yyyymm BETWEEN '202501' AND '202512' GROUP BY gantry_id ORDER BY gantry_id""",
    }
    
    for qname, qsql in queries.items():
        print(f'\n=== {qname} ===')
        resp_q = client.start_query_execution(
            QueryString=qsql,
            QueryExecutionContext={'Database':'tdcs'},
            ResultConfiguration={'OutputLocation':f's3://{BUCKET}/athena-results/'}
        )
        eid_q = resp_q['QueryExecutionId']
        
        for _ in range(120):
            state_q = client.get_query_execution(QueryExecutionId=eid_q)['QueryExecution']['Status']['State']
            if state_q in ('SUCCEEDED','FAILED'): break
            time.sleep(2)
        
        if state_q == 'SUCCEEDED':
            rows = client.get_query_results(QueryExecutionId=eid_q)
            for i, row in enumerate(rows['ResultSet']['Rows'][:30]):
                print('  ' + ' | '.join([str(c.get('VarCharValue',''))[:25] for c in row['Data']]))
        else:
            print(f'  FAILED: {state_q}')

print('\n' + '='*60)
print('B-3 CTAS 完成')
print('='*60)
PYTHON_EOF
