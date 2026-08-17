#!/usr/bin/env bash
# Start/stop the self-contained Postgres 16 + pgvector instance used by this project.
# No sudo/system service required: binaries under tools/pg16, data under pgdata16.
set -e

PREFIX=/home/sujitha-17254/tools/pg16/usr/lib/postgresql/16
DATADIR=/home/sujitha-17254/pgdata16
SOCKDIR=/home/sujitha-17254/pgsock16
PORT=5544

export LD_LIBRARY_PATH="$PREFIX/lib:$LD_LIBRARY_PATH"

case "$1" in
  start)
    mkdir -p "$SOCKDIR"
    "$PREFIX/bin/pg_ctl" -D "$DATADIR" -l "$DATADIR/log.txt" \
      -o "-p $PORT -k $SOCKDIR -c dynamic_library_path=$PREFIX/lib" start
    ;;
  stop)
    "$PREFIX/bin/pg_ctl" -D "$DATADIR" -m fast stop
    ;;
  status)
    "$PREFIX/bin/pg_ctl" -D "$DATADIR" status
    ;;
  psql)
    shift
    "$PREFIX/bin/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d fake_review "$@"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|psql}"
    exit 1
    ;;
esac
