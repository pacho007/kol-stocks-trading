# The oracle as a long-running service.
#
# It needs to stay up rather than be scheduled: the incremental provider's
# per-wallet cache lives in the process, and that cache is what turns a
# ten-minute cycle into a ten-second one. A restart is cheap but not free —
# it costs one cold cycle — so this image is built to run, not to be cycled.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a source change does not re-install node_modules.
#
# `npm install`, not `npm ci`, and the difference is platform rather than
# preference. npm records optional dependencies per platform, so a lock file
# resolved on Windows simply has no entry for the Linux-only native shims
# (@emnapi/core, @emnapi/runtime and the lru-cache version they pull). `npm ci`
# treats any such gap as the lock being out of sync and refuses to install at
# all — "can only install packages when your package.json and package-lock.json
# are in sync" — even though the lock is perfectly valid for the machine that
# wrote it.
#
# This file previously assumed the lock was "recorded on Linux by CI". Nothing
# enforces that, and the lock in the repo is written by whoever last ran npm
# locally, which here is Windows.
#
# `npm install` resolves against this image's own platform and gets it right
# every time. The cost is that the exact tree is decided at build time rather
# than pinned, which is the correct trade for a worker whose dependencies are
# already version-ranged in package.json.
#
# dev dependencies are deliberately included: the entrypoint runs through tsx,
# which lives in devDependencies, so --omit=dev produces an image that builds
# cleanly and then cannot start.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# The oracle imports the wallet list straight from the app source
# (src/lib/kols.ts), so that has to come along.
COPY tsconfig.json ./
COPY oracle ./oracle
COPY src ./src

# Not root. The process only makes outbound HTTPS calls and signs with a key
# from the environment; it has no reason to own the filesystem.
USER node

# Publishing scores is read-only. Set PUSH_ONCHAIN=0 to run the indexer
# without an oracle key at all — useful for a staging copy.
ENV NODE_ENV=production
ENV CYCLE_SECONDS=30

# No shell wrapper: PID 1 is node, so SIGTERM reaches the process and run.ts's
# handler can finish the cycle in flight instead of being killed mid-batch.
CMD ["npx", "tsx", "oracle/run.ts"]
