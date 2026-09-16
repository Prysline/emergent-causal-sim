from pathlib import Path

path=Path('docs/architecture.md')
s=path.read_text()
old="""Caller 已明確選定的 `targetAgent / targetObject / targetTile / job / destination / carrier` 必須優先保留；不得因 factory fallback 靜默換掉 explicit social target。

## 3. Decision option providers
"""
new="""Caller 已明確選定的 `targetAgent / targetObject / targetTile / job / destination / carrier` 必須優先保留；不得因 factory fallback 靜默換掉 explicit social target。

### Canonical decision baseline

Core `E.baseUtilityForAction(agent, actionKind)` 持有既有 core candidate 的 deterministic species-aware base utility。Initial chooser 與 soft reconsideration 必須共用這一層 baseline，不得各自保存平行的 Human / Cat needs formula。

Initial chooser 可以在 canonical baseline 上加入 selection noise；這層 noise 不屬於 base utility。Soft reconsideration 刻意不重用 chooser noise，而是在同一 baseline 上套用 minimum hold、switch margin、derived commitment、protected workflow 與 shared derived influence，避免角色只因 evaluator 換了一把評分尺就在 world / needs 幾乎未變時推翻剛建立的 Intent。

Canonical baseline provider 不接管所有 candidate policy。Candidate availability、target selection、Social Bid responder-specific utility、Memory-derived target influence 與 subsystem-specific provenance 仍由各自 owner 負責；只有兩條 deliberation path 共用的 deterministic base motivation 屬於 core baseline ownership。

## 3. Decision option providers
"""
if s.count(old)!=1:
    raise SystemExit(f'architecture marker mismatch: {s.count(old)}')
path.write_text(s.replace(old,new,1))
