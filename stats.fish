#!/usr/bin/env fish

# Define an awk script to process lines, convert units, and calculate statistics
set awkScript "
function convertToMicroseconds(value, unit) {
    # Convert value to microseconds based on the unit
    if (unit == \"ms\") {
        return value * 1000; # Milliseconds to microseconds
    } else if (unit == \"ns\") {
        return value / 1000; # Nanoseconds to microseconds
    } else if (unit == \"µs\") {
        return value; # Microseconds to microseconds
    } else if (unit == \"s\") {
        return value * 1000000; # Seconds to microseconds
    } else {
        exit 1;
    }
}

/^run_randomx_batched:/ {
    # Extract time value and unit, then convert to microseconds
    if (match(\$0, /took ([0-9.]+)([a-zµ]+)/, arr)) {
        timeValue = convertToMicroseconds(arr[1], arr[2]);
        process = \$2;

        print process, timeValue
    }
}

BEGIN {
    print \"process\", \"time(us)\"
}
"

# Loop through docker logs and pipe them to awk for processing
for n in (seq 0 6)
    docker logs fendermint-node$n 
end \
&| awk "$awkScript" \
| datamash --headers -t " " --sort -g 1 count 2 mean 2 perc:90 2 perc:95 2 perc:99 2 