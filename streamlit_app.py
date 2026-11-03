import base64
import gzip
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

# Remove default Streamlit padding, header bar, and footer so AgCensus IQ fills the viewport cleanly
# IMPORTANT: Do not indent HTML tags inside st.markdown, otherwise CommonMark treats 4-space indentation as a code block!
st.markdown(
    """<style>
#MainMenu {visibility: hidden !important;}
header[data-testid="stHeader"] {display: none !important;}
div[data-testid="stToolbar"] {display: none !important;}
div[data-testid="stDecoration"] {display: none !important;}
div[data-testid="stStatusWidget"] {display: none !important;}
footer {visibility: hidden !important; display: none !important;}
.stApp, section[data-testid="stMain"] {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background-color: #F3F4F6 !important;
}
.block-container,
.stMainBlockContainer,
div[data-testid="stMainBlockContainer"],
div[data-testid="stAppViewBlockContainer"] {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100vw !important;
    width: 100vw !important;
}
div[data-testid="stVerticalBlock"],
div[data-testid="stVerticalBlock"] > div,
div[data-testid="stElementContainer"] {
    padding: 0 !important;
    margin: 0 !important;
    gap: 0 !important;
}
iframe,
iframe[data-testid="stCustomComponentV1"] {
    display: block !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
    z-index: 9999 !important;
}
</style>""",
    unsafe_allow_html=True,
)

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"


@st.cache_data(show_spinner="Loading AgCensus IQ (Statistics Canada 2021 & 2016 Empirical Database)...")
def build_standalone_app_html() -> str:
    """
    Bundles the compiled Vite/React AgCensus IQ application and gzip-compressed
    Statistics Canada datasets into a self-contained HTML payload for Streamlit.
    """
    assets_dir = DIST_DIR / "assets"
    css_files = sorted(assets_dir.glob("*.css"))
    js_files = sorted(assets_dir.glob("*.js"))

    if not css_files or not js_files:
        raise FileNotFoundError(
            "Compiled frontend assets not found in ./dist/assets. Run `npm run build` first."
        )

    css_content = "\n".join(f.read_text(encoding="utf-8") for f in css_files)
    js_content = "\n".join(f.read_text(encoding="utf-8") for f in js_files)

    # Read and gzip-compress the two empirical JSON/GeoJSON files (~1.7 MB total compressed)
    census_json_path = PUBLIC_DATA_DIR / "ag_census_data.json"
    if not census_json_path.exists():
        census_json_path = DIST_DIR / "data" / "ag_census_data.json"

    boundaries_path = PUBLIC_DATA_DIR / "ag_boundaries.geojson"
    if not boundaries_path.exists():
        boundaries_path = DIST_DIR / "data" / "ag_boundaries.geojson"

    census_gz_b64 = base64.b64encode(
        gzip.compress(census_json_path.read_bytes(), compresslevel=6)
    ).decode("ascii")
    boundaries_gz_b64 = base64.b64encode(
        gzip.compress(boundaries_path.read_bytes(), compresslevel=6)
    ).decode("ascii")

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
      // Embedded gzip-compressed empirical datasets for standalone Streamlit Cloud execution
      const __EMBEDDED_GZ_FILES__ = {{
        "/data/ag_census_data.json": "{census_gz_b64}",
        "/data/ag_boundaries.geojson": "{boundaries_gz_b64}"
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
        const url = typeof input === "string" ? input : (input && input.url) || "";
        for (const [targetPath, b64Payload] of Object.entries(__EMBEDDED_GZ_FILES__)) {{
          if (url === targetPath || url.endsWith(targetPath)) {{
            const buffer = await __decompressGzipBase64(b64Payload);
            return new Response(buffer, {{
              status: 200,
              headers: {{ "Content-Type": "application/json" }}
            }});
          }}
        }}
        return __origFetch(input, init);
      }};
    </script>
  </head>
  <body class="bg-[#F3F4F6] text-[#1E293B] antialiased selection:bg-[#0F3D6E] selection:text-white" style="margin:0;padding:0;overflow:hidden;">
    <div id="root"></div>
    <script type="module">
{js_content}
    </script>
  </body>
</html>"""
    return html


app_html = build_standalone_app_html()
components.html(app_html, height=980, scrolling=True)
