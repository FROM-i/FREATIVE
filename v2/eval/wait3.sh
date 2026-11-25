#!/bin/bash
# 3x 브리지에서 답을 기다리는 요청을 보여 준다. 요청이 더 나오지 않을 때까지 잠깐 기다린다.
D=/tmp/eval/bridge/3x
for i in $(seq 1 190); do
  if [ -e "$D/RESULT.json" ]; then echo FINISHED; tail -2 /tmp/eval/3x.out | cut -c1-500; exit 0; fi
  if ! pgrep -f run3x.mjs >/dev/null; then echo "RUNNER STOPPED"; tail -5 /tmp/eval/3x.out | cut -c1-600; exit 1; fi
  p1=$(for f in $D/*.req.md; do [ -e "$f" ] || continue; id=$(basename $f .req.md); [ -e "$D/$id.res.json" ] || echo $id; done | tr '\n' ' ')
  if [ -n "$p1" ]; then sleep 4
    p2=$(for f in $D/*.req.md; do id=$(basename $f .req.md); [ -e "$D/$id.res.json" ] || echo $id; done | tr '\n' ' ')
    if [ "$p1" = "$p2" ]; then for id in $p2; do echo "$id $(grep "^$id " $D/log.txt | cut -d' ' -f2-) $( [ -e $D/$id.err ] && echo ERR:$(cat $D/$id.err | head -c 80))"; done; exit 0; fi
  fi
  sleep 3
done
echo TIMEOUT
