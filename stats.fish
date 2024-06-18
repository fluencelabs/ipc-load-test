#!/usr/bin/env fish

# Loop through docker logs and pipe them to awk for processing
for n in (seq 0 11)
    docker logs fendermint-node$n &| grep "Cache" | sed "s/^/$n /"
end > stats.txt
