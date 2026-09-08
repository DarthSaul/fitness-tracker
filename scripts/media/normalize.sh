#!/usr/bin/env bash
# Normalize licensed exercise clips for the exercise preview feature.
#
#   input : media/raw/<slug>.mp4        (gitignored; copied from the MoveKit purchase,
#                                        renamed to our Exercise.slug)
#   output: media/out/<slug>/demo.mp4   720x720, 30 fps, H.264 High, yuv420p, CRF 27,
#                                        no audio, faststart
#           media/out/<slug>/poster.webp frame at 0.5 s of the normalized clip, q80
#
# Nothing under media/ is ever committed (see .gitignore and
# docs/licenses/movekit.md). Upload the outputs with `pnpm media:upload`.
#
# Usage: pnpm media:normalize            (re-encodes every clip in media/raw)
set -euo pipefail
cd "$(dirname "$0")/../.."

# Homebrew's ffmpeg is built without libwebp, and macOS sips cannot write webp,
# so posters go through Google's cwebp (`brew install webp`).
for tool in ffmpeg ffprobe cwebp; do
  command -v "$tool" >/dev/null || { echo "normalize: $tool not found (brew install ffmpeg webp)" >&2; exit 1; }
done

RAW=media/raw
OUT=media/out

shopt -s nullglob
sources=("$RAW"/*.mp4)
if [ ${#sources[@]} -eq 0 ]; then
  echo "normalize: no .mp4 files in $RAW" >&2
  exit 1
fi

for src in "${sources[@]}"; do
  slug=$(basename "$src" .mp4)
  dir="$OUT/$slug"
  mkdir -p "$dir"

  # The MoveKit sources are 1936x1072 landscape renders with the figure centred
  # horizontally and filling the full frame height, on a plain background.
  # scale=…:increase brings the short edge to 720 (-> 1300x720) and crop=720:720
  # trims empty background from both sides; the vertical is never touched, so no
  # part of the figure is lost. No padding is needed. fps=30 is a no-op for these
  # sources but pins the output rate should a future source differ.
  ffmpeg -y -v error -i "$src" \
    -vf "scale=720:720:force_original_aspect_ratio=increase,crop=720:720,fps=30,format=yuv420p" \
    -c:v libx264 -profile:v high -preset slow -crf 27 \
    -an -movflags +faststart \
    "$dir/demo.mp4"

  # Poster is taken from the normalized clip rather than MoveKit's own still: the
  # supplied posters are 720x402 landscape and would not match the square crop.
  # Frame at 0.5 s, lossless PNG out of ffmpeg, then cwebp at quality 80.
  ffmpeg -y -v error -ss 0.5 -i "$dir/demo.mp4" -frames:v 1 "$dir/poster.png"
  cwebp -quiet -q 80 "$dir/poster.png" -o "$dir/poster.webp"
  rm -f "$dir/poster.png"

  demo_bytes=$(wc -c < "$dir/demo.mp4" | tr -d ' ')
  poster_bytes=$(wc -c < "$dir/poster.webp" | tr -d ' ')
  printf '%-36s demo.mp4 %7d bytes   poster.webp %6d bytes\n' "$slug" "$demo_bytes" "$poster_bytes"
done

echo
echo "Consistency check — every line must be identical apart from the slug:"
for dir in "$OUT"/*/; do
  slug=$(basename "$dir")
  spec=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,width,height,avg_frame_rate,pix_fmt \
    -of csv=p=0 "$dir/demo.mp4")
  printf '%-36s %s\n' "$slug" "$spec"
done
