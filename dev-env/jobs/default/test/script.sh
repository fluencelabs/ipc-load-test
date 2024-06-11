# !/usr/bin/env bash

trap exit SIGINT SIGTERM

while true; do
  for action in cache_init hash_compute lru_update result_packing overall_actor_time arguments_unpacking filter; do
    echo "randomx_batched_duration: $action took $RANDOM"
  done
  echo "randomx_batched_log: cache misses $(($RANDOM % 10)), cache hits $(($RANDOM % 10))"
  sleep 5
done
