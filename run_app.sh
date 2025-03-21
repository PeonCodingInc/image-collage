#!/bin/bash

# Prevent Git Bash from converting paths
export MSYS_NO_PATHCONV=1

# Ensure at least one argument is provided
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <input_directory> <output_directory> [extra_flags]"
    docker run --rm imagecollage-app --help
    exit 1
fi

# Capture additional flags
EXTRA_FLAGS="${@:3}"

# Check for help flag
if [[ "$EXTRA_FLAGS" == *"-h"* ]] || [[ "$EXTRA_FLAGS" == *"--help"* ]]; then
    docker run --rm imagecollage-app --help
    exit 0
fi

# Check if input directory exists
if [ ! -d "$1" ]; then
    echo "Error: Input directory '$1' does not exist!"
    exit 1
fi

# Check if output directory exists
if [ ! -d "$2" ]; then
    echo "Error: Output directory '$2' does not exist!"
    exit 1
fi

# Convert Windows-style paths to Docker-friendly paths for Docker mounting
fix_path() {
    local input_path="$1"
    local abs_path
    if [[ "$input_path" == /* ]]; then
        abs_path="$input_path"
    else
        abs_path=$(realpath "$input_path")
    fi
    echo "$abs_path" | sed 's#\\#/#g' | sed 's#^\([A-Za-z]\):#/mnt/\L\1#g'
}

INPUT_DIR=$(fix_path "$1")
OUTPUT_DIR=$(fix_path "$2")

# Log the paths for verification
echo "Input Directory: $INPUT_DIR"
echo "Output Directory: $OUTPUT_DIR"

# Run the container
docker run --rm \
    -v "$1":/app/input \
    -v "$2":/app/output \
    imagecollage-app -d "/app/input" -o "/app/output" $EXTRA_FLAGS