#!/usr/bin/env fish

# Loop through docker logs and pipe them to awk for processing
for n in (seq 0 11)
    docker logs --since "2024-05-16T16:12:48.000000Z" fendermint-node$n &| grep "Cache" | sed "s/^/$n /"
end > stats.txt
