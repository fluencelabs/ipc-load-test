#!/usr/bin/bash

PRIVATE_KEY=$1
N=$2

if [ -z "$PRIVATE_KEY" ] || [ -z "$N" ]; then
  echo "Usage: $0 <sender_private_key> <n>"
  exit 1
fi

ADDRS=$(cast w new -n $N -j)

for i in $(seq 1 $N); do
    ACC_ADDR=$(echo $ADDRS | jq -r ".[$i-1].address")
    ACC_PK=$(echo $ADDRS | jq -r ".[$i-1].private_key")

    echo "Account $i: $ACC_ADDR"
    echo "Private key: $ACC_PK"

    cast send -r "127.0.0.1:8545" \
              --private-key $PRIVATE_KEY \
              $ACC_ADDR \
              --value "50ether" &>/dev/null

    sleep 5

    BALANCE=$(cast balance -r "127.0.0.1:8545" -e $ACC_ADDR)
    echo "Balance: $BALANCE"
done

