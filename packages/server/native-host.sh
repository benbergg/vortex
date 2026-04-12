#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/dist/bin/vortex-server.js"
