#!/usr/bin/env bash
# Start a single-node MongoDB replica set for development.
#
# v3.1 spec 16.2: dev MongoDB must be a replica set from day one so transaction
# behavior matches production. A standalone mongod is not supported.
#
# Usage:
#   deno task db:dev
#   MONGO_PORT=27019 MONGO_DBPATH=/tmp/opencode/ansoo-mongo-rs scripts/mongo-dev.sh
#
# Then set in back/.env:
#   MONGO_URL=mongodb://127.0.0.1:27019/?replicaSet=rs0
#
# Defaults deliberately avoid port 27017 so a system standalone mongod does not
# have to be stopped or reconfigured.

set -euo pipefail

MONGO_PORT="${MONGO_PORT:-27019}"
MONGO_DBPATH="${MONGO_DBPATH:-/tmp/opencode/ansoo-mongo-rs}"
MONGO_LOG="${MONGO_LOG:-/tmp/opencode/ansoo-mongo-rs.log}"
MONGO_REPLSET="${MONGO_REPLSET:-rs0}"

# Local proxy environment variables can break 127.0.0.1 access (seen in this
# workspace). Unset them for local mongosh calls only.
mongo() {
  env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    -u http_proxy -u https_proxy -u all_proxy \
    mongosh --quiet --host 127.0.0.1 --port "$MONGO_PORT" "$@"
}

mkdir -p "$MONGO_DBPATH"

if mongo --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then
  echo "MongoDB already responding on 127.0.0.1:${MONGO_PORT}; reusing it."
else
  echo "Starting mongod on 127.0.0.1:${MONGO_PORT} (dbpath ${MONGO_DBPATH}, replicaSet ${MONGO_REPLSET})."
  mongod \
    --dbpath "$MONGO_DBPATH" \
    --port "$MONGO_PORT" \
    --bind_ip 127.0.0.1 \
    --replSet "$MONGO_REPLSET" \
    --logpath "$MONGO_LOG" \
    --fork
fi

for _ in $(seq 1 30); do
  if mongo --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! mongo --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then
  echo "ERROR: mongod did not become reachable on port ${MONGO_PORT}. See ${MONGO_LOG}." >&2
  exit 1
fi

if mongo --eval 'rs.status().ok' >/dev/null 2>&1; then
  echo "Replica set already initiated."
else
  echo "Initiating replica set ${MONGO_REPLSET}."
  if ! mongo --eval "rs.initiate({_id: '${MONGO_REPLSET}', members: [{_id: 0, host: '127.0.0.1:${MONGO_PORT}'}]})"; then
    echo "ERROR: could not initiate a replica set. If a standalone mongod owns port ${MONGO_PORT}, stop it or set MONGO_PORT to a free port." >&2
    exit 1
  fi
fi

for _ in $(seq 1 60); do
  if mongo --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q true; then
    echo
    echo "MongoDB replica set is PRIMARY."
    echo "MONGO_URL=mongodb://127.0.0.1:${MONGO_PORT}/?replicaSet=${MONGO_REPLSET}"
    echo "DB_NAME=ansoo"
    exit 0
  fi
  sleep 1
done

echo "ERROR: replica set did not elect a primary within 60 seconds. See ${MONGO_LOG}." >&2
exit 1
