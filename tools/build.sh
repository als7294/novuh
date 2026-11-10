#!/bin/sh
# Bundle space.js + the parts of Three.js it uses into app.js (tree-shaken, minified).
# Run from the repo root; builds in a temp dir so node_modules never lands in the repo.
set -e
B=$(mktemp -d); here=$(pwd)
cd "$B" && npm init -y >/dev/null && npm i -s three@0.160.0 esbuild@0.24.0 >/dev/null
sed "s#from './vendor/three.module.min.js'#from 'three'#" "$here/space.js" > space.src.js
npx esbuild space.src.js --bundle --minify --format=esm --target=es2020 --outfile="$here/app.js" --log-level=warning
echo "built app.js; bump the ?v= on app.js in index.html"
