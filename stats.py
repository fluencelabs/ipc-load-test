#!/usr/bin/env python3

results = {}
with open("stats.txt") as f:
    for line in f:
        node, _, t, _, g, _, l = line.split()
        if (g, l) not in results:
            results[(g, l)] = {}
        if node not in results[(g, l)]:
            results[(g, l)][node] = {}
        if t not in results[(g, l)][node]:
            results[(g, l)][node][t] = 0
        results[(g, l)][node][t] += 1

print(len(results))
for (g, l) in results:
    print(g, l, ":")
    for node in results[(g, l)]:
        print("\tnode", node, ":", results[(g, l)][node])