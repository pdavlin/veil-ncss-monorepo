#!/usr/bin/env bash
# transcode-motion — convert the source motion masters in veilengineering-motion-assets/
# into web-ready files under sites/veil/src/assets/video/ (and asset img/ for the GIF card).
#
# Requires ffmpeg in PATH.
#
# Usage:
#   ./tools/transcode-motion.sh
#
# Outputs:
#   /assets/video/home-bw.mp4          home hero
#   /assets/video/home-bw.jpg          poster frame
#   /assets/video/omaha.mp4            about hero
#   /assets/video/omaha.jpg            poster
#   /assets/video/turbines.mp4         sustainability hero
#   /assets/video/turbines.jpg         poster
#   /assets/video/clock-tower-strauss.mp4   strauss portfolio detail
#   /assets/video/clock-tower-strauss.jpg   poster
#   /assets/img/projects/rtg-medical-headquarters/card.gif
#   /assets/img/projects/rtg-medical-headquarters/golf-sim-blackout.gif
#
# Each video target is muted (no audio), H.264 baseline, ~1080p max, faststart for streaming.

set -euo pipefail

SRC_DIR="veilengineering-motion-assets"
VIDEO_OUT="sites/veil/src/assets/video"
IMG_OUT="sites/veil/src/assets/img/projects/rtg-medical-headquarters"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install with: brew install ffmpeg (macOS) or apt install ffmpeg" >&2
  exit 1
fi

mkdir -p "$VIDEO_OUT" "$IMG_OUT"

transcode_video () {
  local source="$1"
  local target="$2"
  local label="$3"

  if [[ ! -f "$source" ]]; then
    echo "  - missing source: $source" >&2
    return 0
  fi

  echo "transcoding ${label}…"
  # Web-ready: H.264 high profile, no audio, max 1080p, faststart for streaming start.
  ffmpeg -y -hide_banner -loglevel warning \
    -i "$source" \
    -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
    -c:v libx264 -profile:v high -preset slow -crf 24 -movflags +faststart \
    -an \
    "${VIDEO_OUT}/${target}.mp4"

  # Poster frame at 1 second.
  ffmpeg -y -hide_banner -loglevel warning \
    -ss 00:00:01 -i "$source" -frames:v 1 -q:v 4 \
    "${VIDEO_OUT}/${target}.jpg"

  echo "  -> ${target}.mp4 + ${target}.jpg"
}

# Map per user's instructions
transcode_video "${SRC_DIR}/Home Page BW.mp4" "home-bw" "home hero"
transcode_video "${SRC_DIR}/Omaha.mov" "omaha" "about hero"
transcode_video "${SRC_DIR}/Turbines.mov" "turbines" "sustainability hero"
transcode_video "${SRC_DIR}/clock-tower-university-nebrask_H264HD1080.mp4" "clock-tower-strauss" "Strauss page"

# RTG golf sim GIF: keep as GIF for in-portfolio card, also output an mp4 for the carousel as a smaller alt.
RTG_SRC="${SRC_DIR}/RTG Golf Sim Blackout Bar GIF - Reduced.gif"
if [[ -f "$RTG_SRC" ]]; then
  echo "compressing RTG GIF…"
  # Re-encode the GIF to drop weight; keep dimensions reasonable.
  ffmpeg -y -hide_banner -loglevel warning \
    -i "$RTG_SRC" \
    -vf "fps=15,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=floyd_steinberg" \
    "${IMG_OUT}/card.gif"

  # Duplicate as the carousel media reference.
  cp "${IMG_OUT}/card.gif" "${IMG_OUT}/golf-sim-blackout.gif"

  # Also produce an MP4 for the Merriam carousel reference.
  ffmpeg -y -hide_banner -loglevel warning \
    -i "$RTG_SRC" \
    -movflags +faststart -pix_fmt yuv420p \
    -vf "scale=720:-2" \
    -an \
    "${VIDEO_OUT}/rtg-golf-sim.mp4"

  echo "  -> projects/rtg-medical-headquarters/{card,golf-sim-blackout}.gif"
  echo "  -> rtg-golf-sim.mp4"
else
  echo "  - missing RTG GIF: $RTG_SRC" >&2
fi

echo "done. inspect outputs in $VIDEO_OUT and $IMG_OUT."
