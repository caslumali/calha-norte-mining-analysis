# Calha Norte Mining Analysis

Multitemporal geospatial analysis of illegal mining sites in the Calha Norte region of the Brazilian Amazon, based on satellite imagery interpretation, territorial mapping, and cross-referencing with public documentary sources.

---

## Overview

This repository presents a curated public subset of a broader geospatial investigation of illegal mining sites across the Calha Norte region.

The work focused on:

- locating and documenting mining areas in protected territories
- comparing satellite imagery across time to identify landscape changes
- organizing spatial evidence from multiple local case studies
- producing maps that support territorial diagnosis and documentation

This is a public case-study repository centered on method, maps, and image interpretation.

---

## Study area

The Calha Norte region spans a large protected mosaic in northern Amazonia, including Indigenous Territories, conservation units, and frontier zones affected by historical and ongoing mining activity.

The selected cases in this repository focus on areas such as:

- Lourenco
- Iratapuru
- 13 de Maio
- Independencia
- Rio Camu

---

## Analytical approach

The analysis combined:

- Landsat and Sentinel-2 image inspection
- multitemporal comparison of mining sites
- territorial mapping
- cross-referencing with public reports, police operations, press coverage, and institutional documentation

The main value of the workflow is not a complex modelling pipeline, but the combination of remote-sensing interpretation with manually assembled territorial evidence.

---

## Public contents

This repository contains:

- selected Earth Engine apps used to inspect and export imagery
- a curated set of final maps

Current structure:

```text
calha-norte-mining-analysis/
|-- maps/
|-- scripts/
|   `-- gee_apps/
|-- README.md
`-- .gitignore
```

---

## GEE tools

The scripts in `scripts/gee_apps/` are interactive Earth Engine tools used to:

- filter Landsat and Sentinel-2 imagery by date and map extent
- switch between visualization modes
- apply cloud-cover filtering and inspect scene metadata
- overlay Calha Norte mining sites, mining zones, and hydrography
- export selected scenes for cartographic interpretation

Current public tools:

- `01_landsat_explorer.js`
- `02_sentinel2_explorer.js`

These scripts should be read as working tools for image inspection and export, not as standalone analytical pipelines.

---

## Data sources

The workflow draws on a mix of spatial and documentary sources, including:

- Landsat
- Sentinel-2
- mining-site inventories and territorial reference layers
- hydrography and territorial reference layers
- public institutional documents
- reports of police operations
- press sources and other public records

---

## Selected maps

### Regional context

![Protected areas in the Calha Norte region](maps/01_CalhaNorte_APs.png)

Protected areas and territorial context in the Calha Norte region.

![Mining zones in the study area](maps/02_CalhaNorte_Zonas_Garimpo.png)

Overview of mining zones discussed in the analysis.

### Local case studies

![Lourenco multitemporal analysis](maps/03_Lourenco_1991-2016-2022.png)

Multitemporal view of the Lourenco mining area.

![Iratapuru multitemporal analysis](maps/04_Iratapuru_1988-2009-2024.png)

Multitemporal view of mining activity in the Iratapuru area.

![13 de Maio historical comparison](maps/06_13_de_maio-2024.png)

Recent view from a longer historical sequence used to document changes in the 13 de Maio mining area.

![Independencia mining area](maps/07_Independencia-1997-2009-2019-2024.png)

Mining activity in the Independencia area.

![Rio Camu mining area](maps/09_Rio_Camu_2009-2024.png)

Mining activity documented in the Rio Camu area.

---

## Notes on scope

This public repository is intentionally selective. It focuses on the analytical logic, the image-inspection tools, and a curated set of maps, rather than reproducing the full original investigation.
