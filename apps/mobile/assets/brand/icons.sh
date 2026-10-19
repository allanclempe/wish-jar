#!/usr/bin/env bash
# Builds every icon from jar.svg and background.svg (WJ-77). Needs
# rsvg-convert and ImageMagick 7. Run from anywhere:
#   apps/mobile/assets/brand/icons.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
assets="$here/.."
alexa="$here/alexa"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$alexa"

# The jar on the background, `size` square, the jar `jar` tall in the middle.
on_background() {
  local size=$1 jar=$2 out=$3
  rsvg-convert -w "$size" -h "$size" "$here/background.svg" -o "$tmp/bg.png"
  rsvg-convert -h "$jar" "$here/jar.svg" -o "$tmp/jar.png"
  magick "$tmp/bg.png" "$tmp/jar.png" -gravity center -composite -alpha off -strip "$out"
}

# The jar alone on transparency, `size` square, the jar `jar` tall.
on_clear() {
  local size=$1 jar=$2 out=$3
  rsvg-convert -h "$jar" "$here/jar.svg" -o "$tmp/jar.png"
  magick -size "${size}x${size}" xc:none "$tmp/jar.png" -gravity center -composite -strip "$out"
}

# The app icon (iOS takes no transparency) and the Alexa skill's two, which
# ask for about 15% padding on each side and show the icon in a circle.
on_background 1024 660 "$assets/icon.png"
on_background 512 330 "$alexa/large-512.png"
on_background 108 72 "$alexa/small-108.png"

# The site's favicon: the jar alone, as big as it fits.
on_clear 48 46 "$assets/favicon.png"

# Android's adaptive icon: the jar inside the middle 66% that every mask
# keeps, the sky behind it, and a monochrome version of its outline and face
# for themed icons.
on_clear 512 290 "$assets/android-icon-foreground.png"
rsvg-convert -w 512 -h 512 "$here/background.svg" -o "$assets/android-icon-background.png"
# Its lines in white, every fill dropped, so the mask keeps the face.
sed -e 's/#3D2C2E/#FFFFFF/g; s/#E0A800/#FFFFFF/g' \
  -e 's/fill="#\(E8F7FD\|FFC93C\|FFF0B3\|FF9EB5\|FF8A3D\|FFF6C8\)"/fill="none"/g' \
  "$here/jar.svg" >"$tmp/mono.svg"
rsvg-convert -h 250 "$tmp/mono.svg" -o "$tmp/mono.png"
magick -size 432x432 xc:none "$tmp/mono.png" -gravity center -composite -strip "$assets/android-icon-monochrome.png"
