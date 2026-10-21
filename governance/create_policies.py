"""
Create the persona table and policy functions (governance/policies.sql) with
Spark, as a job task, before the pipeline declares them on its gold tables.

    python governance/create_policies.py --catalog <c> --schema <s>
"""
import argparse
import inspect
import os
import re

from pyspark.sql import SparkSession

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(inspect.getsourcefile(lambda: 0))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", required=True)
    a = ap.parse_args()
    fq = f"{a.catalog}.{a.schema}"
    spark = SparkSession.builder.getOrCreate()
    sql = re.sub(r"--[^\n]*", "", open(os.path.join(ROOT, "governance", "policies.sql")).read())
    for stmt in [s.strip() for s in sql.replace("${schema}", fq).split(";") if s.strip()]:
        spark.sql(stmt)
        print("ok:", stmt.splitlines()[0][:90])


if __name__ == "__main__":
    main()
