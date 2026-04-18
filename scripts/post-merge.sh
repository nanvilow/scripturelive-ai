#!/bin/bash
set -e

# Use --no-frozen-lockfile so a merged task that bumps a dependency without
# regenerating pnpm-lock.yaml still succeeds. The lockfile gets regenerated
# in the same step, so the working tree stays consistent.
pnpm install --no-frozen-lockfile

pnpm --filter db push
