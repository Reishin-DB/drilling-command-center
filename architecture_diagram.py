"""LAS Viewer — Traditional Databricks Architecture Diagram"""
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.storage import S3
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.analytics import Databricks   # real Databricks stacked-bricks icon
from diagrams.custom import Custom

ICONS = "/Users/reishin.toolsi/demos/las-viewer/icons"

with Diagram(
    "LAS Viewer  |  Databricks App Architecture",
    show=False,
    filename="/Users/reishin.toolsi/demos/las-viewer/architecture",
    outformat="png",
    direction="LR",
    graph_attr={
        "splines":  "ortho",
        "nodesep":  "0.70",
        "ranksep":  "1.8",
        "pad":      "0.8",
        "fontsize": "16",
        "bgcolor":  "white",
        "dpi":      "150",
        "label":    "https://las-viewer-7474647106303257.aws.databricksapps.com",
        "labelloc": "b",
        "fontname": "Helvetica",
    },
    node_attr={
        "fontsize": "11",
        "fontname": "Helvetica",
    },
):
    # ── Data Sources ──────────────────────────────────────────────────────────
    with Cluster("Data Sources"):
        las_s3 = S3("LAS / DLIS\nFiles (S3)")

    # ── Databricks Lakehouse Platform ─────────────────────────────────────────
    with Cluster("Databricks Lakehouse Platform  |  Unity Catalog Governance"):

        uc = Custom("Unity Catalog\nGovernance & Lineage", f"{ICONS}/unity_catalog.png")

        with Cluster("Bronze  ·  las_raw"):
            bronze = Custom("Auto Loader\nIngestion\nRaw LAS volumes",
                            f"{ICONS}/delta_lake.png")

        with Cluster("Silver  ·  las_curated"):
            silver = Custom("DLT Pipeline\nDepth alignment · Despiking\nEnv corrections · Gap fill",
                            f"{ICONS}/delta_lake.png")

        with Cluster("Gold  ·  las_gold"):
            gold = Custom("ML-Derived Curves\nVCL · φ_eff · Sw\n(Archie equation)",
                          f"{ICONS}/delta_lake.png")

    # ── Serving Layer ─────────────────────────────────────────────────────────
    with Cluster("Serving Layer"):

        with Cluster("Lakebase  (Managed PostgreSQL 16)"):
            lakebase = PostgreSQL("las-viewer-db\nwells · depth_logs\nformation_tops\nqc_rules · recipes\nanomalies")

        with Cluster("Foundation Model API"):
            claude = Custom("claude-sonnet-4-5\nPetrophysics AI",
                            f"{ICONS}/model_serving.png")

    # ── Databricks App ────────────────────────────────────────────────────────
    with Cluster("Databricks App"):

        with Cluster("FastAPI Backend"):
            api = Databricks("/api/wells  /api/logs\n/api/qc  /api/recipes\n/api/advisor")

        with Cluster("React Frontend  (TypeScript / Vite)"):
            ui = Databricks("Wells Registry\nLog Viewer (7-track SVG)\nQC & Corrections\nRecipes  ·  AI Chat")

    # ── Consumers ─────────────────────────────────────────────────────────────
    with Cluster("Consumers"):
        engineers = Users("OFS Engineers\n& Petrophysicists")

    # ── Edges ─────────────────────────────────────────────────────────────────
    las_s3  >> Edge(label="Auto Loader\ningest")  >> bronze
    bronze  >> Edge(label="DLT clean")   >> silver
    silver  >> Edge(label="ML derive")   >> gold
    gold    >> Edge(label="Reverse ETL") >> lakebase

    uc >> Edge(style="dashed") >> bronze
    uc >> Edge(style="dashed") >> silver
    uc >> Edge(style="dashed") >> gold

    lakebase >> Edge(label="asyncpg") >> api
    claude   >> Edge(label="FMAPI")   >> api
    api      >> ui
    ui       >> Edge(label="browser") >> engineers

print("Done → /Users/reishin.toolsi/demos/las-viewer/architecture.png")
