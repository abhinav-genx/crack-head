#!/bin/sh
# crack-head installer — downloads a prebuilt, standalone binary (no Node
# required) for your platform from GitHub Releases and puts it on your PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/abhinav-genx/crack-head/main/install.sh | sh
#
# Overrides (env vars):
#   CRACK_HEAD_VERSION      release tag to install (default: latest, e.g. v1.2.0)
#   CRACK_HEAD_INSTALL_DIR  install directory   (default: $HOME/.local/bin)
#   CRACK_HEAD_BASE_URL     release download base (default: GitHub Releases)
set -eu

REPO="abhinav-genx/crack-head"
BIN_NAME="crack-head"
VERSION="${CRACK_HEAD_VERSION:-latest}"
INSTALL_DIR="${CRACK_HEAD_INSTALL_DIR:-$HOME/.local/bin}"
BASE_URL="${CRACK_HEAD_BASE_URL:-https://github.com/$REPO/releases}"

err() { printf 'error: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1" >&2; }

# --- detect platform ---------------------------------------------------------
os=$(uname -s)
arch=$(uname -m)

case "$os" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) err "unsupported OS '$os'. Windows users: download crack-head-windows-x64.exe from https://github.com/$REPO/releases" ;;
esac

case "$arch" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) err "unsupported architecture '$arch'" ;;
esac

asset="${BIN_NAME}-${os}-${arch}"

# --- resolve download URL ----------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  url="$BASE_URL/latest/download/$asset"
else
  url="$BASE_URL/download/$VERSION/$asset"
fi

# --- pick a downloader -------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  # Enforce TLS for https; allow http/file only when a mirror is set explicitly.
  download() {
    case "$1" in
      https://*) curl -fSL --proto '=https' --tlsv1.2 -o "$2" "$1" ;;
      *)         curl -fSL -o "$2" "$1" ;;
    esac
  }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -qO "$2" "$1"; }
else
  err "need curl or wget to download the binary"
fi

# --- download ----------------------------------------------------------------
tmp=$(mktemp "${TMPDIR:-/tmp}/${BIN_NAME}.XXXXXX") || err "could not create temp file"
trap 'rm -f "$tmp"' EXIT INT TERM

info "Downloading $asset ($VERSION)..."
if ! download "$url" "$tmp"; then
  err "download failed: $url
The release asset may not exist yet. See https://github.com/$REPO/releases"
fi

[ -s "$tmp" ] || err "downloaded file is empty: $url"

# --- install -----------------------------------------------------------------
mkdir -p "$INSTALL_DIR" || err "could not create install dir: $INSTALL_DIR"
chmod +x "$tmp"

# Best-effort: strip macOS quarantine so the binary runs without a Gatekeeper prompt.
if [ "$os" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$tmp" 2>/dev/null || true
fi

target="$INSTALL_DIR/$BIN_NAME"
mv -f "$tmp" "$target" || err "could not write $target"
trap - EXIT INT TERM

info "Installed $BIN_NAME to $target"

# --- PATH hint ---------------------------------------------------------------
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    info ""
    info "$INSTALL_DIR is not on your PATH. Add it, e.g.:"
    info "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
    ;;
esac

info ""
info "Run '$BIN_NAME --help' to get started."
