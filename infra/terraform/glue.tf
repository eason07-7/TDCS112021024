# -----------------------------------------------------------------------
# M5 — Glue Data Catalog
# database: tdcs_dl
# table: cleaned_v2_skeleton（空 skeleton、PLAN_E9 寫 Parquet 後 MSCK REPAIR）
# -----------------------------------------------------------------------

resource "aws_glue_catalog_database" "tdcs_dl" {
  name        = "tdcs_dl"
  description = "TDCS CLI 清洗結果資料庫（Parquet、按 yyyymm 分區）"
}

resource "aws_glue_catalog_table" "cleaned_v2_skeleton" {
  name          = "cleaned_v2_skeleton"
  database_name = aws_glue_catalog_database.tdcs_dl.name

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
  }

  storage_descriptor {
    location      = "s3://${var.bucket_name}/cleaned_v2/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    # Columns aligned with cli/src/lib/tdcs-clean.types.ts HourlyRowWithWeek
    # CamelCase → snake_case (Parquet/Athena convention)
    # Source of truth: HourlyRowWithWeek = HourlyRow + WeekIndex
    columns {
      name = "year"
      type = "int"
    }
    columns {
      name = "month"
      type = "int"
    }
    columns {
      name = "day"
      type = "int"
    }
    columns {
      name = "weekday"
      type = "int"
    }
    columns {
      name = "hour_0"
      type = "int"
    }
    # GantryID_O (renamed from TargetGantry in HourlyRow)
    columns {
      name = "gantry_id_o"
      type = "string"
    }
    columns {
      name = "vehicle_type"
      type = "int"
    }
    columns {
      name = "counts"
      type = "int"
    }
    columns {
      name = "week_index"
      type = "int"
    }
  }

  # Partition key: yyyymm (e.g. "202603")
  # PLAN_E9 writes cleaned_v2/yyyymm=202603/*.parquet
  # then runs: MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton
  partition_keys {
    name = "yyyymm"
    type = "string"
  }
}
