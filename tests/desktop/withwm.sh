#!/bin/bash
openbox >/dev/null 2>&1 &
sleep 1
node "$@"
