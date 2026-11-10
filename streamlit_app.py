import base64
import gzip
import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

# Configure full-bleed wide layout for AgCensus IQ
st.set_page_config(
    page_title="AgCensus IQ | Canadian Census of Agriculture Intelligence Platform (OFA)",
    page_icon="🌾",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Remove default Streamlit chrome and outer padding while keeping compact download bar + iframe clean
st.markdown(
    """<style>
#MainMenu {visibility: hidden !important;}
header[data-testid="stHeader"] {display: none !important;}
div[data-testid="stToolbar"] {display: none !important;}
div[data-testid="stDecoration"] {display: none !important;}
footer {display: none !important;}
.block-container,
div[data-testid="stMainBlockContainer"],
div[data-testid="stAppViewBlockContainer"] {
    padding-top: 0.15rem !important;
    padding-bottom: 0rem !important;
    padding-left: 0.35rem !important;
    padding-right: 0.35rem !important;
    max-width: 100% !important;
}
div[data-testid="stExpander"] {
    margin-bottom: 0.2rem !important;
    border-radius: 6px !important;
}
div[data-testid="stExpander"] summary {
    padding-top: 0.25rem !important;
    padding-bottom: 0.25rem !important;
    font-size: 0.78rem !important;
    font-weight: 700 !important;
    color: #0F3D6E !important;
}
iframe[title="streamlit.components.v1.html"],
iframe[title="st.iframe"] {
    display: block !important;
    width: 100% !important;
    height: calc(100vh - 42px) !important;
    border: none !important;
}
</style>""",
    unsafe_allow_html=True,
)

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DOWNLOADS_DIR = ROOT_DIR / "public" / "downloads" / "county_profiles_2_0"


def _load_gzipped_b64(filename: str) -> str:
    """
    Loads a pre-compressed .gz asset from public/data (or dist/data) if available
    and up-to-date, otherwise reads and gzip-compresses the raw JSON/GeoJSON file.
    """
    for base_dir in (PUBLIC_DATA_DIR, DIST_DIR / "data"):
        raw_path = base_dir / filename
        gz_path = base_dir / f"{filename}.gz"
        if gz_path.exists() and (
            not raw_path.exists() or gz_path.stat().st_mtime >= raw_path.stat().st_mtime
        ):
            return base64.b64encode(gz_path.read_bytes()).decode("ascii")
        if raw_path.exists():
            return base64.b64encode(
                gzip.compress(raw_path.read_bytes(), compresslevel=6)
            ).decode("ascii")
    raise FileNotFoundError(f"Required empirical dataset not found: {filename}")


@st.cache_data(show_spinner=False)
def load_profiles_download_index() -> list[dict[str, str]]:
    """
    Builds a lightweight catalog of the 65 OFA County, Zone, and Provincial Profile 2.0
    workbooks (.xlsx) and fact sheets (.pdf) for native Streamlit downloads.
    """
    json_path = PUBLIC_DATA_DIR / "ofa_county_profiles_2_0.json"
    if not json_path.exists():
        json_path = DIST_DIR / "data" / "ofa_county_profiles_2_0.json"
    if not json_path.exists():
        return []

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    profiles = payload.get("profiles", {})
    ordered_ids: list[str] = []
    ont_id = payload.get("ontarioId")
    if ont_id and ont_id in profiles:
        ordered_ids.append(ont_id)
    for zid in payload.get("zoneOrder", []):
        if zid in profiles:
            ordered_ids.append(zid)
    for cid in payload.get("cdOrder", []):
        if cid in profiles:
            ordered_ids.append(cid)

    items: list[dict[str, str]] = []
    for pid in ordered_ids:
        p = profiles[pid]
        xlsx_name = p.get("excelFilename", "")
        pdf_name = xlsx_name.replace(".xlsx", ".pdf")
        ptype = p.get("type", "CD")
        prefix = "Province" if ptype == "PROVINCE" else ("OFA Zone" if ptype == "OFA_ZONE" else "County/District")
        items.append(
            {
                "id": pid,
                "label": f"[{prefix}] {p.get('name', pid)}",
                "xlsx_name": xlsx_name,
                "pdf_name": pdf_name,
            }
        )
    return items


@st.cache_data(
    show_spinner="Loading AgCensus IQ (Statistics Canada 2021 & 2016 + OFA Profiles 2.0 Empirical Database)..."
)
def build_standalone_app_html() -> str:
    """
    Bundles the multi-chunk Vite/React AgCensus IQ application (linked via a standard
    ES Module Import Map + Blob URLs) and all three gzip-compressed empirical datasets
    into a self-contained HTML payload for Streamlit Cloud.
    """
    assets_dir = DIST_DIR / "assets"
    index_html_path = DIST_DIR / "index.html"
    css_files = sorted(assets_dir.glob("*.css"))
    js_files = sorted(assets_dir.glob("*.js"))

    if not index_html_path.exists() or not css_files or not js_files:
        raise FileNotFoundError(
            "Compiled frontend assets not found in ./dist. Run `npm run build` first."
        )

    index_html_text = index_html_path.read_text(encoding="utf-8")
    entry_match = re.search(r'src="[^"]*?/assets/(index-[^"]+\.js)"', index_html_text)
    if entry_match:
        entry_chunk_name = entry_match.group(1)
    else:
        index_candidates = [f.name for f in js_files if f.name.startswith("index-")]
        entry_chunk_name = index_candidates[0] if index_candidates else js_files[0].name

    css_content = "\n".join(f.read_text(encoding="utf-8") for f in css_files)

    # Rewrite relative "./<chunk>.js" specifiers across all chunks to bare specifiers
    # ("__ag_chunk__/<chunk>.js") resolved via a standard <script type="importmap">
    chunk_names = [f.name for f in js_files]
    rewritten_chunks: dict[str, str] = {}
    for jf in js_files:
        src = jf.read_text(encoding="utf-8")
        for target_name in chunk_names:
            src = src.replace(f'"./{target_name}"', f'"__ag_chunk__/{target_name}"')
            src = src.replace(f"'./{target_name}'", f"'__ag_chunk__/{target_name}'")
        rewritten_chunks[jf.name] = src

    # Escape "</" so "</script>" inside any JS string literal never closes the inline <script>
    chunks_json_safe = json.dumps(rewritten_chunks).replace("</", "<\\/")

    # Embed all three empirical JSON/GeoJSON datasets (~3.0 MB total gzipped)
    census_gz_b64 = _load_gzipped_b64("ag_census_data.json")
    boundaries_gz_b64 = _load_gzipped_b64("ag_boundaries.geojson")
    profiles_gz_b64 = _load_gzipped_b64("ofa_county_profiles_2_0.json")

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgCensus IQ | Canadian Census of Agriculture Intelligence Platform (OFA)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
{css_content}
    </style>
    <script>
      // 1. Embedded gzip-compressed empirical datasets for standalone Streamlit Cloud execution
      const __EMBEDDED_GZ_FILES__ = {{
        "/data/ag_census_data.json": "{census_gz_b64}",
        "/data/ag_boundaries.geojson": "{boundaries_gz_b64}",
        "/data/ofa_county_profiles_2_0.json": "{profiles_gz_b64}"
      }};

      async function __decompressGzipBase64(b64Data) {{
        const binaryString = atob(b64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {{
          bytes[i] = binaryString.charCodeAt(i);
        }}
        const ds = new DecompressionStream("gzip");
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        return new Response(ds.readable).arrayBuffer();
      }}

      const __origFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {{
        const rawUrl = typeof input === "string" ? input : (input && input.url) || "";
        const cleanUrl = rawUrl.split("?")[0];
        for (const [targetPath, b64Payload] of Object.entries(__EMBEDDED_GZ_FILES__)) {{
          if (cleanUrl === targetPath || cleanUrl.endsWith(targetPath)) {{
            const buffer = await __decompressGzipBase64(b64Payload);
            return new Response(buffer, {{
              status: 200,
              headers: {{ "Content-Type": "application/json" }}
            }});
          }}
        }}
        return __origFetch(input, init);
      }};

      // 2. Register Blob URLs + ES Module Import Map synchronously before any module script runs
      const __VITE_CHUNKS__ = {chunks_json_safe};
      const __importMapEntries = {{}};
      for (const [fname, code] of Object.entries(__VITE_CHUNKS__)) {{
        const blob = new Blob([code], {{ type: "text/javascript" }});
        __importMapEntries["__ag_chunk__/" + fname] = URL.createObjectURL(blob);
      }}
      const __importMapScript = document.createElement("script");
      __importMapScript.type = "importmap";
      __importMapScript.textContent = JSON.stringify({{ imports: __importMapEntries }});
      document.head.appendChild(__importMapScript);

      // 3. Intercept static /downloads/county_profiles_2_0/ links when running inside about:srcdoc
      document.addEventListener("click", function(ev) {{
        if (window.location.protocol !== "about:") return;
        const anchor = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (href.indexOf("downloads/county_profiles_2_0/") !== -1) {{
          ev.preventDefault();
          let toast = document.getElementById("__st_dl_toast");
          if (!toast) {{
            toast = document.createElement("div");
            toast.id = "__st_dl_toast";
            toast.style.cssText =
              "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;" +
              "background:#0F3D6E;color:#FFFFFF;padding:10px 16px;border-radius:8px;" +
              "box-shadow:0 10px 25px rgba(15,23,42,0.35);font-size:12px;font-weight:600;" +
              "display:flex;align-items:center;gap:12px;max-width:680px;border:1px solid #328475;";
            document.body.appendChild(toast);
          }}
          toast.innerHTML =
            "<span>📥 <strong>Streamlit Cloud Download Bar:</strong> Click the <em>&ldquo;OFA County &amp; Zone Profiles 2.0 — Direct Excel, PDF &amp; ZIP Downloads&rdquo;</em> bar right above the app header to download this file.</span>" +
            "<button type='button' style='background:rgba(255,255,255,0.16);border:none;color:#fff;padding:3px 8px;border-radius:4px;cursor:pointer;font-weight:700;' onclick='this.parentElement.remove()'>✕</button>";
        }}
      }}, true);
    </script>
  </head>
  <body class="bg-[#F3F4F6] text-[#1E293B] antialiased selection:bg-[#0F3D6E] selection:text-white" style="margin:0;padding:0;overflow:hidden;">
    <div id="root"></div>
    <script type="module">
      import "__ag_chunk__/{entry_chunk_name}";
    </script>
  </body>
</html>"""
    return html


# Render compact collapsible Streamlit download bar for OFA Profile 2.0 Excel/PDF/ZIP deliverables
if DOWNLOADS_DIR.exists():
    profile_items = load_profiles_download_index()
    with st.expander(
        "📥 OFA County & Zone Profiles 2.0 — Direct Excel (.xlsx), PDF Fact Sheet & Master ZIP Downloads",
        expanded=False,
    ):
        c_sel, c_xlsx, c_pdf, c_zip_x, c_zip_p = st.columns([2.6, 1.25, 1.25, 1.35, 1.35])
        selected_item = None
        if profile_items:
            labels = [it["label"] for it in profile_items]
            default_idx = next(
                (i for i, it in enumerate(profile_items) if "Huron" in it["label"]), 0
            )
            chosen_label = c_sel.selectbox(
                "Select Ontario County, OFA Zone, or Province",
                options=labels,
                index=default_idx,
                label_visibility="collapsed",
            )
            selected_item = next(
                (it for it in profile_items if it["label"] == chosen_label), profile_items[0]
            )

        if selected_item:
            xlsx_path = DOWNLOADS_DIR / selected_item["xlsx_name"]
            pdf_path = DOWNLOADS_DIR / "pdf" / selected_item["pdf_name"]
            if xlsx_path.exists():
                c_xlsx.download_button(
                    label="📊 Excel (.xlsx)",
                    data=xlsx_path.read_bytes(),
                    file_name=selected_item["xlsx_name"],
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True,
                )
            if pdf_path.exists():
                c_pdf.download_button(
                    label="📄 Fact Sheet (.pdf)",
                    data=pdf_path.read_bytes(),
                    file_name=selected_item["pdf_name"],
                    mime="application/pdf",
                    use_container_width=True,
                )

        zip_xlsx_path = DOWNLOADS_DIR / "OFA_County_and_Zone_Profiles_2_0_All_65_Workbooks.zip"
        zip_pdf_path = DOWNLOADS_DIR / "OFA_County_and_Zone_Profiles_2_0_All_65_FactSheets_PDF.zip"
        if zip_xlsx_path.exists():
            c_zip_x.download_button(
                label="📦 All 65 Excel (.zip)",
                data=zip_xlsx_path.read_bytes(),
                file_name=zip_xlsx_path.name,
                mime="application/zip",
                use_container_width=True,
            )
        if zip_pdf_path.exists():
            c_zip_p.download_button(
                label="📦 All 65 PDFs (.zip)",
                data=zip_pdf_path.read_bytes(),
                file_name=zip_pdf_path.name,
                mime="application/zip",
                use_container_width=True,
            )

app_html = build_standalone_app_html()
components.html(app_html, height=940, scrolling=True)
