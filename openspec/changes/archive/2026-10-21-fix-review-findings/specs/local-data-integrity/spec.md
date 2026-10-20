# Spec Delta

## MODIFIED Requirements

### Requirement: 导入数据必须先校验后写盘
系统 SHALL 在导入 JSON 前校验其结构，校验不通过时拒绝导入、不改动现有数据、不写盘。导入前的覆盖确认 SHALL 说明现有记录与草稿都会被替换。

#### Scenario: 导入结构非法的数据
- **WHEN** 导入的 JSON 中 `sessions` 不是数组，或某条记录缺 `id`、`date` 格式不对、动作缺 `sets`，或 `rir`/`maxPain`/`durationMin` 不是数字
- **THEN** 显示失败原因并说明是哪一项不合法，现有记录保持不变

#### Scenario: 导入结构合法的数据
- **WHEN** 导入的 JSON 通过全部结构校验且用户确认覆盖
- **THEN** 现有记录与草稿被替换，进度页重新渲染并提示导入成功

#### Scenario: 覆盖确认说明草稿也会被替换
- **WHEN** 用户触发导入并看到覆盖确认
- **THEN** 确认提示里说明现有记录与草稿都会被替换，而不只提到记录
