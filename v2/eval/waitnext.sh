#!/bin/bash
# 주어진 ID의 답이 쓰이고, 다음 요청이 나오거나 실행이 끝날 때까지 기다린다 (최대 9분)
D=/tmp/eval/bridge/1x-run; last=$1
for i in $(seq 1 108); do
  if [ -e "$D/RESULT.json" ]; then echo "FINISHED"; tail -1 /tmp/eval/1x.out | cut -c1-400; exit 0; fi
  if [ -e "$D/$last.res.json" ] && [ ! -e "$D/$last.err" -o -e "$D/$last.res.json" ]; then
    sleep 4
    p=$(for f in $D/*.req.md; do id=$(basename $f .req.md); [ -e "$D/$id.res.json" ] || echo "$id($(grep "^$id " $D/log.txt | cut -d' ' -f3,5))"; done)
    if [ -n "$p" ] || [ -e "$D/RESULT.json" ]; then echo "PENDING: $p"; [ -e "$D/RESULT.json" ] && echo FINISHED; exit 0; fi
  fi
  sleep 5
done
echo "TIMEOUT waiting after $last"; ls $D/*.err 2>/dev/null
