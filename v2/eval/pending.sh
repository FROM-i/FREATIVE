#!/bin/bash
# 아직 답이 없는 요청과 진행 상황
for d in /tmp/eval/bridge/1x-run /tmp/eval/bridge/2x; do
  [ -d "$d" ] || continue
  for f in "$d"/*.req.md; do [ -e "$f" ] || continue; id=$(basename "$f" .req.md); [ -e "$d/$id.res.json" ] || echo "PENDING $d/$id $(grep "^$id " "$d/log.txt" | cut -d' ' -f2-)$( [ -e "$d/$id.err" ] && echo ' !!재요청: '"$(cat "$d/$id.err")" )"; done
  echo "-- $(basename $d): 요청 $(ls "$d"/*.req.md 2>/dev/null | wc -l) · 답 $(ls "$d"/*.res.json 2>/dev/null | wc -l) $( [ -e "$d/RESULT.json" ] && echo '· 완료')"
done
tail -2 /tmp/eval/1x.out 2>/dev/null; tail -2 /tmp/eval/2x.out 2>/dev/null
