# The oracle as a long-running service.
#
# It needs to stay up rather than be scheduled: the incremental provider's
# per-wallet cache lives in the process, and that cache is what turns a
# ten-minute cycle into a ten-second one. A restart is cheap but not free —
# it costs one cold cycle — so this image is built to run, not to be cycled.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a source change does not re-install node_modules.
# package-lock.json is recorded on Linux by CI; npm ci is correct here.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

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
