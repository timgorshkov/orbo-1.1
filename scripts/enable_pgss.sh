#!/bin/bash
set -e

echo "=== Enabling pg_stat_statements ==="

# Check if extension already exists
EXISTS=$(docker exec orbo_postgres psql -U postgres -d orbo -tAc "SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'" 2>/dev/null || true)

if [ "$EXISTS" = "1" ]; then
  echo "pg_stat_statements already enabled"
else
  # Check if the shared_preload_libraries already includes it
  PRELOAD=$(docker exec orbo_postgres psql -U postgres -tAc "SHOW shared_preload_libraries" 2>/dev/null || true)
  echo "Current shared_preload_libraries: $PRELOAD"

  if echo "$PRELOAD" | grep -q "pg_stat_statements"; then
    echo "Library already preloaded, just creating extension..."
    docker exec orbo_postgres psql -U postgres -d orbo -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
    echo "Extension created"
  else
    echo "Need to add pg_stat_statements to shared_preload_libraries"

    # Find postgresql.conf location
    PGCONF=$(docker exec orbo_postgres psql -U postgres -tAc "SHOW config_file" 2>/dev/null)
    echo "PostgreSQL config: $PGCONF"

    # Add to shared_preload_libraries
    if [ -z "$PRELOAD" ]; then
      docker exec orbo_postgres bash -c "echo \"shared_preload_libraries = 'pg_stat_statements'\" >> $PGCONF"
    else
      docker exec orbo_postgres bash -c "sed -i \"s/shared_preload_libraries = '.*'/shared_preload_libraries = '$PRELOAD,pg_stat_statements'/\" $PGCONF"
    fi

    # Add tracking settings
    docker exec orbo_postgres bash -c "cat >> $PGCONF << 'EOF'
pg_stat_statements.max = 5000
pg_stat_statements.track = top
pg_stat_statements.track_utility = on
pg_stat_statements.track_planning = on
EOF"

    echo "Config updated, restarting PostgreSQL..."
    docker restart orbo_postgres
    sleep 5

    # Wait for postgres to be ready
    for i in $(seq 1 30); do
      if docker exec orbo_postgres pg_isready -U postgres 2>/dev/null; then
        echo "PostgreSQL is ready"
        break
      fi
      echo "Waiting for PostgreSQL... ($i)"
      sleep 1
    done

    docker exec orbo_postgres psql -U postgres -d orbo -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
    echo "Extension created after restart"
  fi
fi

echo ""
echo "=== Verification ==="
docker exec orbo_postgres psql -U postgres -d orbo -c "SELECT extname, extversion FROM pg_extension WHERE extname='pg_stat_statements';"

echo ""
echo "=== Running VACUUM ANALYZE on stale tables ==="
docker exec orbo_postgres psql -U postgres -d orbo -c "VACUUM ANALYZE participant_messages;"
echo "VACUUM ANALYZE participant_messages: done"
docker exec orbo_postgres psql -U postgres -d orbo -c "VACUUM ANALYZE activity_events;"
echo "VACUUM ANALYZE activity_events: done"
docker exec orbo_postgres psql -U postgres -d orbo -c "VACUUM ANALYZE group_metrics;"
echo "VACUUM ANALYZE group_metrics: done"
docker exec orbo_postgres psql -U postgres -d orbo -c "VACUUM ANALYZE participants;"
echo "VACUUM ANALYZE participants: done"
docker exec orbo_postgres psql -U postgres -d orbo -c "VACUUM ANALYZE participant_groups;"
echo "VACUUM ANALYZE participant_groups: done"

echo ""
echo "=== All done ==="
