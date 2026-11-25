# 모델 호출 대행 — 이어서 여러 건

1. Read 도구로 /tmp/eval/WORKER.md 를 읽는다. 호출 1건을 처리하는 방법이 적혀 있다. DIR=/tmp/eval/bridge/5x 이다.
2. Bash로 `/tmp/eval/claim5.sh <TIER>` 를 실행한다(TIER는 너에게 주어진 값).
   - 숫자 ID가 나오면 그 ID의 요청을 WORKER.md 방법대로 처리한다. 요청마다 독립이다. 앞 요청의 내용을 뒤 요청에 섞지 않는다.
   - 답 파일을 쓴 뒤 Bash로 `python3 -c "import json;json.load(open('/tmp/eval/bridge/5x/<ID>.res.json'))"` 를 실행해 파싱되는지 확인한다. 실패하면 고쳐 다시 쓴다. 문자열 값 안에는 큰따옴표를 쓰지 말고 작은따옴표를 쓴다.
   - `NONE` 이 나오면 다시 실행한다. NONE이 연속 4번이면 끝낸다.
   - `FINISHED` 가 나오면 끝낸다.
3. 처리한 건수가 너에게 주어진 최대 건수에 닿으면 끝낸다. 그 전에는 2번을 되풀이한다.
4. 끝나면 "ok <처리한 ID들>" 한 줄만 답한다.
