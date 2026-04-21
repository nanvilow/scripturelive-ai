#!/usr/bin/env bash
# Check the expiry date of a base64-encoded code-signing certificate
# (Windows .pfx / Authenticode or macOS .p12 / Developer ID Application).
#
# Inputs (env vars):
#   CERT_LABEL     Human-readable label used in log output (e.g. "Windows Authenticode").
#   CERT_BASE64    Base64-encoded .pfx / .p12 file contents (matches the
#                  WIN_CSC_LINK / MAC_CSC_LINK secret format used by
#                  electron-builder).
#   CERT_PASSWORD  Password protecting the .pfx / .p12 (may be empty).
#   WARN_DAYS      Days-remaining threshold below which we emit a GitHub
#                  Actions ::warning::. Defaults to 60.
#   FAIL_DAYS      Days-remaining threshold below which we emit a GitHub
#                  Actions ::error:: and exit non-zero so the team gets a
#                  workflow-failure email. Defaults to 30.
#
# Behaviour:
#   * If CERT_BASE64 is empty, prints a notice and exits 0 (signing is
#     optional in this pipeline, so a missing secret is not a hard failure).
#   * Otherwise extracts the leaf certificate's `notAfter` with OpenSSL,
#     computes days-to-expiry, and prints + annotates accordingly.
#   * Always writes a one-line `<label>=<days>` summary to $GITHUB_OUTPUT
#     (key is the label, lowercased, with non-alphanumerics replaced by `_`),
#     so callers can aggregate results.
#
# Exit codes:
#   0  Cert valid for more than FAIL_DAYS, OR cert not configured.
#   1  Cert is expired or expires within FAIL_DAYS days (annotated as error).
#   2  Could not parse the certificate (bad base64, wrong password, etc.).

set -uo pipefail

label="${CERT_LABEL:-certificate}"
b64="${CERT_BASE64:-}"
pw="${CERT_PASSWORD:-}"
warn_days="${WARN_DAYS:-60}"
fail_days="${FAIL_DAYS:-30}"

key="$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_' | sed 's/__*/_/g; s/^_//; s/_$//')"

emit_output() {
  local days="$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$days" >> "$GITHUB_OUTPUT"
  fi
}

if [ -z "$b64" ]; then
  echo "::notice title=${label} cert not configured::Secret is empty; skipping expiry check."
  emit_output "unset"
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cert_file="$tmpdir/cert.p12"
pem_file="$tmpdir/cert.pem"

if ! printf '%s' "$b64" | base64 -d > "$cert_file" 2>/dev/null; then
  echo "::error title=${label} cert unreadable::Could not base64-decode the secret. Did you store the file with 'base64 -w 0'?"
  emit_output "unreadable"
  exit 2
fi

# -legacy is required on OpenSSL 3 to read older PKCS#12 files (40-bit RC2 etc.)
# that Keychain Access and many Windows tools still produce. Try modern first,
# fall back to legacy.
if ! openssl pkcs12 -in "$cert_file" -clcerts -nokeys -passin "pass:${pw}" -out "$pem_file" 2>/dev/null; then
  if ! openssl pkcs12 -in "$cert_file" -clcerts -nokeys -passin "pass:${pw}" -legacy -out "$pem_file" 2>/dev/null; then
    echo "::error title=${label} cert unreadable::OpenSSL could not open the PKCS#12 bundle. Wrong password, or the file is not a .pfx/.p12."
    emit_output "unreadable"
    exit 2
  fi
fi

not_after="$(openssl x509 -in "$pem_file" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
if [ -z "$not_after" ]; then
  echo "::error title=${label} cert unreadable::Could not extract notAfter from the leaf certificate."
  emit_output "unreadable"
  exit 2
fi

# Convert to epoch. GNU date understands the OpenSSL format directly.
# BSD date (macOS) needs an explicit format, but GitHub-hosted runners are
# Ubuntu so GNU date is fine; we still try BSD as a fallback for completeness.
expiry_epoch="$(date -u -d "$not_after" +%s 2>/dev/null || date -u -j -f '%b %e %T %Y %Z' "$not_after" +%s 2>/dev/null || true)"
if [ -z "$expiry_epoch" ]; then
  echo "::error title=${label} cert unreadable::Could not parse expiry date '${not_after}'."
  emit_output "unreadable"
  exit 2
fi

now_epoch="$(date -u +%s)"
days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

echo "${label}: notAfter=${not_after} (${days_left} day(s) remaining)"
emit_output "$days_left"

if [ "$days_left" -lt 0 ]; then
  echo "::error title=${label} certificate has EXPIRED::Expired ${days_left#-} day(s) ago on ${not_after}. The next release will ship UNSIGNED. Rotate the secret immediately -- see .github/workflows/README.md."
  exit 1
fi

# Use `<=` (not `<`) so the task's "at least 30 days before" requirement is
# met: a cert with exactly 30 days remaining already fails the run.
if [ "$days_left" -le "$fail_days" ]; then
  echo "::error title=${label} certificate expires in ${days_left} day(s)::Expires on ${not_after} (threshold: ${fail_days} days or fewer). Rotate the secret now -- see .github/workflows/README.md."
  exit 1
fi

if [ "$days_left" -le "$warn_days" ]; then
  echo "::warning title=${label} certificate expires in ${days_left} day(s)::Expires on ${not_after} (warn threshold: ${warn_days} days or fewer). Plan a rotation soon -- see .github/workflows/README.md."
  exit 0
fi

echo "::notice title=${label} certificate OK::${days_left} day(s) until expiry (${not_after})."
exit 0
