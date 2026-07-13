#!/usr/bin/env bash
# Compile the Tailwind stylesheet to the shared local asset. Run this whenever
# styles/app.css, the Tailwind config, or the utility classes in render.py /
# explorer.js change. Data rebuilds (build.py) do not need this step.
#
# Usage: styles/build-css.sh   (run from personal/investments/scripts)
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes tailwindcss@3 \
  -c styles/tailwind.config.js \
  -i styles/app.css \
  -o ../../_assets/personal.css \
  --minify
echo "Wrote ../_assets/personal.css"
