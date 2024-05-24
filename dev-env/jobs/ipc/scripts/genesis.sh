#! /usr/bin/env bash
docker run --rm -e FM_NETWORK=test --user ${UID} -v ./keys:/keys -v ./files:/files -v ./scripts:/scripts --entrypoint /scripts/entrypoint/fendermint.sh ghcr.io/consensus-shipyard/fendermint
