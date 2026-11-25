#!/bin/bash
# 답을 기다리는 호출 하나를 집는다. 사용: claim6.sh lead|support  → "ID" 한 줄, 없으면 최대 90초 기다린 뒤 NONE, 끝났으면 FINISHED
D=/tmp/eval/bridge/6x; T=$1
for i in $(seq 1 30); do
  [ -e "$D/RESULT.json" ] && { echo FINISHED; exit 0; }
  pgrep -f run6x.mjs >/dev/null || { echo FINISHED; exit 0; }
  while read -r id label role tier rest; do
    [ "$tier" = "$T" ] || continue
    [ -e "$D/$id.res.json" ] && continue
    if [ -e "$D/$id.err" ] && [ -d "$D/$id.lock" ] && [ "$D/$id.err" -nt "$D/$id.lock" ]; then rmdir "$D/$id.lock" 2>/dev/null; fi
    if mkdir "$D/$id.lock" 2>/dev/null; then echo "$id"; [ -e "$D/$id.err" ] && echo "앞선 답은 JSON이 깨져 버려졌다: $(head -c 120 $D/$id.err)"; exit 0; fi
  done < "$D/log.txt"
  sleep 3
done
echo NONE
